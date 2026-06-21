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
