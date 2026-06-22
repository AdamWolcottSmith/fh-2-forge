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
	noteSequencers: 8,
	drumLanes: 8,
	shiftRegisters: 8,
	/** FH-2 has 8 physical outputs; expanders extend the addressable range to 128. */
	outputs: 8,
	/** Max addressable output index across the FH-2 + all expanders. */
	maxOutput: 128,
	/** Up to 6 FHX-8CV and/or FHX-8GT expanders may be chained. @verify */
	expandersCV: 6,
	expandersGT: 6,
	hidGamepads: 4,
	hidKeyboards: 4
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

export type SequencerDirection = 'forward' | 'reverse' | 'pingpong' | 'random' | 'brownian';

export interface NoteSequencerStep {
	note: MidiNote;
	/** 0 = rest, otherwise gate length 1..127. */
	gate: number;
	velocity: number;
	/** Tie into the next step (sustain). */
	tie: boolean;
	/** Number of retriggers within the step (ratcheting). */
	ratchet: number;
}

export interface NoteSequencer {
	id: number;
	enabled: boolean;
	output: OutputIndex;
	gateOutput: OutputIndex;
	steps: NoteSequencerStep[];
	length: number;
	direction: SequencerDirection;
	/** Step-order permutation index, if the FH-2 exposes permutations. @verify */
	permutation: number;
	/** Clock rate/division. @verify encoding. */
	rate: number;
	reset: number;
	transpose: number;
}

export interface DrumSequencerLane {
	output: OutputIndex;
	/** One boolean per step: hit or no hit. */
	steps: boolean[];
	/** Per-step accent flags, aligned to `steps`. */
	accents: boolean[];
	/** Per-step probability 0..127, aligned to `steps`. */
	probability: number[];
	muted: boolean;
}

export interface DrumSequencer {
	enabled: boolean;
	lanes: DrumSequencerLane[]; // up to FH2_LIMITS.drumLanes
	length: number;
	direction: SequencerDirection;
	rate: number;
	reset: number;
}

// ---------------------------------------------------------------------------
// Shift-register random (Turing-machine style)
// ---------------------------------------------------------------------------

export interface ShiftRegisterRandom {
	id: number;
	enabled: boolean;
	output: OutputIndex;
	/** Register length in bits/steps. */
	length: number;
	/** Randomisation probability, 0..127 (0 = locked, 127 = fully random). */
	probability: number;
	/** Output voltage range scaling, 0..127. */
	range: number;
	rate: number;
	reset: number;
}


// ---------------------------------------------------------------------------
// Expanders
// ---------------------------------------------------------------------------

export interface FHX8CVConfig {
	/** Position in the expander chain, 0-based. */
	slot: number;
	enabled: boolean;
	/** Base output index this expander's 8 CV outputs map to. */
	baseOutput: OutputIndex;
}

export interface FHX8GTConfig {
	slot: number;
	enabled: boolean;
	/** Base output index this expander's 8 gate outputs map to. */
	baseOutput: OutputIndex;
}

// ---------------------------------------------------------------------------
// CV → MIDI
// ---------------------------------------------------------------------------

export type CvToMidiMode = 'cc' | 'note' | 'pitchbend' | 'aftertouch' | 'clock' | 'start-stop';

export interface CvToMidiMapping {
	id: number;
	enabled: boolean;
	/** Physical input used as the CV source. @verify input addressing. */
	input: number;
	mode: CvToMidiMode;
	channel: MidiChannel;
	cc?: MidiCC;
	/** Input voltage that maps to MIDI value 0. */
	rangeLow: number;
	/** Input voltage that maps to MIDI value 127. */
	rangeHigh: number;
}

// ---------------------------------------------------------------------------
// HID (USB gamepad / keyboard)
// ---------------------------------------------------------------------------

export interface HIDGamepadConfig {
	id: number;
	enabled: boolean;
	/** Mapping from gamepad controls to outputs/MIDI. @verify shape. */
	mappings: HIDMapping[];
}

export interface HIDKeyboardConfig {
	id: number;
	enabled: boolean;
	mappings: HIDMapping[];
}

export interface HIDMapping {
	/** HID control identifier (button/axis index). */
	control: number;
	/** Destination output, or 0 for MIDI. */
	output?: OutputIndex;
	/** Destination MIDI CC, when routed to MIDI. */
	cc?: MidiCC;
	channel?: MidiChannel;
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
	converters: MidiCvConverter[]; // up to 16
	clocks: ClockGenerator[]; // up to 32
	triggers: TriggerGenerator[]; // up to 64
	euclideans: EuclideanPattern[]; // up to 16
	sequencers: {
		note: NoteSequencer[];
		drum: DrumSequencer;
	};
	shiftRegisters: ShiftRegisterRandom[];
	/** Output voltage range per addressable output (OUTPUT_COUNT entries). */
	outputRanges: number[];
	/** Per-output gate low/high levels (OUTPUT_COUNT entries). */
	gateLevels: GateLevel[];
	expanders: {
		cv: FHX8CVConfig[];
		gt: FHX8GTConfig[];
	};
	cvToMidi: CvToMidiMapping[];
	hid: {
		gamepad: HIDGamepadConfig[];
		keyboard: HIDKeyboardConfig[];
	};
}
