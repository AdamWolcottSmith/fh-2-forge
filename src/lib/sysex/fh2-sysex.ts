/**
 * FH-2 SysEx communication layer.
 *
 * STATUS: mock-only. The real byte-level message formats must be
 * reverse-engineered from the official tool (expertsleepersltd/FH-2_tools,
 * `fh2_config_tool.html`) before `encodeConfig`/`decodeConfig` are wired to
 * hardware. Every function below is shaped for the real implementation but
 * currently round-trips through an in-memory mock so the UI can be built
 * without a device.
 *
 * Transport note: the browser path uses the Web MIDI API. A future Tauri build
 * will swap `MidiTransport` for a native backend with the same interface.
 */
import { createDefaultConfig } from '$lib/config/defaults';
import type { FH2Config } from '$lib/types/fh2';

/** Expert Sleepers manufacturer SysEx ID. @verify against the official tool. */
export const EXPERT_SLEEPERS_SYSEX_ID = [0x00, 0x21, 0x27] as const;

export type ConnectionState =
	| { status: 'disconnected' }
	| { status: 'connecting' }
	| { status: 'mock' }
	| { status: 'connected'; inputName: string; outputName: string; firmware?: number };

export interface MidiTransport {
	connect(): Promise<ConnectionState>;
	disconnect(): Promise<void>;
	requestVersion(): Promise<number>;
	requestConfig(): Promise<FH2Config>;
	sendConfig(config: FH2Config): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mock transport — used for development and tests
// ---------------------------------------------------------------------------

export class MockTransport implements MidiTransport {
	private stored: FH2Config = createDefaultConfig('Mock Device Config');

	async connect(): Promise<ConnectionState> {
		return { status: 'mock' };
	}
	async disconnect(): Promise<void> {}
	async requestVersion(): Promise<number> {
		return this.stored.version;
	}
	async requestConfig(): Promise<FH2Config> {
		return structuredClone(this.stored);
	}
	async sendConfig(config: FH2Config): Promise<void> {
		this.stored = structuredClone(config);
	}
}

// ---------------------------------------------------------------------------
// Web MIDI transport — skeleton, not yet feature-complete
// ---------------------------------------------------------------------------

export class WebMidiTransport implements MidiTransport {
	private access?: MIDIAccess;
	private input?: MIDIInput;
	private output?: MIDIOutput;

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
		return { status: 'connected', inputName: input.name ?? 'FH-2', outputName: output.name ?? 'FH-2' };
	}

	async disconnect(): Promise<void> {
		this.input = undefined;
		this.output = undefined;
	}

	async requestVersion(): Promise<number> {
		throw new Error('Not implemented: requires reverse-engineered version request message.');
	}

	async requestConfig(): Promise<FH2Config> {
		throw new Error('Not implemented: requires reverse-engineered config dump request.');
	}

	async sendConfig(_config: FH2Config): Promise<void> {
		throw new Error('Not implemented: requires reverse-engineered config encoder.');
	}
}

/** Locate the FH-2's MIDI input/output ports by name heuristic. @verify name. */
function findFH2(access: MIDIAccess): { input?: MIDIInput; output?: MIDIOutput } {
	const matches = (name: string | null) => !!name && /fh-?2|expert\s*sleepers/i.test(name);
	let input: MIDIInput | undefined;
	let output: MIDIOutput | undefined;
	for (const port of access.inputs.values()) if (matches(port.name)) input = port;
	for (const port of access.outputs.values()) if (matches(port.name)) output = port;
	return { input, output };
}

// ---------------------------------------------------------------------------
// Codec — TODO: real implementation reverse-engineered from the official tool
// ---------------------------------------------------------------------------

/** Serialise a config into one or more SysEx messages. @todo real format. */
export function encodeConfig(_config: FH2Config): Uint8Array[] {
	throw new Error('encodeConfig: SysEx format not yet implemented.');
}

/** Parse a complete SysEx config dump back into an FH2Config. @todo real format. */
export function decodeConfig(_messages: Uint8Array[]): FH2Config {
	throw new Error('decodeConfig: SysEx format not yet implemented.');
}

/** Route a single incoming SysEx packet to the right decoder. @todo. */
export function parseIncomingSysex(_data: Uint8Array): void {
	// Will accumulate multi-packet dumps and emit a parsed FH2Config.
}

// ---------------------------------------------------------------------------
// .syx file import/export (binary, round-trip with official tools)
// ---------------------------------------------------------------------------

/** Concatenate encoded SysEx messages into a single .syx byte blob. */
export function configToSyx(config: FH2Config): Uint8Array {
	const messages = encodeConfig(config);
	const total = messages.reduce((n, m) => n + m.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const m of messages) {
		out.set(m, offset);
		offset += m.length;
	}
	return out;
}

/** Split a .syx blob into individual SysEx messages (0xF0 ... 0xF7) and decode. */
export function syxToConfig(bytes: Uint8Array): FH2Config {
	const messages: Uint8Array[] = [];
	let start = -1;
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0xf0) start = i;
		else if (bytes[i] === 0xf7 && start >= 0) {
			messages.push(bytes.slice(start, i + 1));
			start = -1;
		}
	}
	return decodeConfig(messages);
}
