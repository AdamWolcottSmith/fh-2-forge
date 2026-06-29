import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { presetToSyx, syxToPreset, extractPresetPayload } from './preset-sysex';

const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const presetSyx = new Uint8Array(readFileSync(fixtureDir + 'device-preset-v8.syx'));
const configSyx = new Uint8Array(readFileSync(fixtureDir + 'device-dump-v11.syx'));

describe('preset .syx helpers', () => {
	it('round-trips a preset .syx file byte-for-byte', () => {
		expect([...presetToSyx(syxToPreset(presetSyx))]).toEqual([...presetSyx]);
	});

	it('extractPresetPayload rejects a config dump', () => {
		expect(() => extractPresetPayload(configSyx)).toThrow(/preset dump/i);
	});
});
