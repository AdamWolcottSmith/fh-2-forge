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

/** Source of a MIDI stream feeding a converter or destination. @verify enum order */
export type MidiPort = 'usb' | 'din' | 'select' | 'internal';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

export interface Globals {
	/** Master MIDI channel used by global functions. @verify */
	masterChannel: MidiChannel;
	/** Clock source: internal BPM, external MIDI clock, or analog clock input. */
	clockSource: 'internal' | 'midi' | 'analog';
	/** Internal clock tempo in BPM (used when clockSource === 'internal'). */
	tempo: number;
	/** Pulses-per-quarter-note for the analog clock output/input. @verify */
	clockPpqn: number;
	/** Whether the module sends MIDI clock out. */
	sendClock: boolean;
	/** Global pitch reference: volts-per-octave (1.0 = 1V/oct). */
	voltsPerOctave: number;
	/** Tuning reference note frequency, Hz (typically 440). */
	tuningHz: number;
	/** Route incoming USB MIDI to DIN out and vice-versa. @verify */
	midiThru: boolean;
}

// ---------------------------------------------------------------------------
// Envelope (shared by converters and elsewhere)
// ---------------------------------------------------------------------------

export interface EnvelopeSettings {
	enabled: boolean;
	/** Attack time, 0..127 device units. */
	attack: number;
	/** Decay time, 0..127. */
	decay: number;
	/** Sustain level, 0..127. */
	sustain: number;
	/** Release time, 0..127. */
	release: number;
	/** Velocity → envelope amount, 0..127. @verify */
	velocityAmount: number;
}

// ---------------------------------------------------------------------------
// MIDI/CV Converters (up to 16)
// ---------------------------------------------------------------------------

/** Voice-allocation strategy for a converter. @verify exact set + encoding. */
export type ConverterType = 'mono' | 'poly' | 'mpe' | 'unison' | 'cc' | 'velocity' | 'aftertouch';

export interface MidiCvConverter {
	id: number;
	enabled: boolean;
	port: MidiPort;
	/** MIDI channel this converter listens on. */
	channel: MidiChannel;
	/** Note range gate (notes outside are ignored). */
	noteMin: MidiNote;
	noteMax: MidiNote;
	type: ConverterType;
	/** Number of voices for poly/unison/mpe (1..16 within output budget). */
	polyphony: number;
	/** Note-allocation mode (rotate / reuse / oldest / etc.). @verify encoding. */
	allocationMode: number;

	/** First output used for this converter's pitch CVs. 1..128. */
	baseOutput: OutputIndex;
	/** First output used for this converter's gates. 1..128. */
	baseGate: OutputIndex;
	/** Output spacing between successive voices. */
	stride: number;

	/** Pitch-bend range in semitones. */
	bendRange: number;
	/** Portamento/glide time, 0..127. */
	portamento: number;
	/** Transpose in semitones. */
	transpose: number;
	/** Fine tune, cents. @verify range. */
	fineTune: number;

	envelope: EnvelopeSettings;

	/** Velocity CV output settings. */
	velocity: VoiceModSource;
	/** Channel/poly aftertouch CV output settings. */
	aftertouch: VoiceModSource;
	/** Mod wheel / "Y" CC CV output settings. */
	y: VoiceModSource;

	/** Hold gates while sustain pedal (CC64) is down. */
	sustainPedal: boolean;
	/** Retrigger envelope/gate on legato notes in mono mode. */
	monoRetrigger: boolean;
	/** Briefly drop the gate between consecutive notes ("interrupt gate"). */
	interruptGate: boolean;
	/** Emit a random CV per note-on. */
	randomEnabled: boolean;
}

/**
 * A modulation source (velocity, aftertouch, mod wheel, random) that can be
 * routed to a dedicated CV output. @verify field set against the official tool.
 */
export interface VoiceModSource {
	enabled: boolean;
	/** Output index this source drives, or 0/undefined for "use voice stride". */
	output?: OutputIndex;
	/** Output amount/scaling, 0..127. */
	amount: number;
}

// ---------------------------------------------------------------------------
// Clock generators (up to 32)
// ---------------------------------------------------------------------------

export interface ClockGenerator {
	id: number;
	enabled: boolean;
	output: OutputIndex;
	/** Clock division/multiplication relative to the master clock. @verify encoding. */
	division: number;
	/** Output pulse width, 0..127. */
	pulseWidth: number;
	/** Swing amount, 0..127 (0 = straight). */
	swing: number;
	/** Phase offset in steps. */
	phase: number;
	/** Reset behaviour / reset source. @verify */
	reset: number;
}

// ---------------------------------------------------------------------------
// Trigger generators (up to 64)
// ---------------------------------------------------------------------------

export interface TriggerGenerator {
	id: number;
	enabled: boolean;
	output: OutputIndex;
	/** MIDI note that fires this trigger. */
	note: MidiNote;
	channel: MidiChannel;
	/** Trigger pulse length, ms or device units. @verify */
	length: number;
	/** Use velocity to scale the trigger's CV level. */
	velocityToLevel: boolean;
}

// ---------------------------------------------------------------------------
// Euclidean patterns (up to 16)
// ---------------------------------------------------------------------------

export interface EuclideanPattern {
	id: number;
	enabled: boolean;
	output: OutputIndex;
	/** Number of active pulses distributed across `steps`. */
	pulses: number;
	/** Total steps in the pattern. */
	steps: number;
	/** Rotation offset of the pattern, in steps. */
	rotation: number;
	/** Clock rate/division driving the pattern. @verify encoding. */
	rate: number;
	/** Output gate length, 0..127. */
	gateLength: number;
	/** Probability/rate of accented hits, 0..127. */
	accentRate: number;
	/** Reset source/behaviour. @verify */
	reset: number;
	/** Optional MIDI channel for triggering/recording. */
	channel?: MidiChannel;
	/** Optional CC for live control of the pattern. */
	cc?: MidiCC;
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
// Per-output settings (LFO, range, smoothing)
// ---------------------------------------------------------------------------

export type OutputVoltageRange = 'unipolar5' | 'unipolar8' | 'unipolar10' | 'bipolar5' | 'bipolar10';

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'ramp' | 'square' | 'random' | 'sampleHold';

export interface OutputLfo {
	enabled: boolean;
	shape: LfoShape;
	/** Rate; synced to clock when `sync` is true, else free Hz. @verify units. */
	rate: number;
	sync: boolean;
	depth: number;
	phase: number;
}

export interface OutputSettings {
	/** Output index, 1..128. */
	index: OutputIndex;
	/** Human label shown in the UI (not necessarily stored on device). */
	name?: string;
	range: OutputVoltageRange;
	/** Output offset voltage, device units. */
	offset: number;
	/** Slew/smoothing amount, 0..127. */
	smoothing: number;
	/** Invert the output. */
	invert: boolean;
	lfo: OutputLfo;
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
	outputs: OutputSettings[]; // one per addressable output in use
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
