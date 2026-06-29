/** Preset `.syx` file I/O, mirroring the config helpers in `fh2-sysex.ts`. */
import { decodePreset, encodePreset, type PresetModel } from './preset-codec';
import { classifyMessage } from './protocol';

/** Serialise a preset to a complete `.syx` preset-dump blob. */
export function presetToSyx(preset: PresetModel): Uint8Array {
	return encodePreset(preset);
}

/** Given a full preset-dump message (F0..F7), return just the preset payload. */
export function extractPresetPayload(bytes: Uint8Array): Uint8Array {
	const msg = classifyMessage(bytes);
	if (msg?.kind === 'preset') return msg.payload;
	throw new Error('Not a valid FH-2 preset dump (.syx) file.');
}

/** Parse a `.syx` preset-dump blob back into a preset model. */
export function syxToPreset(bytes: Uint8Array): PresetModel {
	return decodePreset(extractPresetPayload(bytes));
}
