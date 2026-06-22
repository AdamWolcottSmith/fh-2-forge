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
	type CvToMidiMapping,
	type DrumSequencer,
	type EuclideanPattern,
	type FH2Config,
	type Globals,
	type HidGamepad,
	type HidKeyboard,
	type LfoReset,
	type Mcv2,
	type MidiCvConverter,
	type NoteSequencer,
	type OutputDestFlags,
	type ShiftRegisterRandom,
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
	unSysexSafeSignedChar,
	unSysexSafeSignedShort
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
const OFF_MAPPINGS = 604; // 384 × 4 bytes
const MAPPING_COUNT = 384;
const OFF_CLOCKS = 2140; // 32 × 8 bytes (6 used)
const CLOCK_SIZE = 8;
const OFF_GATE_LEVELS = 2396; // 64 × 4 bytes (lo short, hi short)
const OFF_TRIGGERS = 2652; // 64 × 4 bytes (bit-packed)
const TRIGGER_SIZE = 4;
const OFF_EUC_OUT = 2908; // 16 × 1 byte (low 7 bits)
const OFF_GLOBALS_B = 2924; // 8 bytes (7 used + pad)
const OFF_EUC_OFFOUT = 2932; // 16 × 1 byte (low 7 bits)
const OFF_GAMEPAD = 2948; // 32 × 8 bytes
const OFF_KEYBOARD = 3204; // 32 × 8 bytes
const OFF_LFO_RESETS = 3460; // 64 × 2 bytes
const OFF_CVMIDI = 3588; // 2 × 8 bytes
const OFF_GLOBALS_C = 3604; // 4 bytes (2 used + pad)
const OFF_NOTE_SEQ = 3608; // 4 × 4 bytes
const OFF_DRUM_SEQ = 3624; // 1 × 11 bytes
const OFF_MCV2 = 3635; // 16 × 4 bytes
const OFF_SRR = 3699; // 16 × 7 bytes
// Addendum (high-bit flags) at the very end of the payload.
const OFF_ADDENDUM_EUC_ON = 4096; // 16 bytes
const OFF_ADDENDUM_EUC_OFF = 4112; // 16 bytes
const OFF_ADDENDUM_SRR = 4128; // 16 bytes

// --- output-destination bit flags (sequencers, drum, SRR) -------------------
function packOutFlags(o: OutputDestFlags): number {
	return (
		(o.outInternal ? 1 : 0) |
		(o.outC ? 2 : 0) |
		(o.outA ? 4 : 0) |
		(o.outD ? 8 : 0) |
		(o.outS ? 16 : 0)
	);
}
function unpackOutFlags(b: number): OutputDestFlags {
	return {
		outInternal: !!(b & 1),
		outC: !!(b & 2),
		outA: !!(b & 4),
		outD: !!(b & 8),
		outS: !!(b & 16)
	};
}

// --- 14-bit short helpers (write/read two consecutive bytes) ----------------
function writeShort(payload: Uint8Array, at: number, value: number): void {
	const p = sysexSafeShort(value);
	payload[at] = p & 0x7f;
	payload[at + 1] = p >> 8;
}

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

// --- Note sequencers (4 bytes: ch-1, outs, clk, pad) ------------------------
function encodeNoteSeq(s: NoteSequencer, payload: Uint8Array, base: number): void {
	payload[base] = (s.channel - 1) & 0x7f;
	payload[base + 1] = packOutFlags(s);
	payload[base + 2] = s.clk & 0x7f;
}
function decodeNoteSeq(payload: Uint8Array, base: number, id: number): NoteSequencer {
	return { id, channel: payload[base] + 1, ...unpackOutFlags(payload[base + 1]), clk: payload[base + 2] };
}

