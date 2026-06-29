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
import { isPresetDumpFile, PRESET_DUMP_HEADER, PRESET_PAYLOAD_LENGTH, PRESET_VERSION } from './protocol';

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
	/** Decoded for inspection only — NOT re-encoded; edits won't persist (carried via `raw`). */
	version: number;
	/** Decoded for inspection only — NOT re-encoded; edits won't persist (carried via `raw`). */
	name: string;
	euclidean: EuclideanGenerator[];
	raw: Uint8Array;
}

const OFF_NAME = 4; // 16 ASCII bytes; tool advances cursor 17
const OFF_EUCLIDEAN = 1372; // 16 generators × 8 bytes (7 used + 1 pad)
const EUC_STRIDE = 8;
const EUC_COUNT = 16;

/** Strip the 8-byte dump header + trailing F7 if a full message was passed. */
function toPayload(input: Uint8Array): Uint8Array {
	return isPresetDumpFile(input) ? input.slice(8, -1) : input;
}

function decodeEuclidean(payload: Uint8Array): EuclideanGenerator[] {
	const gens: EuclideanGenerator[] = [];
	for (let i = 0; i < EUC_COUNT; i++) {
		const base = OFF_EUCLIDEAN + i * EUC_STRIDE;
		gens.push({
			pulses: payload[base + 0],
			steps: payload[base + 1],
			rotation: payload[base + 2],
			rate: payload[base + 3],
			gateLength: payload[base + 4],
			accent: payload[base + 5],
			reset: payload[base + 6]
			// base + 7 is padding — preserved via raw
		});
	}
	return gens;
}

function encodeEuclidean(gens: EuclideanGenerator[], payload: Uint8Array): void {
	gens.slice(0, EUC_COUNT).forEach((g, i) => {
		const base = OFF_EUCLIDEAN + i * EUC_STRIDE;
		payload[base + 0] = g.pulses & 0x7f;
		payload[base + 1] = g.steps & 0x7f;
		payload[base + 2] = g.rotation & 0x7f;
		payload[base + 3] = g.rate & 0x7f;
		payload[base + 4] = g.gateLength & 0x7f;
		payload[base + 5] = g.accent & 0x7f;
		payload[base + 6] = g.reset & 0x7f;
		// base + 7 padding left untouched (preserved from raw)
	});
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
		euclidean: decodeEuclidean(payload),
		raw: payload.slice()
	};
}

export function encodePreset(model: PresetModel): Uint8Array {
	const payload = model.raw.slice();
	if (model.euclidean.length) encodeEuclidean(model.euclidean, payload);
	return new Uint8Array([...PRESET_DUMP_HEADER, ...payload, 0xf7]);
}

export function createEmptyPreset(): PresetModel {
	const raw = new Uint8Array(PRESET_PAYLOAD_LENGTH);
	raw[0] = PRESET_VERSION; // int32 LE; high bytes stay 0
	return { version: PRESET_VERSION, name: '', euclidean: [], raw };
}
