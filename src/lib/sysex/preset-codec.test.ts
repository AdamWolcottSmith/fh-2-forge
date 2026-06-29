import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePreset, encodePreset, createEmptyPreset } from './preset-codec';

const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const presetSyx = new Uint8Array(readFileSync(fixtureDir + 'device-preset-v8.syx'));

describe('preset codec — framing & round-trip', () => {
	it('decodes version 8 and the name "Init"', () => {
		const p = decodePreset(presetSyx);
		expect(p.version).toBe(8);
		expect(p.name).toBe('Init');
	});

	it('round-trips the real preset dump byte-for-byte', () => {
		const out = encodePreset(decodePreset(presetSyx));
		expect(out.length).toBe(presetSyx.length);
		expect([...out]).toEqual([...presetSyx]);
	});

	it('decodePreset accepts a bare payload too', () => {
		const fromFull = decodePreset(presetSyx);
		const fromBare = decodePreset(presetSyx.slice(8, -1));
		expect(fromBare.version).toBe(fromFull.version);
		expect([...fromBare.raw]).toEqual([...fromFull.raw]);
	});

	it('createEmptyPreset yields a version-8 preset of the right length', () => {
		const p = createEmptyPreset();
		expect(p.version).toBe(8);
		expect(p.raw.length).toBe(4436);
		expect(encodePreset(p).length).toBe(4436 + 9);
	});
});
