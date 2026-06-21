/**
 * Shared, app-wide active configuration + connection state (Svelte 5 runes).
 *
 * `config` is a deeply-reactive `$state` proxy, so editor components can bind
 * directly to nested fields (e.g. `bind:value={store.config.converters[i].channel}`)
 * and the UI updates everywhere. A single instance is exported and imported by
 * any view that reads or edits the config.
 */
import { createDefaultConfig } from '$lib/config/defaults';
import {
	configToSyx,
	MockTransport,
	syxToConfig,
	WebMidiTransport,
	type ConnectionState,
	type MidiTransport
} from '$lib/sysex/fh2-sysex';
import type { FH2Config } from '$lib/types/fh2';

class ConfigStore {
	/** The configuration currently being edited. */
	config = $state<FH2Config>(createDefaultConfig());

	/** True once the config differs from the last loaded/sent baseline. */
	dirty = $state(false);

	/** Current transport connection state. */
	connection = $state<ConnectionState>({ status: 'disconnected' });

	/** Firmware version string reported by the device, if known. */
	firmware = $state<string | null>(null);

	/** True while a connect / load / send operation is in flight. */
	busy = $state(false);

	/** Last error message from a transport operation, for surfacing in the UI. */
	error = $state<string | null>(null);

	/** Transport used for load/send. Mock until a real device is connected. */
	transport: MidiTransport = new MockTransport();

	/** Replace the whole config (e.g. after a device read or file import). */
	load(config: FH2Config) {
		this.config = config;
		this.dirty = false;
	}

	/** Start a fresh, empty config. */
	reset(name = 'Untitled') {
		this.config = createDefaultConfig(name);
		this.dirty = false;
	}

	/** Mark the config as modified. Call from editors after a change. */
	touch() {
		this.dirty = true;
	}

	get connected(): boolean {
		return this.connection.status === 'connected' || this.connection.status === 'mock';
	}

	/** Run an async transport op with busy + error bookkeeping. */
	private async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
		this.busy = true;
		this.error = null;
		try {
			return await fn();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	/** Connect to a real FH-2 over Web MIDI. */
	async connect() {
		await this.run(async () => {
			const transport = new WebMidiTransport();
			this.connection = await transport.connect();
			this.transport = transport;
			this.firmware = (await transport.requestVersion().catch(() => null)) ?? null;
		});
	}

	/** Use the in-memory mock device (no hardware needed). */
	async connectMock() {
		const transport = new MockTransport();
		this.connection = await transport.connect();
		this.transport = transport;
		this.firmware = await transport.requestVersion();
		this.error = null;
	}

	/** Disconnect and return to the mock transport. */
	async disconnect() {
		await this.transport.disconnect().catch(() => {});
		this.transport = new MockTransport();
		this.connection = { status: 'disconnected' };
		this.firmware = null;
	}

	/** Pull the current config from the connected device. */
	async loadFromDevice() {
		const config = await this.run(() => this.transport.requestConfig());
		if (config) this.load(config);
	}

	/** Push the current config to the connected device. */
	async sendToDevice() {
		const ok = await this.run(async () => {
			await this.transport.sendConfig($state.snapshot(this.config) as FH2Config);
			return true;
		});
		if (ok) this.dirty = false;
	}

	/** Persist the device's current config to flash (if supported). */
	async saveToFlash() {
		await this.run(() => this.transport.saveToFlash());
	}

	// --- .syx file I/O -------------------------------------------------------

	/** Serialise the current config to a downloadable `.syx` blob. */
	exportSyx(): Blob {
		const bytes = configToSyx($state.snapshot(this.config) as FH2Config);
		// Copy into a plain ArrayBuffer so the Blob part is well-typed.
		const buffer = new ArrayBuffer(bytes.length);
		new Uint8Array(buffer).set(bytes);
		return new Blob([buffer], { type: 'application/octet-stream' });
	}

	/** Suggested filename for an export, derived from the config name. */
	exportFilename(): string {
		const safe = (this.config.name || 'fh2-config').replace(/[^a-z0-9_-]+/gi, '_');
		return `${safe}.syx`;
	}

	/** Load a config from `.syx` file bytes. */
	importSyx(bytes: Uint8Array) {
		this.error = null;
		try {
			this.load(syxToConfig(bytes));
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		}
	}
}

export const configStore = new ConfigStore();
