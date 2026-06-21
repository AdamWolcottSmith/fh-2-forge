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
	it('preserves every byte of a decoded payload on re-encode', () => {
		// Simulate a device payload with arbitrary data in unmodeled regions.
		const payload = new Uint8Array(PAYLOAD_LENGTH);
		for (let i = 0; i < payload.length; i++) payload[i] = (i * 7) & 0x7f;
		// valid version + name so decode is well-formed. The device space-pads
		// names to 16 bytes (never null-terminates a short name), so we do too.
		payload[0] = 11;
		const name = 'Hardware Dump'.padEnd(16, ' ');
		for (let i = 0; i < 16; i++) payload[4 + i] = name.charCodeAt(i);
		// The MCV region (offset 92, 16×32 bytes) is now a *modeled* section, so
		// boolean bytes normalise to 0/1 on re-encode. Zero it here — this test
		// asserts the passthrough guarantee for the remaining *unmodeled* regions.
		payload.fill(0, 92, 92 + 16 * 32);

		const decoded = decodeConfig(payload);
		const reencoded = encodeConfig(decoded);

		// The re-encoded payload (between header and F7) must equal the original.
		const out = reencoded.slice(8, -1);
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
