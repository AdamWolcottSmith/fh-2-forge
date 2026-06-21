/**
 * FH-2 SysEx protocol primitives — the exact, verified building blocks of the
 * wire format. Ported 1:1 from the official `fh2_config_tool.html` (see
 * `reference/` and `docs/SYSEX_FORMAT.md`). These are the parts we can guarantee
 * byte-for-byte without a device; the full config codec is built on top.
 *
 * Targets firmware config version 11.
 */

/** Expert Sleepers manufacturer SysEx ID. */
export const MANUFACTURER_ID = [0x00, 0x21, 0x27] as const;

/** Device family byte that follows the manufacturer ID for all FH-2 messages. */
export const FH2_FAMILY = 0x2f;

/** The 5-byte prefix shared by every FH-2 SysEx message: F0 00 21 27 2F. */
export const SYSEX_PREFIX = [0xf0, ...MANUFACTURER_ID, FH2_FAMILY] as const;

/** Firmware config version this codec targets. */
export const CONFIG_VERSION = 11;

/** The fixed 8-byte header that opens a config-dump message. */
export const CONFIG_DUMP_HEADER = [0xf0, 0x00, 0x21, 0x27, 0x2f, 0x10, 0x00, 0x00] as const;

/** Config-dump payload is padded to this length before the addendum + F7. */
export const CONFIG_PAYLOAD_PAD = 4096;

/** Command bytes (the byte after FH2_FAMILY). */
export const Command = {
	CONFIG_DUMP: 0x10,
	TEXT_MESSAGE: 0x02,
	SAVE_TO_FLASH: 0x18,
	REQUEST_CONFIG: 0x21,
	REQUEST_VERSION: 0x22,
	VERSION_STRING: 0x32
} as const;

// ---------------------------------------------------------------------------
// 14-bit / signed value packing (verified against the official helpers)
// ---------------------------------------------------------------------------

/** Pack a 14-bit value into the tool's "sysex-safe short" (still one number). */
export function sysexSafeShort(v: number): number {
	return (v & 0x7f) | ((v << 1) & 0x7f00);
}

/** Inverse of {@link sysexSafeShort}. */
export function unSysexSafeShort(v: number): number {
	return (v & 0x7f) | ((v >> 1) & 0x3f80);
}

/** Inverse of {@link sysexSafeShort}, interpreting the 14-bit result as signed. */
export function unSysexSafeSignedShort(v: number): number {
	const s = (v & 0x7f) | ((v >> 1) & 0x3f80);
	return s & 0x2000 ? s - 16384 : s;
}

/** Pack a signed 8-bit value into a single safe byte. */
export function sysexSafeSignedChar(v: number): number {
	return v & 0x7f;
}

/** Inverse of {@link sysexSafeSignedChar}. */
export function unSysexSafeSignedChar(v: number): number {
	return v & 0x40 ? v - 128 : v;
}

/** Split a packed short into its two transmitted bytes `[lo, hi]`. */
export function shortToBytes(packed: number): [number, number] {
	return [packed & 0x7f, packed >> 8];
}

/** Reassemble a packed short from two transmitted bytes. */
export function bytesToShort(lo: number, hi: number): number {
	return (lo & 0x7f) | ((hi & 0x7f) << 8);
}

// ---------------------------------------------------------------------------
// Outgoing command messages (no payload, or simple payloads)
// ---------------------------------------------------------------------------

/** Request a full config dump from the device. */
export function requestConfigMessage(): Uint8Array {
	return new Uint8Array([...SYSEX_PREFIX, Command.REQUEST_CONFIG, 0xf7]);
}

/** Request the firmware version string. */
export function requestVersionMessage(): Uint8Array {
	return new Uint8Array([...SYSEX_PREFIX, Command.REQUEST_VERSION, 0xf7]);
}

/** Tell the device to persist the current config to flash. */
export function saveToFlashMessage(): Uint8Array {
	return new Uint8Array([...SYSEX_PREFIX, Command.SAVE_TO_FLASH, 0x00, 0xf7]);
}

/** Show a short text message on the device (max ~ a few lines of ASCII). */
export function textMessage(text: string): Uint8Array {
	const body = Array.from(text, (ch) => ch.charCodeAt(0) & 0x7f);
	return new Uint8Array([...SYSEX_PREFIX, Command.TEXT_MESSAGE, ...body, 0xf7]);
}

// ---------------------------------------------------------------------------
// Incoming message classification
// ---------------------------------------------------------------------------

export type IncomingMessage =
	| { kind: 'config'; payload: Uint8Array }
	| { kind: 'version'; version: string }
	| { kind: 'unknown'; command: number };

/** Returns true if `data` starts with the FH-2 5-byte prefix. */
export function isFH2Message(data: Uint8Array): boolean {
	if (data.length < SYSEX_PREFIX.length) return false;
	return SYSEX_PREFIX.every((b, i) => data[i] === b);
}

/** Classify a complete incoming FH-2 SysEx message (F0..F7). */
export function classifyMessage(data: Uint8Array): IncomingMessage | null {
	if (!isFH2Message(data)) return null;
	const command = data[5];
	if (command === Command.CONFIG_DUMP) {
		// payload is between the 8-byte header and the trailing F7
		return { kind: 'config', payload: data.slice(8, -1) };
	}
	if (command === Command.VERSION_STRING) {
		const version = String.fromCharCode(...data.slice(6, -1));
		return { kind: 'version', version };
	}
	return { kind: 'unknown', command };
}

/**
 * Validate that a byte blob is a config-dump message (as written to `.syx`).
 * Mirrors the official tool's file-load check.
 */
export function isConfigDumpFile(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 9 &&
		bytes[0] === 0xf0 &&
		bytes[1] === 0x00 &&
		bytes[2] === 0x21 &&
		bytes[3] === 0x27 &&
		bytes[4] === 0x2f &&
		bytes[5] === 0x10 &&
		bytes[bytes.length - 1] === 0xf7
	);
}
