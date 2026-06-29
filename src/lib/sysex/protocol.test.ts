import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	bytesToShort,
	classifyMessage,
	Command,
	CONFIG_VERSION,
	isConfigDumpFile,
	isFH2Message,
	requestConfigMessage,
	requestVersionMessage,
	saveToFlashMessage,
	shortToBytes,
	sysexSafeShort,
	sysexSafeSignedChar,
	unSysexSafeShort,
	unSysexSafeSignedChar,
	unSysexSafeSignedShort,
	requestPresetMessage,
	isPresetDumpFile,
	PRESET_PAYLOAD_LENGTH
} from './protocol';

const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const presetSyx = new Uint8Array(readFileSync(fixtureDir + 'device-preset-v8.syx'));
const configSyx = new Uint8Array(readFileSync(fixtureDir + 'device-dump-v11.syx'));

describe('value packing', () => {
	it('round-trips unsigned 14-bit values', () => {
		for (const v of [0, 1, 127, 128, 255, 8191, 8192, 16383]) {
			expect(unSysexSafeShort(sysexSafeShort(v))).toBe(v);
		}
	});

	it('round-trips signed 14-bit values', () => {
		for (const v of [0, 1, -1, 127, -128, 8191, -8192]) {
			const packed = sysexSafeShort(v & 0x3fff);
			expect(unSysexSafeSignedShort(packed)).toBe(v);
		}
	});

	it('keeps packed short bytes within MIDI data range', () => {
		const [lo, hi] = shortToBytes(sysexSafeShort(16383));
		expect(lo).toBeLessThanOrEqual(0x7f);
		expect(hi).toBeLessThanOrEqual(0x7f);
		expect(bytesToShort(lo, hi)).toBe(sysexSafeShort(16383));
	});

	it('round-trips signed chars', () => {
		for (const v of [0, 1, -1, 63, -64, -128, 127]) {
			expect(unSysexSafeSignedChar(sysexSafeSignedChar(v & 0xff))).toBe(
				v >= -64 && v < 64 ? v : unSysexSafeSignedChar(v & 0x7f)
			);
		}
		// canonical range used by the tool: -64..63
		expect(unSysexSafeSignedChar(sysexSafeSignedChar(-12 & 0xff))).toBe(-12);
		expect(unSysexSafeSignedChar(sysexSafeSignedChar(40))).toBe(40);
	});
});

describe('command messages', () => {
	it('builds the documented request/version/save messages', () => {
		expect([...requestConfigMessage()]).toEqual([0xf0, 0x00, 0x21, 0x27, 0x2f, 0x21, 0xf7]);
		expect([...requestVersionMessage()]).toEqual([0xf0, 0x00, 0x21, 0x27, 0x2f, 0x22, 0xf7]);
		expect([...saveToFlashMessage()]).toEqual([0xf0, 0x00, 0x21, 0x27, 0x2f, 0x18, 0x00, 0xf7]);
	});
});

describe('incoming classification', () => {
	it('recognises the FH-2 prefix', () => {
		expect(isFH2Message(new Uint8Array([0xf0, 0x00, 0x21, 0x27, 0x2f, 0x10]))).toBe(true);
		expect(isFH2Message(new Uint8Array([0xf0, 0x43, 0x00]))).toBe(false);
	});

	it('extracts a config payload (skips 8-byte header, drops F7)', () => {
		const msg = new Uint8Array([...[0xf0, 0x00, 0x21, 0x27, 0x2f, 0x10, 0x00, 0x00], 1, 2, 3, 0xf7]);
		const result = classifyMessage(msg);
		expect(result?.kind).toBe('config');
		if (result?.kind === 'config') expect([...result.payload]).toEqual([1, 2, 3]);
	});

	it('parses a version string', () => {
		const text = 'FH-2 v1.23';
		const bytes = Array.from(text, (c) => c.charCodeAt(0));
		const msg = new Uint8Array([0xf0, 0x00, 0x21, 0x27, 0x2f, Command.VERSION_STRING, ...bytes, 0xf7]);
		const result = classifyMessage(msg);
		expect(result).toEqual({ kind: 'version', version: text });
	});

	it('validates .syx config-dump files', () => {
		const valid = new Uint8Array([0xf0, 0x00, 0x21, 0x27, 0x2f, 0x10, 0x00, 0x00, 0xf7]);
		expect(isConfigDumpFile(valid)).toBe(true);
		expect(isConfigDumpFile(new Uint8Array([0xf0, 0x43, 0x10, 0xf7]))).toBe(false);
	});

	it('targets config version 11', () => {
		expect(CONFIG_VERSION).toBe(11);
	});
});

describe('preset framing', () => {
	it('builds the preset request message', () => {
		expect([...requestPresetMessage()]).toEqual([0xf0, 0x00, 0x21, 0x27, 0x2f, 0x23, 0xf7]);
	});

	it('recognises a preset dump file and rejects a config dump', () => {
		expect(isPresetDumpFile(presetSyx)).toBe(true);
		expect(isPresetDumpFile(configSyx)).toBe(false);
	});

	it('classifies a preset dump and extracts its payload', () => {
		const msg = classifyMessage(presetSyx);
		expect(msg?.kind).toBe('preset');
		if (msg?.kind === 'preset') {
			expect(msg.payload.length).toBe(PRESET_PAYLOAD_LENGTH);
			expect(msg.payload.length).toBe(4436);
		}
	});
});
