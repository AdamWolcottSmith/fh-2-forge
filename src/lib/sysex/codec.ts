/**
 * FH-2 config-dump codec: FH2Config <-> SysEx bytes.
 *
 * Layout is documented in `docs/SYSEX_FORMAT.md` and mirrors the official
 * `makeSysEx()` / `parseConfigDump()`. Targets config version 11.
 *
 * PARTIAL-MODEL STRATEGY (round-trip safety)
 * ------------------------------------------
 * The typed model does not yet cover every field. To stay byte-perfect with the
 * device and official tools, `decodeConfig` stashes the entire raw payload on
 * `config.raw`, and `encodeConfig` starts from that raw buffer (or a zeroed
 * template) and only overlays the fields the model owns. Any byte we don't model
 * is therefore preserved exactly. As sections gain typed fields + codec coverage
 * (see SYSEX_FORMAT.md), they move from "preserved" to "modeled".
 */
import { createDefaultConfig } from '$lib/config/defaults';
import { FH2_LIMITS, type FH2Config, type MidiCvConverter } from '$lib/types/fh2';
import {
	CONFIG_DUMP_HEADER,
	CONFIG_PAYLOAD_PAD,
	CONFIG_VERSION,
	isConfigDumpFile
} from './protocol';

/** Bytes of addendum (high-bits) appended after the 4096-byte padded body. */
const ADDENDUM_BYTES = 16 /* euc out */ + 16 /* euc off-out */ + 16; /* srr */

/** Total config-dump payload length (between the 8-byte header and F7). */
export const PAYLOAD_LENGTH = CONFIG_PAYLOAD_PAD + ADDENDUM_BYTES;

// --- field offsets within the payload (see SYSEX_FORMAT.md) -----------------
// Offsets are derived from the official tool's cursor arithmetic.
const OFF_VERSION = 0; // 4 bytes, LE int32
const OFF_NAME = 4; // 16 bytes ASCII; cursor then advances 17
const NAME_LENGTH = 16;
const NAME_ADVANCE = 17;
const GLOBALS_A_SIZE = 7; // not yet modeled (preserved via raw)
const RANGES_SIZE = 64; // not yet modeled (preserved via raw)
const OFF_MCV = OFF_NAME + NAME_ADVANCE + GLOBALS_A_SIZE + RANGES_SIZE; // 92
const MCV_SIZE = 32;

// --- MCV field table: byte order + transform, mirroring makeSysExMcv ---------
type McvFieldKind = 'bool' | 'byte' | 'plus1';
const MCV_FIELDS: ReadonlyArray<readonly [keyof MidiCvConverter, McvFieldKind]> = [
	['enabled', 'bool'], // 0
	['channel', 'plus1'], // 1  (wire = value−1)
	['noteMin', 'byte'], // 2
	['noteMax', 'byte'], // 3
	['type', 'byte'], // 4
	['polyphony', 'byte'], // 5
	['bendDepth', 'byte'], // 6
	['scheme', 'byte'], // 7
	['ignoreSurplus', 'bool'], // 8
	['gatedPressure', 'bool'], // 9
	['sustain', 'byte'], // 10
	['baseOutput', 'byte'], // 11
	['stride', 'byte'], // 12
	['lastMpeChannel', 'plus1'], // 13 (wire = value−1)
	['pressure', 'bool'], // 14
	['paraGate', 'bool'], // 15
	['cvOutput', 'bool'], // 16
	['gateOutput', 'bool'], // 17
	['velGateOutput', 'bool'], // 18
	['velOutput', 'byte'], // 19
	['relVelOutput', 'byte'], // 20
	['triggerOutput', 'bool'], // 21
	['voicePressureOutput', 'bool'], // 22
	['mpeYOutput', 'byte'], // 23
	['envOutput', 'bool'], // 24
	['baseGate', 'byte'], // 25
	['monoRetrigger', 'bool'], // 26
	['interruptGate', 'bool'], // 27
	['envZeroStart', 'bool'], // 28
	['bendDownDepth', 'byte'], // 29
	['pitchBendOutput', 'byte'], // 30
	['randomOutput', 'bool'] // 31
];

