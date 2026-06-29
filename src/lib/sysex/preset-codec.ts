/**
 * FH-2 PRESET codec (format version 8) — the living sequencer state, distinct
 * from the config codec in `codec.ts`. Reverse-engineered from the official
 * `reference/FH-2_tools/fh2_preset_tool.html` (`parsePresetDump`) and verified
 * against the hardware fixture `fixtures/device-preset-v8.syx`.
 *
 * RAW-PASSTHROUGH STRATEGY (round-trip safety): only the 16 Euclidean generators
 * are modeled. `decodePreset` stashes the entire payload on `model.raw`;
 * `encodePreset` starts from `model.raw` and overwrites only the Euclidean bytes,
 * so every unmodeled byte survives a load->edit->send cycle untouched.
 */
import { PRESET_DUMP_HEADER, PRESET_PAYLOAD_LENGTH, PRESET_VERSION } from './protocol';

export interface EuclideanGenerator {
	pulses: number;
	steps: number;
	rotation: number;
	rate: number;
	gateLength: number;
	accent: number;
	reset: number;
}

export interface PresetModel {
	version: number;
	name: string;
	euclidean: EuclideanGenerator[];
	raw: Uint8Array;
}

const OFF_NAME = 4; // 16 ASCII bytes; tool advances cursor 17

/** Strip the 8-byte dump header + trailing F7 if a full message was passed. */
function toPayload(input: Uint8Array): Uint8Array {
	return input[0] === 0xf0 && input[5] === 0x13 ? input.slice(8, -1) : input;
}

export function decodePreset(input: Uint8Array): PresetModel {
	const payload = toPayload(input);
	const version =
		payload[0] | (payload[1] << 8) | (payload[2] << 16) | (payload[3] << 24);
	let name = '';
	for (let i = 0; i < 16; i++) {
		const n = payload[OFF_NAME + i];
		if (n === 0) break;
		name += String.fromCharCode(n);
	}
	return {
		version,
		name: name.replace(/\s+$/, ''),
		euclidean: [],
		raw: payload.slice()
	};
}

export function encodePreset(model: PresetModel): Uint8Array {
	const payload = model.raw.slice();
	// Task 3/4 will write Euclidean bytes here.
	return new Uint8Array([...PRESET_DUMP_HEADER, ...payload, 0xf7]);
}

export function createEmptyPreset(): PresetModel {
	const raw = new Uint8Array(PRESET_PAYLOAD_LENGTH);
	raw[0] = PRESET_VERSION; // int32 LE; high bytes stay 0
	return { version: PRESET_VERSION, name: '', euclidean: [], raw };
}