// --- Drum sequencer (ch-1, outs, pad, 8 notes) ------------------------------
function encodeDrumSeq(s: DrumSequencer, payload: Uint8Array, base: number): void {
	payload[base] = (s.channel - 1) & 0x7f;
	payload[base + 1] = packOutFlags(s);
	for (let j = 0; j < FH2_LIMITS.drumNotes; j++) payload[base + 3 + j] = s.notes[j] & 0x7f;
}
function decodeDrumSeq(payload: Uint8Array, base: number): DrumSequencer {
	const notes: number[] = [];
	for (let j = 0; j < FH2_LIMITS.drumNotes; j++) notes.push(payload[base + 3 + j]);
	return { channel: payload[base] + 1, ...unpackOutFlags(payload[base + 1]), notes };
}

// --- MIDI/CV 2 "arp" (clk, m, pad, pad) -------------------------------------
function encodeMcv2(m: Mcv2, payload: Uint8Array, base: number): void {
	payload[base] = m.clk & 0x7f;
	payload[base + 1] =
		((m.channel - 1) & 0xf) | (m.outC ? 16 : 0) | (m.outA ? 32 : 0) | (m.outD ? 64 : 0);
}
function decodeMcv2(payload: Uint8Array, base: number, id: number): Mcv2 {
	const m = payload[base + 1];
	return {
		id,
		clk: payload[base],
		channel: (m & 0xf) + 1,
		outC: !!(m & 16),
		outA: !!(m & 32),
		outD: !!(m & 64)
	};
}

// --- SRR (7 bytes + addendum high-bit flags for change/trigger -1) ----------
function encodeSrr(s: ShiftRegisterRandom, payload: Uint8Array, base: number, i: number): void {
	payload[base] = (s.output + 1) & 0x7f;
	payload[base + 1] = s.change & 0x7f;
	payload[base + 2] = s.trigger & 0x7f;
	payload[base + 3] = s.clk & 0x7f;
	payload[base + 4] = (s.nch < 0 ? 0 : s.nch) & 0x7f;
	payload[base + 5] = (s.channel - 1) & 0x7f;
	payload[base + 6] = packOutFlags(s);
	payload[OFF_ADDENDUM_SRR + i] = (s.change & 0x80 ? 1 : 0) | (s.trigger & 0x80 ? 2 : 0);
}
function decodeSrr(payload: Uint8Array, base: number, i: number, id: number): ShiftRegisterRandom {
	const add = payload[OFF_ADDENDUM_SRR + i];
	const nchRaw = payload[base + 4];
	return {
		id,
		output: payload[base] - 1,
		change: add & 1 ? -1 : payload[base + 1],
		trigger: add & 2 ? -1 : payload[base + 2],
		clk: payload[base + 3],
		nch: nchRaw > 0 ? nchRaw : -1,
		channel: payload[base + 5] + 1,
		...unpackOutFlags(payload[base + 6])
	};
}

// --- LFO resets (2 bytes: (type<<4)|ch, cc) ---------------------------------
function encodeLfoReset(l: LfoReset, payload: Uint8Array, base: number): void {
	payload[base] = ((l.type & 0xf) << 4) | (l.channel & 0xf);
	payload[base + 1] = l.cc & 0x7f;
}
function decodeLfoReset(payload: Uint8Array, base: number): LfoReset {
	return { type: payload[base] >> 4, channel: payload[base] & 0xf, cc: payload[base + 1] };
}

