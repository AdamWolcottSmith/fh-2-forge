/**
 * Factory for a blank-but-valid FH2Config, plus helpers to build the repeated
 * entity arrays. Used for "New config", mock mode, and as the base the SysEx
 * parser fills in.
 */
import {
	FH2_LIMITS,
	MCV_TYPE,
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
	type ShiftRegisterRandom,
	type TriggerGenerator
} from '$lib/types/fh2';

/** The config-dump version this model targets (matches the device firmware). */
export const TARGET_FIRMWARE = 11;

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
	return { id, type: 0, base: 0, mult: 0, len: 0, output: 0, shift: 0 };
}

export function defaultTrigger(id: number): TriggerGenerator {
	return { id, type: 0, channel: 1, note: 0, output: 0, env: 1 };
}

export function defaultEuclidean(id: number): EuclideanPattern {
	// −1 outputs = disabled (encoded via the addendum high-bit flag).
	return { id, output: -1, offOutput: -1 };
}

const NO_OUT_FLAGS = {
	outInternal: false,
	outC: false,
	outA: false,
	outD: false,
	outS: false
};

export function defaultNoteSequencer(id: number): NoteSequencer {
	return { id, channel: 1, clk: 0, ...NO_OUT_FLAGS };
}

export function defaultDrumSequencer(): DrumSequencer {
	return { channel: 1, notes: range(FH2_LIMITS.drumNotes, () => 0), ...NO_OUT_FLAGS };
}

export function defaultMcv2(id: number): Mcv2 {
	return { id, clk: 0, channel: 1, outC: false, outA: false, outD: false };
}

export function defaultShiftRegister(id: number): ShiftRegisterRandom {
	return {
		id,
		output: -1,
		change: -1,
		trigger: -1,
		clk: 0,
		nch: -1,
		channel: 1,
		...NO_OUT_FLAGS
	};
}

export function defaultLfoReset(): LfoReset {
	return { type: 0, channel: 0, cc: 0 };
}

export function defaultCvToMidi(id: number): CvToMidiMapping {
	return {
		id,
		enabled: false,
		outI: false,
		outA: false,
		outC: false,
		outD: false,
		outS: false,
		type: 0,
		channel: 1,
		cc: 0,
		v0: 0,
		v5: 0
	};
}

export function defaultHidGamepad(id: number): HidGamepad {
	return { id, usage: 0, output: 0, scale: 0, offset: 0 };
}

export function defaultHidKeyboard(id: number): HidKeyboard {
	return { id, type: 0, output: 0, key: 0, value0: 0, value1: 0 };
}

function defaultGlobals(): Globals {
	return {
		// region A
		triggerLength: 50,
		transpose: 0,
		legatoVelocity: true,
		extClockMultiplier: 1,
		extClockRun: 0,
		presetProgramChange: 0,
		softTakeover: false,
		// region B
		tapType: 0,
		tapChannel: 0,
		tapCC: 0,
		euclideanAccent: 0,
		startType: 0,
		startChannel: 0,
		startCC: 0,
		// region C
		tempoMin: 0,
		tempoMax: 0
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
		// 1-based ids to match the device (decode sets id = i+1).
		clocks: range(FH2_LIMITS.clocks, (i) => defaultClock(i + 1)),
		triggers: range(FH2_LIMITS.triggers, (i) => defaultTrigger(i + 1)),
		euclideans: range(FH2_LIMITS.euclideans, (i) => defaultEuclidean(i + 1)),
		sequencers: {
			note: range(FH2_LIMITS.noteSequencers, (i) => defaultNoteSequencer(i + 1)),
			drum: defaultDrumSequencer()
		},
		mcv2: range(FH2_LIMITS.mcv2, (i) => defaultMcv2(i + 1)),
		shiftRegisters: range(FH2_LIMITS.shiftRegisters, (i) => defaultShiftRegister(i + 1)),
		lfoResets: range(FH2_LIMITS.lfoResets, defaultLfoReset),
		// Output range default 1 = ±5V (a sensible bipolar default for CV).
		outputRanges: range(OUTPUT_COUNT, () => 1),
		gateLevels: range(OUTPUT_COUNT, () => ({ lo: 0, hi: 0 })),
		cvToMidi: range(FH2_LIMITS.cvToMidi, (i) => defaultCvToMidi(i + 1)),
		hid: {
			gamepad: range(FH2_LIMITS.hidGamepads, (i) => defaultHidGamepad(i + 1)),
			keyboard: range(FH2_LIMITS.hidKeyboards, (i) => defaultHidKeyboard(i + 1))
		}
	};
}
