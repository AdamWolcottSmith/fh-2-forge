/**
 * FH-2 SysEx communication layer (transports + .syx file I/O).
 *
 * The wire protocol primitives live in `protocol.ts` (verified 1:1 against the
 * official tool). The field-level config codec lives in `codec.ts`. This module
 * ties them to a MIDI transport.
 *
 * Two transports share the `MidiTransport` interface:
 *   - `MockTransport`   — in-memory, for development and tests (no hardware).
 *   - `WebMidiTransport`— real device over the Web MIDI API.
 * A future Tauri build adds a native transport behind the same interface.
 */
import { createDefaultConfig } from '$lib/config/defaults';
import type { FH2Config } from '$lib/types/fh2';
import { decodeConfig, encodeConfig } from './codec';
import { decodePreset, encodePreset, createEmptyPreset, type PresetModel } from './preset-codec';
import {
	classifyMessage,
	requestConfigMessage,
	requestPresetMessage,
	requestVersionMessage,
	saveToFlashMessage
} from './protocol';

export type ConnectionState =
	| { status: 'disconnected' }
	| { status: 'connecting' }
	| { status: 'mock' }
	| { status: 'connected'; inputName: string; outputName: string; firmware?: string };

export interface MidiTransport {
	connect(): Promise<ConnectionState>;
	disconnect(): Promise<void>;
	requestVersion(): Promise<string>;
	requestConfig(): Promise<FH2Config>;
	sendConfig(config: FH2Config): Promise<void>;
	saveToFlash(): Promise<void>;
	requestPreset(): Promise<PresetModel>;
	sendPreset(preset: PresetModel): Promise<void>;
}

/** How long to wait for a device reply before giving up. */
const REPLY_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Mock transport — used for development and tests
// ---------------------------------------------------------------------------

export class MockTransport implements MidiTransport {
	private stored: FH2Config = createDefaultConfig('Mock Device Config');
	private storedPreset: PresetModel = createEmptyPreset();

	async connect(): Promise<ConnectionState> {
		return { status: 'mock' };
	}
	async disconnect(): Promise<void> {}
	async requestVersion(): Promise<string> {
		return `mock fw (config v${this.stored.version})`;
	}
	async requestConfig(): Promise<FH2Config> {
		return structuredClone(this.stored);
	}
	async sendConfig(config: FH2Config): Promise<void> {
		this.stored = structuredClone(config);
	}
	async saveToFlash(): Promise<void> {}
	async requestPreset(): Promise<PresetModel> {
		return structuredClone(this.storedPreset);
	}
	async sendPreset(preset: PresetModel): Promise<void> {
		this.storedPreset = structuredClone(preset);
	}
}

// ---------------------------------------------------------------------------
// Web MIDI transport
// ---------------------------------------------------------------------------

export class WebMidiTransport implements MidiTransport {
	private access?: MIDIAccess;
	private input?: MIDIInput;
	private output?: MIDIOutput;

	/** Resolvers for the in-flight request, keyed by expected reply kind. */
	private pendingConfig?: (payload: Uint8Array) => void;
	private pendingPreset?: (payload: Uint8Array) => void;
	private pendingVersion?: (version: string) => void;