// --- CV→MIDI (flags, type|ch, cc, pad, v0 short, v5 short) ------------------
function encodeCvMidi(c: CvToMidiMapping, payload: Uint8Array, base: number): void {
	payload[base] =
		(c.enabled ? 1 : 0) |
		(c.outI ? 2 : 0) |
		(c.outA ? 4 : 0) |
		(c.outC ? 8 : 0) |
		(c.outD ? 16 : 0) |
		(c.outS ? 32 : 0);
	payload[base + 1] = ((c.type & 0xf) << 4) | ((c.channel - 1) & 0xf);
	payload[base + 2] = c.cc & 0x7f;
	writeShort(payload, base + 4, c.v0);
	writeShort(payload, base + 6, c.v5);
}
function decodeCvMidi(payload: Uint8Array, base: number, id: number): CvToMidiMapping {
	const t = payload[base];
	return {
		id,
		enabled: !!(t & 1),
		outI: !!(t & 2),
		outA: !!(t & 4),
		outC: !!(t & 8),
		outD: !!(t & 16),
		outS: !!(t & 32),
		type: payload[base + 1] >> 4,
		channel: (payload[base + 1] & 0xf) + 1,
		cc: payload[base + 2],
		v0: unSysexSafeSignedShort(bytesToShort(payload[base + 4], payload[base + 5])),
		v5: unSysexSafeSignedShort(bytesToShort(payload[base + 6], payload[base + 7]))
	};
}

// --- HID gamepad (usage, output, scale short, offset short, pad×2) ----------
function encodeGamepad(g: HidGamepad, payload: Uint8Array, base: number): void {
	payload[base] = g.usage & 0x7f;
	payload[base + 1] = g.output & 0x7f;
	writeShort(payload, base + 2, g.scale);
	writeShort(payload, base + 4, g.offset);
}
function decodeGamepad(payload: Uint8Array, base: number, id: number): HidGamepad {
	return {
		id,
		usage: payload[base],
		output: payload[base + 1],
		scale: unSysexSafeSignedShort(bytesToShort(payload[base + 2], payload[base + 3])),
		offset: unSysexSafeSignedShort(bytesToShort(payload[base + 4], payload[base + 5]))
	};
}

