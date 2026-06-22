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
		// The 384-entry mapping table (604..2140) is the only large unmodeled block.
		for (let i = 604; i < 2140; i++) payload[i] = (i * 7) & 0x7f;

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

describe('clocks, triggers, and euclidean', () => {
	it('round-trips all default clocks/triggers/euclideans', () => {
		const cfg = createDefaultConfig();
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.clocks).toEqual(cfg.clocks);
		expect(decoded.triggers).toEqual(cfg.triggers);
		expect(decoded.euclideans).toEqual(cfg.euclideans);
	});

	it('round-trips a populated clock', () => {
		const cfg = createDefaultConfig();
		cfg.clocks[5] = { id: 6, type: 2, base: 24, mult: 3, len: 50, output: 12, shift: 7 };
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.clocks[5]).toEqual(cfg.clocks[5]);
	});

	it('round-trips a trigger incl. bit-packed env and a real note', () => {
		const cfg = createDefaultConfig();
		cfg.triggers[10] = { id: 11, type: 9, channel: 10, note: 36, output: 20, env: 4 };
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.triggers[10]).toEqual(cfg.triggers[10]);
	});

	it('round-trips a trigger with "any note" (−1)', () => {
		const cfg = createDefaultConfig();
		cfg.triggers[0] = { id: 1, type: 1, channel: 16, note: -1, output: 5, env: 2 };
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.triggers[0]).toEqual(cfg.triggers[0]);
	});

	it('round-trips euclidean outputs incl. disabled (−1) via addendum flag', () => {
		const cfg = createDefaultConfig();
		cfg.euclideans[2] = { id: 3, output: 17, offOutput: -1 };
		cfg.euclideans[4] = { id: 5, output: -1, offOutput: 33 };
		const decoded = decodeConfig(encodeConfig(cfg));
		expect(decoded.euclideans[2]).toEqual(cfg.euclideans[2]);
		expect(decoded.euclideans[4]).toEqual(cfg.euclideans[4]);
	});
});

describe('HID, LFO resets, CV→MIDI, sequencers, arp, SRR', () => {
	it('round-trips all defaults for the new sections', () => {
		const cfg = createDefaultConfig();
		const d = decodeConfig(encodeConfig(cfg));
		expect(d.hid).toEqual(cfg.hid);
		expect(d.lfoResets).toEqual(cfg.lfoResets);
		expect(d.cvToMidi).toEqual(cfg.cvToMidi);
		expect(d.sequencers).toEqual(cfg.sequencers);
		expect(d.mcv2).toEqual(cfg.mcv2);
		expect(d.shiftRegisters).toEqual(cfg.shiftRegisters);
	});

	it('round-trips a populated gamepad + keyboard (signed/unsigned shorts)', () => {
		const cfg = createDefaultConfig();
		cfg.hid.gamepad[7] = { id: 8, usage: 12, output: 5, scale: -4096, offset: 8000 };
		cfg.hid.keyboard[9] = { id: 10, type: 2, output: 6, key: 65, value0: 0, value1: 16383 };
		const d = decodeConfig(encodeConfig(cfg));
		expect(d.hid.gamepad[7]).toEqual(cfg.hid.gamepad[7]);
		expect(d.hid.keyboard[9]).toEqual(cfg.hid.keyboard[9]);
	});

	it('round-trips CV→MIDI with flags and signed levels', () => {
		const cfg = createDefaultConfig();
		cfg.cvToMidi[0] = {
			id: 1,
			enabled: true,
			outI: true,
			outA: false,
			outC: true,
			outD: false,
			outS: true,
			type: 3,
			channel: 12,
			cc: 74,
			v0: -2000,
			v5: 2000
		};
		const d = decodeConfig(encodeConfig(cfg));
		expect(d.cvToMidi[0]).toEqual(cfg.cvToMidi[0]);
	});

	it('round-trips note/drum sequencers and arp routing', () => {
		const cfg = createDefaultConfig();
		cfg.sequencers.note[2] = {
			id: 3,
			channel: 7,
			clk: 24,
			outInternal: true,
			outC: false,
			outA: true,
			outD: false,
			outS: true
		};
		cfg.sequencers.drum = {
			channel: 10,
			outInternal: false,
			outC: true,
			outA: false,
			outD: true,
			outS: false,
			notes: [36, 38, 42, 46, 50, 45, 48, 51]
		};
		cfg.mcv2[5] = { id: 6, clk: 12, channel: 4, outC: true, outA: false, outD: true };
		const d = decodeConfig(encodeConfig(cfg));
		expect(d.sequencers.note[2]).toEqual(cfg.sequencers.note[2]);
		expect(d.sequencers.drum).toEqual(cfg.sequencers.drum);
		expect(d.mcv2[5]).toEqual(cfg.mcv2[5]);
	});

	it('round-trips SRR incl. −1 sentinels (output/change/trigger/nch)', () => {
		const cfg = createDefaultConfig();
		cfg.shiftRegisters[1] = {
			id: 2,
			output: 14,
			change: -1,
			trigger: 22,
			clk: 24,
			nch: 4,
			channel: 9,
			outInternal: true,
			outC: true,
			outA: false,
			outD: false,
			outS: true
		};
		const d = decodeConfig(encodeConfig(cfg));
		expect(d.shiftRegisters[1]).toEqual(cfg.shiftRegisters[1]);
	});
});