	async connect(): Promise<ConnectionState> {
		if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
			throw new Error('Web MIDI is not available in this browser. Try Chrome or Edge.');
		}
		this.access = await navigator.requestMIDIAccess({ sysex: true });
		const { input, output } = findFH2(this.access);
		if (!input || !output) {
			throw new Error('FH-2 not found. Connect the module over USB and try again.');
		}
		this.input = input;
		this.output = output;
		this.input.onmidimessage = (e) => {
			if (e.data) this.handleMessage(new Uint8Array(e.data));
		};
		return { status: 'connected', inputName: input.name ?? 'FH-2', outputName: output.name ?? 'FH-2' };
	}

	async disconnect(): Promise<void> {
		if (this.input) this.input.onmidimessage = null;
		this.input = undefined;
		this.output = undefined;
	}

	private handleMessage(data: Uint8Array): void {
		const msg = classifyMessage(data);
		if (!msg) return;
		if (msg.kind === 'config' && this.pendingConfig) {
			const resolve = this.pendingConfig;
			this.pendingConfig = undefined;
			resolve(msg.payload);
		} else if (msg.kind === 'preset' && this.pendingPreset) {
			const resolve = this.pendingPreset;
			this.pendingPreset = undefined;
			resolve(msg.payload);
		} else if (msg.kind === 'version' && this.pendingVersion) {
			const resolve = this.pendingVersion;
			this.pendingVersion = undefined;
			resolve(msg.version);
		}
	}

	private send(bytes: Uint8Array): void {
		if (!this.output) throw new Error('Not connected to an FH-2.');
		this.output.send(bytes);
	}

	async requestVersion(): Promise<string> {
		const reply = new Promise<string>((resolve, reject) => {
			this.pendingVersion = resolve;
			setTimeout(() => {
				if (this.pendingVersion) {
					this.pendingVersion = undefined;
					reject(new Error('Timed out waiting for version reply.'));
				}
			}, REPLY_TIMEOUT_MS);
		});
		this.send(requestVersionMessage());
		return reply;
	}

	async requestConfig(): Promise<FH2Config> {
		const reply = new Promise<Uint8Array>((resolve, reject) => {
			this.pendingConfig = resolve;
			setTimeout(() => {
				if (this.pendingConfig) {
					this.pendingConfig = undefined;
					reject(new Error('Timed out waiting for config dump.'));
				}
			}, REPLY_TIMEOUT_MS);
		});
		this.send(requestConfigMessage());
		return decodeConfig(await reply);
	}

	async sendConfig(config: FH2Config): Promise<void> {
		this.send(encodeConfig(config));
	}

	async requestPreset(): Promise<PresetModel> {
		const reply = new Promise<Uint8Array>((resolve, reject) => {
			this.pendingPreset = resolve;
			setTimeout(() => {
				if (this.pendingPreset) {
					this.pendingPreset = undefined;
					reject(new Error('Timed out waiting for preset dump.'));
				}
			}, REPLY_TIMEOUT_MS);
		});
		this.send(requestPresetMessage());
		return decodePreset(await reply);
	}

	async sendPreset(preset: PresetModel): Promise<void> {
		this.send(encodePreset(preset));
	}

	async saveToFlash(): Promise<void> {
		this.send(saveToFlashMessage());
	}
}

/** Locate the FH-2's MIDI input/output ports by name heuristic. */
function findFH2(access: MIDIAccess): { input?: MIDIInput; output?: MIDIOutput } {
	const matches = (name: string | null) => !!name && /fh-?2|expert\s*sleepers/i.test(name);
	let input: MIDIInput | undefined;
	let output: MIDIOutput | undefined;
	for (const port of access.inputs.values()) if (matches(port.name)) input = port;
	for (const port of access.outputs.values()) if (matches(port.name)) output = port;
	return { input, output };
}

// ---------------------------------------------------------------------------
// .syx file import/export
// ---------------------------------------------------------------------------

/** Serialise a config to a complete `.syx` config-dump blob. */
export function configToSyx(config: FH2Config): Uint8Array {
	return encodeConfig(config);
}

/** Parse a `.syx` config-dump blob back into a config. */
export function syxToConfig(bytes: Uint8Array): FH2Config {
	return decodeConfig(extractConfigPayload(bytes));
}

/** Given a full config-dump message (F0..F7), return just the config payload. */
export function extractConfigPayload(bytes: Uint8Array): Uint8Array {
	const msg = classifyMessage(bytes);
	if (msg?.kind === 'config') return msg.payload;
	throw new Error('Not a valid FH-2 config dump (.syx) file.');
}
