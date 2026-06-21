/**
 * Factory for a blank-but-valid FH2Config, plus helpers to build the repeated
 * entity arrays. Used for "New config", mock mode, and as the base the SysEx
 * parser fills in.
 */
import {
	FH2_LIMITS,
	type ClockGenerator,
	type DrumSequencer,
	type DrumSequencerLane,
	type EnvelopeSettings,
	type EuclideanPattern,
	type FH2Config,
	type Globals,
	type MidiCvConverter,
	type NoteSequencer,
	type NoteSequencerStep,
	type OutputSettings,
	type ShiftRegisterRandom,
	type TriggerGenerator,
	type VoiceModSource
} from '$lib/types/fh2';

/** The firmware revision this model currently targets. @verify */
export const TARGET_FIRMWARE = 8;

const DRUM_STEPS = 16;
const NOTE_STEPS = 16;

function range<T>(count: number, make: (i: number) => T): T[] {
	return Array.from({ length: count }, (_, i) => make(i));
}

function defaultEnvelope(): EnvelopeSettings {
	return { enabled: false, attack: 0, decay: 64, sustain: 100, release: 32, velocityAmount: 0 };
}

function defaultModSource(): VoiceModSource {
	return { enabled: false, amount: 0 };
}

export function defaultConverter(id: number): MidiCvConverter {
	return {
		id,
		enabled: false,
		port: 'usb',
		channel: ((id % 16) + 1) as number,
		noteMin: 0,
		noteMax: 127,
		type: 'mono',
		polyphony: 1,
		allocationMode: 0,
		baseOutput: 1,
		baseGate: 1,
		stride: 1,
		bendRange: 2,
		portamento: 0,
		transpose: 0,
		fineTune: 0,
		envelope: defaultEnvelope(),
		velocity: defaultModSource(),
		aftertouch: defaultModSource(),
		y: defaultModSource(),
		sustainPedal: false,
		monoRetrigger: true,
		interruptGate: false,
		randomEnabled: false
	};
}

export function defaultClock(id: number): ClockGenerator {
	return {
		id,
		enabled: false,
		output: 1,
		division: 24,
		pulseWidth: 64,
		swing: 0,
		phase: 0,
		reset: 0
	};
}

export function defaultTrigger(id: number): TriggerGenerator {
	return {
		id,
		enabled: false,
		output: 1,
		note: 36,
		channel: 10,
		length: 10,
		velocityToLevel: false
	};
}

export function defaultEuclidean(id: number): EuclideanPattern {
	return {
		id,
		enabled: false,
		output: 1,
		pulses: 4,
		steps: 16,
		rotation: 0,
		rate: 24,
		gateLength: 32,
		accentRate: 0,
		reset: 0
	};
}

function defaultNoteStep(): NoteSequencerStep {
	return { note: 60, gate: 0, velocity: 100, tie: false, ratchet: 1 };
}

export function defaultNoteSequencer(id: number): NoteSequencer {
	return {
		id,
		enabled: false,
		output: 1,
		gateOutput: 1,
		steps: range(NOTE_STEPS, defaultNoteStep),
		length: NOTE_STEPS,
		direction: 'forward',
		permutation: 0,
		rate: 24,
		reset: 0,
		transpose: 0
	};
}

function defaultDrumLane(i: number): DrumSequencerLane {
	return {
		output: i + 1,
		steps: range(DRUM_STEPS, () => false),
		accents: range(DRUM_STEPS, () => false),
		probability: range(DRUM_STEPS, () => 127),
		muted: false
	};
}

export function defaultDrumSequencer(): DrumSequencer {
	return {
		enabled: false,
		lanes: range(FH2_LIMITS.drumLanes, defaultDrumLane),
		length: DRUM_STEPS,
		direction: 'forward',
		rate: 24,
		reset: 0
	};
}

export function defaultShiftRegister(id: number): ShiftRegisterRandom {
	return {
		id,
		enabled: false,
		output: 1,
		length: 8,
		probability: 64,
		range: 64,
		rate: 24,
		reset: 0
	};
}

export function defaultOutput(index: number): OutputSettings {
	return {
		index: index + 1,
		range: 'bipolar5',
		offset: 0,
		smoothing: 0,
		invert: false,
		lfo: { enabled: false, shape: 'sine', rate: 1, sync: false, depth: 64, phase: 0 }
	};
}

function defaultGlobals(): Globals {
	return {
		masterChannel: 1,
		clockSource: 'internal',
		tempo: 120,
		clockPpqn: 24,
		sendClock: false,
		voltsPerOctave: 1,
		tuningHz: 440,
		midiThru: false
	};
}

/** Build a fresh, fully-populated default configuration. */
export function createDefaultConfig(name = 'Untitled'): FH2Config {
	return {
		version: TARGET_FIRMWARE,
		name,
		globals: defaultGlobals(),
		converters: range(FH2_LIMITS.converters, defaultConverter),
		clocks: range(FH2_LIMITS.clocks, defaultClock),
		triggers: range(FH2_LIMITS.triggers, defaultTrigger),
		euclideans: range(FH2_LIMITS.euclideans, defaultEuclidean),
		sequencers: {
			note: range(FH2_LIMITS.noteSequencers, defaultNoteSequencer),
			drum: defaultDrumSequencer()
		},
		shiftRegisters: range(FH2_LIMITS.shiftRegisters, defaultShiftRegister),
		outputs: range(FH2_LIMITS.outputs, defaultOutput),
		expanders: { cv: [], gt: [] },
		cvToMidi: [],
		hid: { gamepad: [], keyboard: [] }
	};
}
