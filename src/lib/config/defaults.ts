/**
 * Factory for a blank-but-valid FH2Config, plus helpers to build the repeated
 * entity arrays. Used for "New config", mock mode, and as the base the SysEx
 * parser fills in.
 */
import {
	FH2_LIMITS,
	MCV_TYPE,
	type ClockGenerator,
	type DrumSequencer,
	type DrumSequencerLane,
	type EuclideanPattern,
	type FH2Config,
	type Globals,
	type MidiCvConverter,
	type NoteSequencer,
	type NoteSequencerStep,
	type OutputSettings,
	type ShiftRegisterRandom,
	type TriggerGenerator
} from '$lib/types/fh2';

/** The firmware revision this model currently targets. @verify */
export const TARGET_FIRMWARE = 8;

const DRUM_STEPS = 16;
const NOTE_STEPS = 16;

function range<T>(count: number, make: (i: number) => T): T[] {
	return Array.from({ length: count }, (_, i) => make(i));
}

export function defaultConverter(id: number): MidiCvConverter {
	return {
		id,
		enabled: false,
		channel: ((id - 1) % 16) + 1,
		noteMin: 0,
		noteMax: 127,
		type: MCV_TYPE.MONO,
		polyphony: 1,
		bendDepth: 2,
		bendDownDepth: 2,
		scheme: 0,
		ignoreSurplus: false,
		gatedPressure: false,
		sustain: 0,
		baseOutput: 0,
		stride: 1,
		lastMpeChannel: 16,
		pressure: false,
		paraGate: false,
		cvOutput: true,
		gateOutput: true,
		velGateOutput: false,
		velOutput: 0,
		relVelOutput: 0,
		triggerOutput: false,
		voicePressureOutput: false,
		mpeYOutput: 0,
		envOutput: false,
		baseGate: 0,
		monoRetrigger: true,
		interruptGate: false,
		envZeroStart: false,
		pitchBendOutput: 0,
		randomOutput: false
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
		// Converters are numbered 1..16 to match the device (decodeMcv sets id = i+1).
		converters: range(FH2_LIMITS.converters, (i) => defaultConverter(i + 1)),
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
