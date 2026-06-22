/**
 * FH-2 Forge — core configuration data model.
 *
 * This models the full configuration surface of the Expert Sleepers FH-2
 * "factory hub" Eurorack module. It is the single source of truth that the UI
 * edits and that the SysEx layer (see `$lib/sysex`) serialises to/from the
 * device and `.syx` files.
 *
 * SOURCE-OF-TRUTH STATUS
 * ----------------------
 * This is a first-pass model assembled from the FH-2 manual and the public
 * config tool's feature set. Field names, ranges, and enum orderings marked
 * `@verify` MUST be reconciled against the official tool's source
 * (expertsleepersltd/FH-2_tools — `fh2_config_tool.html`) before the SysEx
 * codec is considered round-trip safe. Until then, treat the SysEx layer as
 * mock-only. Do not ship binary export without this reconciliation.
 *
 * Numeric ranges use `min`/`max`/`default` documented in JSDoc rather than
 * branded types, to keep the model serialisation-friendly. Validation lives in
 * `$lib/config/validate` (Phase 2).
 */

/** Hard limits on how many of each entity the FH-2 supports. @verify counts against firmware. */
export const FH2_LIMITS = {
	converters: 16,
	clocks: 32,
	triggers: 64,
	euclideans: 16,
	/** Maximum entries in the MIDI-mapping table. */
	mappings: 384,
	noteSequencers: 4,
	/** Drum sequencer note assignments (8 lanes, one note each). */
	drumNotes: 8,
	/** Secondary MIDI/CV ("arp") routings. */
	mcv2: 16,
	shiftRegisters: 16,
	/** Per-output LFO-reset assignments. */
	lfoResets: 64,
	/** FH-2 has 8 physical outputs; expanders extend the addressable range. */
	outputs: 8,
	/** Max addressable output index across the FH-2 + all expanders. */
	maxOutput: 128,
	/** CV→MIDI input mappings. */
	cvToMidi: 2,
	hidGamepads: 32,
	hidKeyboards: 32
} as const;

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** 1-based output index, 1..128 (FH-2 itself = 1..8, expanders above). */
export type OutputIndex = number;

/** MIDI channel, 1..16. 0 may encode "omni" in some sections. @verify */
export type MidiChannel = number;

/** MIDI CC number, 0..127. */
export type MidiCC = number;

/** MIDI note number, 0..127. */
export type MidiNote = number;

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
//
// Modeled from the official tool's global fields. These are split across three
// regions of the config dump (A: offset 21, B: offset 2924, C: offset 3604);
// the codec writes each to the right place. Numeric fields hold the raw wire
// value (0-based) unless noted; transpose is a signed value.

/** Ext-clock run control (byte). */
export const EXT_CLOCK_RUN_LABELS = ['None', 'Run/Stop on Y'] as const;
/** Tap-tempo trigger source (byte). */
export const TAP_TYPE_LABELS = ['None', 'Note', 'CC'] as const;
/** Start/Stop control source (byte). */
export const START_TYPE_LABELS = [
	'None',
	'Note Toggle',
	'CC Toggle',
	'Note Gate',
	'CC Gate',
	'Y Toggle',
	'Y Gate'
] as const;

export interface Globals {
	// --- region A (offset 21) ---
	/** Default trigger length, 1..100 (ms). */
	triggerLength: number;
	/** Global transpose in semitones, −48..48 (signed on the wire). */
	transpose: number;
	/** Legato velocity. */
	legatoVelocity: boolean;
	/** External-clock multiplier, 1..96. */
	extClockMultiplier: number;
	/** External-clock run control (index into EXT_CLOCK_RUN_LABELS). */
	extClockRun: number;
	/** Preset program-change channel: 0 = Off, 1..16. */
	presetProgramChange: number;
	/** Soft takeover for CC control. */
	softTakeover: boolean;

	// --- region B (offset 2924) ---
	/** Tap-tempo source (index into TAP_TYPE_LABELS). */
	tapType: number;
	/** Tap-tempo MIDI channel (raw wire value). */
	tapChannel: number;
	/** Tap-tempo MIDI CC (raw wire value). */
	tapCC: number;
	/** Euclidean accent threshold, raw 0..127 (UI shows +1). */
	euclideanAccent: number;
	/** Start/Stop source (index into START_TYPE_LABELS). */
	startType: number;
	/** Start/Stop MIDI channel (raw wire value). */
	startChannel: number;
	/** Start/Stop MIDI CC (raw wire value). */
	startCC: number;

