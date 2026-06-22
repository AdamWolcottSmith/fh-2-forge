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
import {
	FH2_LIMITS,
	OUTPUT_COUNT,
	type ClockGenerator,
	type EuclideanPattern,
	type FH2Config,
	type Globals,
	type MidiCvConverter,
	type TriggerGenerator
} from '$lib/types/fh2';
import {
	bytesToShort,
	CONFIG_DUMP_HEADER,
	CONFIG_PAYLOAD_PAD,
	CONFIG_VERSION,
	isConfigDumpFile,
	sysexSafeShort,
	sysexSafeSignedChar,
	unSysexSafeShort,
	unSysexSafeSignedChar
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
const OFF_GLOBALS_A = 21; // 7 bytes
const OFF_RANGES = 28; // 64 bytes
const OFF_MCV = 92; // 16 × 32 bytes
const MCV_SIZE = 32;
const OFF_CLOCKS = 2140; // 32 × 8 bytes (6 used)
const CLOCK_SIZE = 8;
const OFF_GATE_LEVELS = 2396; // 64 × 4 bytes (lo short, hi short)
const OFF_TRIGGERS = 2652; // 64 × 4 bytes (bit-packed)
const TRIGGER_SIZE = 4;
const OFF_EUC_OUT = 2908; // 16 × 1 byte (low 7 bits)
const OFF_GLOBALS_B = 2924; // 8 bytes (7 used + pad)
const OFF_EUC_OFFOUT = 2932; // 16 × 1 byte (low 7 bits)
const OFF_GLOBALS_C = 3604; // 4 bytes (2 used + pad)
// Addendum (high-bit flags) at the very end of the payload.
const OFF_ADDENDUM_EUC_ON = 4096; // 16 bytes
const OFF_ADDENDUM_EUC_OFF = 4112; // 16 bytes

// --- generic field-table codec ---------------------------------------------
// Each section is a table of [key, kind]; encode/decode walk it symmetrically so
// the two directions can never drift.
type FieldKind = 'bool' | 'byte' | 'plus1' | 'signed';

function encodeFields<T>(
	obj: T,
	fields: ReadonlyArray<readonly [keyof T, FieldKind]>,
	payload: Uint8Array,
	base: number
): void {
	fields.forEach(([key, kind], i) => {
		const v = obj[key];
		let byte: number;
		if (kind === 'bool') byte = v ? 1 : 0;
		else if (kind === 'plus1') byte = ((v as number) - 1) & 0x7f;
		else if (kind === 'signed') byte = sysexSafeSignedChar(v as number);
		else byte = (v as number) & 0x7f;
		payload[base + i] = byte;
	});
}

function decodeFields<T>(
	target: T,
	fields: ReadonlyArray<readonly [keyof T, FieldKind]>,
	payload: Uint8Array,
	base: number
): void {
	fields.forEach(([key, kind], i) => {
		const b = payload[base + i];
		const value =
			kind === 'bool' ? b !== 0 : kind === 'plus1' ? b + 1 : kind === 'signed' ? unSysexSafeSignedChar(b) : b;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(target as any)[key] = value;
	});
}

// --- MCV (16 × 32 bytes), mirroring makeSysExMcv ----------------------------
const MCV_FIELDS: ReadonlyArray<readonly [keyof MidiCvConverter, FieldKind]> = [
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

// --- Globals, split across three regions ------------------------------------
const GLOBALS_A_FIELDS: ReadonlyArray<readonly [keyof Globals, FieldKind]> = [
	['triggerLength', 'byte'],
	['transpose', 'signed'],
	['legatoVelocity', 'bool'],
	['extClockMultiplier', 'byte'],
	['extClockRun', 'byte'],
	['presetProgramChange', 'byte'],
	['softTakeover', 'bool']
];
const GLOBALS_B_FIELDS: ReadonlyArray<readonly [keyof Globals, FieldKind]> = [
	['tapType', 'byte'],
	['tapChannel', 'byte'],
	['tapCC', 'byte'],
	['euclideanAccent', 'byte'],
	['startType', 'byte'],
	['startChannel', 'byte'],
	['startCC', 'byte']
	// byte 7 is padding — preserved via raw
];
const GLOBALS_C_FIELDS: ReadonlyArray<readonly [keyof Globals, FieldKind]> = [
	['tempoMin', 'byte'],
	['tempoMax', 'byte']
	// bytes 2,3 are padding — preserved via raw
];

// --- Clocks (32 × 8 bytes, 6 used), mirroring makeSysExClocks ---------------
const CLOCK_FIELDS: ReadonlyArray<readonly [keyof ClockGenerator, FieldKind]> = [
	['type', 'byte'],
	['base', 'byte'],
	['mult', 'byte'],
	['len', 'byte'],
	['output', 'byte'],
	['shift', 'byte']
	// bytes 6,7 are padding — preserved via raw
];

// --- Triggers (4 bytes, bit-packed) — mirrors makeSysExTriggers/parse -------
function encodeTrigger(t: TriggerGenerator, payload: Uint8Array, base: number): void {
	const env1 = (t.env - 1) & 0x3; // 0..3 split across two bytes
	const anyNote = t.note < 0 ? 1 : 0;
	payload[base] = (t.type & 0xf) | ((env1 >> 1) << 4);
	payload[base + 1] = ((t.channel - 1) & 0xf) | ((env1 & 1) << 4) | (anyNote << 5);
	payload[base + 2] = anyNote ? 0 : t.note & 0x7f;
	payload[base + 3] = t.output & 0x7f;
}

function decodeTrigger(payload: Uint8Array, base: number, id: number): TriggerGenerator {
	const b0 = payload[base];
	const b1 = payload[base + 1];
	const anyNote = (b1 >> 5) & 1;
	return {
		id,
		type: b0 & 0xf,
		channel: (b1 & 0xf) + 1,
		note: anyNote ? -1 : payload[base + 2],
		output: payload[base + 3],
		env: (((b0 >> 4) << 1) | ((b1 >> 4) & 1)) + 1
	};
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

	// globals (three regions)
	encodeFields(config.globals, GLOBALS_A_FIELDS, payload, OFF_GLOBALS_A);
	encodeFields(config.globals, GLOBALS_B_FIELDS, payload, OFF_GLOBALS_B);
	encodeFields(config.globals, GLOBALS_C_FIELDS, payload, OFF_GLOBALS_C);

	// output ranges (64 × 1 byte)
	for (let i = 0; i < OUTPUT_COUNT; i++) {
		payload[OFF_RANGES + i] = (config.outputRanges[i] ?? 0) & 0x7f;
	}

	// gate levels (64 × 4 bytes: lo short, hi short)
	for (let i = 0; i < OUTPUT_COUNT; i++) {
		const gl = config.gateLevels[i] ?? { lo: 0, hi: 0 };
		const base = OFF_GATE_LEVELS + i * 4;
		const lo = sysexSafeShort(gl.lo);
		const hi = sysexSafeShort(gl.hi);
		payload[base] = lo & 0x7f;
		payload[base + 1] = lo >> 8;
		payload[base + 2] = hi & 0x7f;
		payload[base + 3] = hi >> 8;
	}

	// MCVs (16 × 32 bytes)
	for (let i = 0; i < FH2_LIMITS.converters; i++) {
		const conv = config.converters[i];
		if (conv) encodeFields(conv, MCV_FIELDS, payload, OFF_MCV + i * MCV_SIZE);
	}

	// Clocks (32 × 8 bytes, 6 used)
	for (let i = 0; i < FH2_LIMITS.clocks; i++) {
		const clk = config.clocks[i];
		if (clk) encodeFields(clk, CLOCK_FIELDS, payload, OFF_CLOCKS + i * CLOCK_SIZE);
	}

	// Triggers (64 × 4 bytes, bit-packed)
	for (let i = 0; i < FH2_LIMITS.triggers; i++) {
		const trg = config.triggers[i];
		if (trg) encodeTrigger(trg, payload, OFF_TRIGGERS + i * TRIGGER_SIZE);
	}

	// Euclidean output assignments (low 7 bits here, high-bit flag in addendum)
	for (let i = 0; i < FH2_LIMITS.euclideans; i++) {
		const euc = config.euclideans[i];
		if (!euc) continue;
		payload[OFF_EUC_OUT + i] = euc.output & 0x7f;
		payload[OFF_EUC_OFFOUT + i] = euc.offOutput & 0x7f;
		payload[OFF_ADDENDUM_EUC_ON + i] = euc.output & 0x80 ? 1 : 0;
		payload[OFF_ADDENDUM_EUC_OFF + i] = euc.offOutput & 0x80 ? 1 : 0;
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

	// globals (three regions)
	decodeFields(config.globals, GLOBALS_A_FIELDS, payload, OFF_GLOBALS_A);
	decodeFields(config.globals, GLOBALS_B_FIELDS, payload, OFF_GLOBALS_B);
	decodeFields(config.globals, GLOBALS_C_FIELDS, payload, OFF_GLOBALS_C);

	// output ranges (64 × 1 byte)
	for (let i = 0; i < OUTPUT_COUNT; i++) {
		config.outputRanges[i] = payload[OFF_RANGES + i];
	}

	// gate levels (64 × 4 bytes)
	for (let i = 0; i < OUTPUT_COUNT; i++) {
		const base = OFF_GATE_LEVELS + i * 4;
		config.gateLevels[i] = {
			lo: unSysexSafeShort(bytesToShort(payload[base], payload[base + 1])),
			hi: unSysexSafeShort(bytesToShort(payload[base + 2], payload[base + 3]))
		};
	}

	// MCVs (16 × 32 bytes)
	for (let i = 0; i < FH2_LIMITS.converters; i++) {
		const conv = { id: i + 1 } as MidiCvConverter;
		decodeFields(conv, MCV_FIELDS, payload, OFF_MCV + i * MCV_SIZE);
		config.converters[i] = conv;
	}

	// Clocks (32 × 8 bytes)
	for (let i = 0; i < FH2_LIMITS.clocks; i++) {
		const clk = { id: i + 1 } as ClockGenerator;
		decodeFields(clk, CLOCK_FIELDS, payload, OFF_CLOCKS + i * CLOCK_SIZE);
		config.clocks[i] = clk;
	}

	// Triggers (64 × 4 bytes)
	for (let i = 0; i < FH2_LIMITS.triggers; i++) {
		config.triggers[i] = decodeTrigger(payload, OFF_TRIGGERS + i * TRIGGER_SIZE, i + 1);
	}

	// Euclidean output assignments (−1 when the addendum high-bit flag is set)
	for (let i = 0; i < FH2_LIMITS.euclideans; i++) {
		const euc: EuclideanPattern = {
			id: i + 1,
			output: payload[OFF_ADDENDUM_EUC_ON + i] ? -1 : payload[OFF_EUC_OUT + i],
			offOutput: payload[OFF_ADDENDUM_EUC_OFF + i] ? -1 : payload[OFF_EUC_OFFOUT + i]
		};
		config.euclideans[i] = euc;
	}

	// TODO: parse remaining modeled sections here as they gain coverage.

	return config;
}