// --- HID keyboard (type, output, key, 0, value0 short, value1 short) --------
function encodeKeyboard(k: HidKeyboard, payload: Uint8Array, base: number): void {
	payload[base] = k.type & 0x7f;
	payload[base + 1] = k.output & 0x7f;
	payload[base + 2] = k.key & 0x7f;
	payload[base + 3] = 0;
	writeShort(payload, base + 4, k.value0);
	writeShort(payload, base + 6, k.value1);
}
function decodeKeyboard(payload: Uint8Array, base: number, id: number): HidKeyboard {
	return {
		id,
		type: payload[base],
		output: payload[base + 1],
		key: payload[base + 2],
		value0: unSysexSafeShort(bytesToShort(payload[base + 4], payload[base + 5])),
		value1: unSysexSafeShort(bytesToShort(payload[base + 6], payload[base + 7]))
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

	// MIDI mapping table (384 × 4): active entries first, then 0x7f-padded slots
	{
		let c = OFF_MAPPINGS;
		const entries = config.mappings.slice(0, MAPPING_COUNT);
		for (const m of entries) {
			payload[c] = 0x30 | ((m.channel - 1) & 0xf);
			payload[c + 1] = m.cc & 0x7f;
			payload[c + 2] = (m.group & ~32) | (m.relative ? 32 : 0);
			payload[c + 3] = m.index & 0x7f;
			c += 4;
		}
		const end = OFF_MAPPINGS + MAPPING_COUNT * 4;
		for (; c < end; c += 4) {
			payload[c] = 0x7f;
			payload[c + 1] = 0;
			payload[c + 2] = 0;
			payload[c + 3] = 0;
		}
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

	// HID gamepad / keyboard (32 × 8 each)
	for (let i = 0; i < FH2_LIMITS.hidGamepads; i++) {
		const g = config.hid.gamepad[i];
		if (g) encodeGamepad(g, payload, OFF_GAMEPAD + i * 8);
	}
	for (let i = 0; i < FH2_LIMITS.hidKeyboards; i++) {
		const k = config.hid.keyboard[i];
		if (k) encodeKeyboard(k, payload, OFF_KEYBOARD + i * 8);
	}

	// LFO resets (64 × 2)
	for (let i = 0; i < FH2_LIMITS.lfoResets; i++) {
		const l = config.lfoResets[i];
		if (l) encodeLfoReset(l, payload, OFF_LFO_RESETS + i * 2);
	}

	// CV→MIDI (2 × 8)
	for (let i = 0; i < FH2_LIMITS.cvToMidi; i++) {
		const c = config.cvToMidi[i];
		if (c) encodeCvMidi(c, payload, OFF_CVMIDI + i * 8);
	}

	// Sequencers: note (4 × 4) + drum (1 × 11)
	for (let i = 0; i < FH2_LIMITS.noteSequencers; i++) {
		const s = config.sequencers.note[i];
		if (s) encodeNoteSeq(s, payload, OFF_NOTE_SEQ + i * 4);
	}
	encodeDrumSeq(config.sequencers.drum, payload, OFF_DRUM_SEQ);

	// MIDI/CV 2 "arp" (16 × 4)
	for (let i = 0; i < FH2_LIMITS.mcv2; i++) {
		const m = config.mcv2[i];
		if (m) encodeMcv2(m, payload, OFF_MCV2 + i * 4);
	}

	// Shift-register random (16 × 7 + addendum)
	for (let i = 0; i < FH2_LIMITS.shiftRegisters; i++) {
		const s = config.shiftRegisters[i];
		if (s) encodeSrr(s, payload, OFF_SRR + i * 7, i);
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

	// MIDI mapping table (384 × 4): collect active entries (high nibble 0x3)
	config.mappings = [];
	for (let i = 0; i < MAPPING_COUNT; i++) {
		const base = OFF_MAPPINGS + i * 4;
		const b0 = payload[base];
		if (b0 >> 4 === 3) {
			const t0 = payload[base + 2];
			config.mappings.push({
				channel: (b0 & 0xf) + 1,
				cc: payload[base + 1],
				relative: (t0 & 32) !== 0,
				group: t0 & ~32,
				index: payload[base + 3]
			});
		}
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

	// HID gamepad / keyboard (32 × 8 each)
	for (let i = 0; i < FH2_LIMITS.hidGamepads; i++) {
		config.hid.gamepad[i] = decodeGamepad(payload, OFF_GAMEPAD + i * 8, i + 1);
	}
	for (let i = 0; i < FH2_LIMITS.hidKeyboards; i++) {
		config.hid.keyboard[i] = decodeKeyboard(payload, OFF_KEYBOARD + i * 8, i + 1);
	}

	// LFO resets (64 × 2)
	for (let i = 0; i < FH2_LIMITS.lfoResets; i++) {
		config.lfoResets[i] = decodeLfoReset(payload, OFF_LFO_RESETS + i * 2);
	}

	// CV→MIDI (2 × 8)
	for (let i = 0; i < FH2_LIMITS.cvToMidi; i++) {
		config.cvToMidi[i] = decodeCvMidi(payload, OFF_CVMIDI + i * 8, i + 1);
	}

	// Sequencers: note (4 × 4) + drum (1 × 11)
	for (let i = 0; i < FH2_LIMITS.noteSequencers; i++) {
		config.sequencers.note[i] = decodeNoteSeq(payload, OFF_NOTE_SEQ + i * 4, i + 1);
	}
	config.sequencers.drum = decodeDrumSeq(payload, OFF_DRUM_SEQ);

	// MIDI/CV 2 "arp" (16 × 4)
	for (let i = 0; i < FH2_LIMITS.mcv2; i++) {
		config.mcv2[i] = decodeMcv2(payload, OFF_MCV2 + i * 4, i + 1);
	}

	// Shift-register random (16 × 7 + addendum)
	for (let i = 0; i < FH2_LIMITS.shiftRegisters; i++) {
		config.shiftRegisters[i] = decodeSrr(payload, OFF_SRR + i * 7, i, i + 1);
	}

	// TODO: parse remaining modeled sections here as they gain coverage.

	return config;
}