function encodeMcv(conv: MidiCvConverter, payload: Uint8Array, base: number): void {
	MCV_FIELDS.forEach(([key, kind], i) => {
		const v = conv[key];
		let byte: number;
		if (kind === 'bool') byte = v ? 1 : 0;
		else if (kind === 'plus1') byte = ((v as number) - 1) & 0x7f;
		else byte = (v as number) & 0x7f;
		payload[base + i] = byte;
	});
}

function decodeMcv(payload: Uint8Array, base: number, id: number): MidiCvConverter {
	const conv = { id } as MidiCvConverter;
	MCV_FIELDS.forEach(([key, kind], i) => {
		const b = payload[base + i];
		const value = kind === 'bool' ? b !== 0 : kind === 'plus1' ? b + 1 : b;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(conv as any)[key] = value;
	});
	return conv;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/** Encode a config into a complete `.syx` / device config-dump message (F0..F7). */
export function encodeConfig(config: FH2Config): Uint8Array {
	// Start from the preserved raw payload when present so unmodeled fields
	// survive the round-trip; otherwise a zeroed template.
	const payload = new Uint8Array(PAYLOAD_LENGTH);
	if (config.raw && config.raw.length === PAYLOAD_LENGTH) {
		payload.set(config.raw);
	}

	// version (LE int32)
	const version = config.version || CONFIG_VERSION;
	payload[OFF_VERSION] = version & 0xff;
	payload[OFF_VERSION + 1] = (version >> 8) & 0xff;
	payload[OFF_VERSION + 2] = (version >> 16) & 0xff;
	payload[OFF_VERSION + 3] = (version >> 24) & 0xff;

	// name (16 ASCII bytes, space-padded then truncated, matching the tool)
	const name = (config.name + ' '.repeat(NAME_LENGTH)).substring(0, NAME_LENGTH);
	for (let i = 0; i < NAME_LENGTH; i++) payload[OFF_NAME + i] = name.charCodeAt(i) & 0x7f;

	// MCVs (16 × 32 bytes)
	for (let i = 0; i < FH2_LIMITS.converters; i++) {
		const conv = config.converters[i];
		if (conv) encodeMcv(conv, payload, OFF_MCV + i * MCV_SIZE);
	}

	// TODO: overlay remaining modeled sections here as they gain coverage.

	// Frame: header (8) + payload + F7
	const out = new Uint8Array(CONFIG_DUMP_HEADER.length + payload.length + 1);
	out.set(CONFIG_DUMP_HEADER, 0);
	out.set(payload, CONFIG_DUMP_HEADER.length);
	out[out.length - 1] = 0xf7;
	return out;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a config-dump payload (the bytes between the 8-byte header and F7).
 * Accepts either the bare payload or a full F0..F7 message.
 */
export function decodeConfig(input: Uint8Array): FH2Config {
	const payload = isConfigDumpFile(input) ? input.slice(8, -1) : input;

	const version =
		payload[OFF_VERSION] |
		(payload[OFF_VERSION + 1] << 8) |
		(payload[OFF_VERSION + 2] << 16) |
		(payload[OFF_VERSION + 3] << 24);

	let name = '';
	for (let i = 0; i < NAME_LENGTH; i++) {
		const ch = payload[OFF_NAME + i];
		if (ch === 0) break;
		name += String.fromCharCode(ch);
	}

	const config = createDefaultConfig(name.trimEnd() || 'Untitled');
	config.version = version || CONFIG_VERSION;
	// Preserve the full payload so unmodeled fields survive a re-encode.
	config.raw = payload.slice();

	// MCVs (16 × 32 bytes)
	for (let i = 0; i < FH2_LIMITS.converters; i++) {
		config.converters[i] = decodeMcv(payload, OFF_MCV + i * MCV_SIZE, i + 1);
	}

	// TODO: parse remaining modeled sections here as they gain coverage.

	return config;
}