	// --- region C (offset 3604) ---
	/** Tempo range minimum, raw 0..127 (UI shows value+1 BPM). */
	tempoMin: number;
	/** Tempo range maximum, raw 0..127 (UI shows value+128 BPM). */
	tempoMax: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Number of addressable outputs that carry a range + gate-level (FH-2 + expanders). */
export const OUTPUT_COUNT = 64;

/** Output voltage range (the `rng_*` byte). */
export const OUTPUT_RANGE_LABELS = ['0-10V', '±5V', '0-1V', '0-5V', '0-8V'] as const;
export type OutputRange = 0 | 1 | 2 | 3 | 4;

/** Per-output gate high/low levels — two 14-bit values packed as sysex shorts. */
export interface GateLevel {
	/** Gate "off"/low level. */
	lo: number;
	/** Gate "on"/high level. */
	hi: number;
}

// ---------------------------------------------------------------------------
// MIDI/CV Converters (up to 16)
// ---------------------------------------------------------------------------
//
// Modeled byte-for-byte against the official tool's `makeSysExMcv()` /
// `parseMcv()` — 32 bytes per converter. See docs/SYSEX_FORMAT.md.

/** Converter type (byte 4). 0=Mono, 1=Poly, 2=MPE. */
export const MCV_TYPE = { MONO: 0, POLY: 1, MPE: 2 } as const;
export type McvType = (typeof MCV_TYPE)[keyof typeof MCV_TYPE];
export const MCV_TYPE_LABELS = ['Mono', 'Poly', 'MPE'] as const;

/** Voice-allocation scheme (byte 7). */
export const MCV_SCHEME_LABELS = [
	'Round robin',
	'Lowest voice',
	'Unison',
	'Unison 2',
	'Note range',
	'Alternating',
	'Random'
] as const;
export type McvScheme = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * One MIDI/CV converter. Field order here is documentary; the wire byte order
 * is defined by the codec's MCV field table. Values are stored as the
 * user-facing (1-based where the device uses 0-based) numbers; the codec applies
 * the ±1 transforms. Boolean toggles map to 0/1 bytes.
 *
 * Several "output" fields (velOutput, relVelOutput, mpeYOutput, pitchBendOutput)
 * hold an output/CC index where 0 = off.
 */
export interface MidiCvConverter {
	/** 1..16, matches the device converter number. */
	id: number;
	enabled: boolean;
	/** MIDI channel, 1..16 (stored on the wire as channel−1). */
	channel: MidiChannel;
	/** Note range gate (notes outside are ignored). 0..127. */
	noteMin: MidiNote;
	noteMax: MidiNote;
	type: McvType;
	/** Number of voices, 1..16 (voices). */
	polyphony: number;
	/** Pitch-bend up range, semitones. */
	bendDepth: number;
	/** Pitch-bend down range, semitones. */
	bendDownDepth: number;
	/** Voice-allocation scheme. */
	scheme: McvScheme;
	/** "Ignore surplus" — drop instead of steal voices when over polyphony. */
	ignoreSurplus: boolean;
	/** Gated channel-pressure (GA). */
	gatedPressure: boolean;
	/** Sustain (SUS). */
	sustain: number;
	/** First output for this converter's pitch CVs, 0-based (0..63). */
	baseOutput: number;
	/** Output spacing between successive voices, 1..32. */
	stride: number;
	/** Last MPE MIDI channel, 1-based (stored as value−1). */
	lastMpeChannel: number;
	/** Channel-pressure CV output (A). */
	pressure: boolean;
	/** Paraphonic gate (G). */
	paraGate: boolean;
	/** Pitch CV output enabled (VC). */
	cvOutput: boolean;
	/** Gate output enabled (VG). */
	gateOutput: boolean;
	/** Velocity-gated output (VVG). */
	velGateOutput: boolean;
	/** Velocity CV output/CC index, 0 = off (VV). */
	velOutput: number;
	/** Release-velocity output/CC index, 0 = off (VR). */
	relVelOutput: number;
	/** Trigger output enabled (VT). */
	triggerOutput: boolean;
	/** Per-voice pressure output (VP). */
	voicePressureOutput: boolean;
	/** MPE Y-axis output/CC index (VY). */
	mpeYOutput: number;
	/** Envelope output enabled (VE). */
	envOutput: boolean;
	/** Base gate output index; 0 or 64..127. */
	baseGate: number;
	/** Mono retrigger (MT). */
	monoRetrigger: boolean;
	/** Interrupt gate (IG). */
	interruptGate: boolean;
	/** Envelope zero-start (ZS). */
	envZeroStart: boolean;
	/** Pitch-bend CV output/CC index, 0 = off (PB). */
	pitchBendOutput: number;
	/** Random CV output enabled (VRND). */
	randomOutput: boolean;
}

// ---------------------------------------------------------------------------
// Clock generators (up to 32)
// ---------------------------------------------------------------------------
//
// 8 bytes per clock on the wire, 6 used (mirroring makeSysExClocks). Pattern
// params beyond these (and which MIDI CCs control them live) come from the
// mapping table, modeled later.

export interface ClockGenerator {
	id: number; // 1..32
	/** Clock type/mode (raw value; 0 = off). */
	type: number;
	/** Clock base division. */
	base: number;
	/** Clock multiplier. */
	mult: number;
	/** Output pulse length. */
	len: number;
	/** Output index. */
	output: number;
	/** Phase shift. */
	shift: number;
}

// ---------------------------------------------------------------------------
// Trigger generators (up to 64)
// ---------------------------------------------------------------------------
//
// 4 bytes per trigger, bit-packed (mirroring makeSysExTriggers): the envelope
// assignment is split across two bytes and "any note" is a flag bit.

export interface TriggerGenerator {
	id: number; // 1..64
	/** Trigger type, 0..15. */
	type: number;
	/** MIDI channel, 1..16. */
	channel: MidiChannel;
	/** Trigger note, or −1 for "any note". */
	note: number;
	/** Output index. */
	output: number;
	/** Envelope assignment, 1-based (stored as value−1 across two bytes). */
	env: number;
}

// ---------------------------------------------------------------------------
// Euclidean output assignments (up to 16)
// ---------------------------------------------------------------------------
//
// The config dump's euclidean section stores only the on/off output
// assignments; −1 means "no output" and is encoded as a high-bit flag in the
// addendum region. The rhythmic parameters (pulses/steps/rotation/…) are driven
// via the mapping table and will be modeled with it.

export interface EuclideanPattern {
	id: number; // 1..16
	/** Output index driven on a hit, or −1 for none. */
	output: number;
	/** Output index driven on a rest ("off"), or −1 for none. */
	offOutput: number;
}

// ---------------------------------------------------------------------------
// Sequencers
// ---------------------------------------------------------------------------
//
// The config dump stores the sequencers' MIDI/output routing (the per-step note
// and pattern data is edited live on the device / via the mapping table).

/** Output-destination flags shared by sequencers and SRR. */
export interface OutputDestFlags {
	/** Internal routing. */
	outInternal: boolean;
	outC: boolean;
	outA: boolean;
	outD: boolean;
	outS: boolean;
}

/** Note sequencer routing (4 of them). */
export interface NoteSequencer extends OutputDestFlags {
	id: number; // 1..4
	channel: MidiChannel; // 1..16
	clk: number;
}

/** The single drum sequencer's routing + 8 note assignments. */
export interface DrumSequencer extends OutputDestFlags {
	channel: MidiChannel; // 1..16
	/** 8 drum-lane note numbers. */
	notes: number[];
}

// ---------------------------------------------------------------------------
// MIDI/CV 2 ("arp") — secondary per-converter routing (16)
// ---------------------------------------------------------------------------

export interface Mcv2 {
	id: number; // 1..16
	clk: number;
	channel: MidiChannel; // 1..16
	outC: boolean;
	outA: boolean;
	outD: boolean;
}

// ---------------------------------------------------------------------------
// Shift-register random (16)
// ---------------------------------------------------------------------------

export interface ShiftRegisterRandom extends OutputDestFlags {
	id: number; // 1..16
	/** Output index, or −1 for none (stored as value+1). */
	output: number;
	/** "Change" output, or −1 (−1 via addendum high-bit flag). */
	change: number;
	/** "Trigger" output, or −1 (−1 via addendum high-bit flag). */
	trigger: number;
	clk: number;
	/** Number of channels, or −1 for none. */
	nch: number;
	channel: MidiChannel; // 1..16
}

// ---------------------------------------------------------------------------
// CV → MIDI (2 inputs)
// ---------------------------------------------------------------------------

export interface CvToMidiMapping {
	id: number; // 1..2
	enabled: boolean;
	/** Output-to-MIDI flags (I/A/C/D/S). */
	outI: boolean;
	outA: boolean;
	outC: boolean;
	outD: boolean;
	outS: boolean;
	type: number;
	channel: MidiChannel; // 1..16
	cc: MidiCC;
	/** Input voltage mapped to MIDI 0 (signed 14-bit). */
	v0: number;
	/** Input voltage mapped to MIDI 127 (signed 14-bit). */
	v5: number;
}

// ---------------------------------------------------------------------------
// LFO resets (per output, 64)
// ---------------------------------------------------------------------------

export interface LfoReset {
	/** Reset trigger type (0..15). */
	type: number;
	/** MIDI channel, raw 0..15. */
	channel: number;
	cc: MidiCC;
}

// ---------------------------------------------------------------------------
// HID (USB gamepad / keyboard) — 32 mappings each
// ---------------------------------------------------------------------------

export interface HidGamepad {
	id: number; // 1..32
	/** HID usage code. */
	usage: number;
	output: number;
	/** Scale, signed 14-bit. */
	scale: number;
	/** Offset, signed 14-bit. */
	offset: number;
}

export interface HidKeyboard {
	id: number; // 1..32
	type: number;
	output: number;
	/** Key code. */
	key: number;
	/** Value at key-down (14-bit). */
	value0: number;
	/** Value at key-up (14-bit). */
	value1: number;
}

// ---------------------------------------------------------------------------
// MIDI mapping table (up to 384 entries) — the MIDI-learn backbone
// ---------------------------------------------------------------------------
//
// A flat list of "this MIDI CC controls that parameter" assignments. Each entry
// is 4 bytes on the wire: [0x30|ch, cc, group(+32 if relative), index]. Rather
// than reverse every (group,index) to a named destination, we keep the semantic
// entry — it round-trips exactly and a UI resolver can interpret the codes.
//
// Group codes (from the official encoder): output sources 0..8 (with a high/low
// + index-offset scheme via `index`); per-converter arp=9, mcvCommands=11,
// mcvm2=12, mcvm3=16; euclidean=10; SRR=15; note/drum seq=13; drum lanes=14;
// and global functions 69/71/72/74/75/76/77/78/79 (tempo, display, swing,
// nudge, inc/dec tempo).

export interface Mapping {
	/** Source MIDI channel, 1..16. */
	channel: MidiChannel;
	/** Source MIDI CC, 0..127. */
	cc: MidiCC;
	/** Relative (incremental) encoder mode rather than absolute. */
	relative: boolean;
	/** Destination control-group code (see note above). */
	group: number;
	/** Destination index within the group. */
	index: number;
}

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export interface FH2Config {
	/** Firmware version this config targets (affects SysEx encoding). */
	version: number;
	name: string;
	/**
	 * Last-known raw config-dump payload (the 4144 bytes between the 8-byte
	 * header and the trailing F7), if this config came from a device or `.syx`
	 * file. The codec preserves any bytes the typed model does not yet cover, so
	 * round-trips stay byte-perfect while the model is filled in section by
	 * section. Cleared/absent for freshly-created configs.
	 */
	raw?: Uint8Array;
	globals: Globals;
	converters: MidiCvConverter[]; // 16
	clocks: ClockGenerator[]; // 32
	triggers: TriggerGenerator[]; // 64
	euclideans: EuclideanPattern[]; // 16
	/** MIDI-mapping table entries (0..384), in wire order. */
	mappings: Mapping[];
	sequencers: {
		note: NoteSequencer[]; // 4
		drum: DrumSequencer; // 1
	};
	mcv2: Mcv2[]; // 16
	shiftRegisters: ShiftRegisterRandom[]; // 16
	lfoResets: LfoReset[]; // 64
	/** Output voltage range per addressable output (OUTPUT_COUNT entries). */
	outputRanges: number[];
	/** Per-output gate low/high levels (OUTPUT_COUNT entries). */
	gateLevels: GateLevel[];
	cvToMidi: CvToMidiMapping[]; // 2
	hid: {
		gamepad: HidGamepad[]; // 32
		keyboard: HidKeyboard[]; // 32
	};
}
