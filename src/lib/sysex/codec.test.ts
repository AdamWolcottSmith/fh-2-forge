import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '$lib/config/defaults';
import { CONFIG_DUMP_HEADER } from './protocol';
import { decodeConfig, encodeConfig, PAYLOAD_LENGTH } from './codec';

describe('config codec framing', () => {
	it('wraps the payload in the documented header + F7', () => {
		const bytes = encodeConfig(createDefaultConfig('Test'));
		expect([...bytes.slice(0, 8)]).toEqual([...CONFIG_DUMP_HEADER]);
		expect(bytes[bytes.length - 1]).toBe(0xf7);
		expect(bytes.length).toBe(CONFIG_DUMP_HEADER.length + PAYLOAD_LENGTH + 1);
	});

	it('round-trips version and name', () => {
		const cfg = createDefaultConfig('My Patch');
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.name).toBe('My Patch');
		expect(decoded.version).toBe(cfg.version);
	});
});

describe('raw passthrough (round-trip safety for unmodeled fields)', () => {
	it('preserves bytes in unmodeled regions on re-encode', () => {
		// Modeled sections normalise their bytes (e.g. bools → 0/1), so to assert
		// the passthrough guarantee we put arbitrary data only in regions the codec
		// does not yet model: the mapping table (604..2140) and the addendum
		// (4096..end). Everything else stays zero, which round-trips cleanly.
		const payload = new Uint8Array(PAYLOAD_LENGTH);
		payload[0] = 11; // version
		const name = 'Hardware Dump'.padEnd(16, ' ');
		for (let i = 0; i < 16; i++) payload[4 + i] = name.charCodeAt(i);
		for (let i = 604; i < 2140; i++) payload[i] = (i * 7) & 0x7f; // mappings
		for (let i = 4096; i < PAYLOAD_LENGTH; i++) payload[i] = (i * 3) & 0x7f; // addendum

		const out = encodeConfig(decodeConfig(payload)).slice(8, -1);
		expect(out.length).toBe(payload.length);
		expect([...out]).toEqual([...payload]);
	});

	it('accepts a full F0..F7 message or a bare payload', () => {
		const cfg = createDefaultConfig('Either Way');
		const full = encodeConfig(cfg);
		const fromFull = decodeConfig(full);
		const fromBare = decodeConfig(full.slice(8, -1));
		expect(fromFull.name).toBe('Either Way');
		expect(fromBare.name).toBe('Either Way');
	});
});

describe('MCV (MIDI/CV converter) codec', () => {
	it('round-trips all 16 default converters', () => {
		const cfg = createDefaultConfig();
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.converters).toEqual(cfg.converters);
	});

	it('round-trips a fully-populated converter (every field + transforms)', () => {
		const cfg = createDefaultConfig();
		cfg.converters[3] = {
			id: 4,
			enabled: true,
			channel: 16, // wire = 15
			noteMin: 24,
			noteMax: 96,
			type: 2, // MPE
			polyphony: 8,
			bendDepth: 12,
			bendDownDepth: 24,
			scheme: 6, // Random
			ignoreSurplus: true,
			gatedPressure: true,
			sustain: 1,
			baseOutput: 9,
			stride: 2,
			lastMpeChannel: 11, // wire = 10
			pressure: true,
			paraGate: false,
			cvOutput: true,
			gateOutput: true,
			velGateOutput: true,
			velOutput: 33,
			relVelOutput: 34,
			triggerOutput: true,
			voicePressureOutput: true,
			mpeYOutput: 74,
			envOutput: true,
			baseGate: 65,
			monoRetrigger: false,
			interruptGate: true,
			envZeroStart: true,
			pitchBendOutput: 40,
			randomOutput: true
		};
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.converters[3]).toEqual(cfg.converters[3]);
	});

	it('places the first MCV at payload offset 92', () => {
		const cfg = createDefaultConfig();
		cfg.converters[0].enabled = true; // byte 0 of the MCV block
		const payload = encodeConfig(cfg).slice(8, -1);
		expect(payload[92]).toBe(1);
	});
});

describe('globals, output ranges, and gate levels', () => {
	it('round-trips globals across all three regions (incl. signed transpose)', () => {
		const cfg = createDefaultConfig();
		Object.assign(cfg.globals, {
			triggerLength: 75,
			transpose: -12,
			legatoVelocity: false,
			extClockMultiplier: 24,
			extClockRun: 1,
			presetProgramChange: 5,
			softTakeover: true,
			tapType: 2,
			tapChannel: 9,
			tapCC: 64,
			euclideanAccent: 100,
			startType: 6,
			startChannel: 3,
			startCC: 80,
			tempoMin: 20,
			tempoMax: 110
		});
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.globals).toEqual(cfg.globals);
	});

	it('round-trips output ranges and 14-bit gate levels', () => {
		const cfg = createDefaultConfig();
		for (let i = 0; i < cfg.outputRanges.length; i++) cfg.outputRanges[i] = i % 5;
		cfg.gateLevels[0] = { lo: 0, hi: 16383 };
		cfg.gateLevels[1] = { lo: 8192, hi: 12000 };
		cfg.gateLevels[63] = { lo: 1, hi: 127 };
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.outputRanges).toEqual(cfg.outputRanges);
		expect(decoded.gateLevels).toEqual(cfg.gateLevels);
	});

	it('places globals region A at offset 21', () => {
		const cfg = createDefaultConfig();
		cfg.globals.triggerLength = 42;
		const payload = encodeConfig(cfg).slice(8, -1);
		expect(payload[21]).toBe(42);
	});
});
