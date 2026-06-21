/**
 * Shared, app-wide active configuration state (Svelte 5 runes).
 *
 * `config` is a deeply-reactive `$state` proxy, so editor components can bind
 * directly to nested fields (e.g. `bind:value={store.config.converters[i].channel}`)
 * and the UI updates everywhere. A single instance is exported and imported by
 * any view that reads or edits the config.
 */
import { createDefaultConfig } from '$lib/config/defaults';
import { MockTransport, type MidiTransport } from '$lib/sysex/fh2-sysex';
import type { FH2Config } from '$lib/types/fh2';

class ConfigStore {
	/** The configuration currently being edited. */
	config = $state<FH2Config>(createDefaultConfig());

	/** True once the config differs from the last loaded/sent baseline. */
	dirty = $state(false);

	/** Transport used for load/send. Mock by default; swapped on real connect. */
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

	/** Pull the current config from the (mock or real) device. */
	async loadFromDevice() {
		this.load(await this.transport.requestConfig());
	}

	/** Push the current config to the device. */
	async sendToDevice() {
		await this.transport.sendConfig($state.snapshot(this.config) as FH2Config);
		this.dirty = false;
	}
}

export const configStore = new ConfigStore();
