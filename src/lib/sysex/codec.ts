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
import type { FH2Config } from '$lib/types/fh2';
import {
	CONFIG_DUMP_HEADER,
	CONFIG_PAYLOAD_PAD,
	CONFIG_VERSION,
	isConfigDumpFile
} from './protocol';

/** Bytes of addendum (high-bits) appended after the 4096-byte padded body. */
const ADDENDUM_BYTES = 16 /* euc out */ + 16 /* euc off-out */ + 16; /* srr */

/** Total config-dump payload length (between the 8-byte header and F7). */
export const PAYLOAD_LENGTH = CONFIG_PAYLOAD_PAD + ADDENDUM_BYTES;

// --- field offsets within the payload (see SYSEX_FORMAT.md) -----------------
const OFF_VERSION = 0; // 4 bytes, LE int32
const OFF_NAME = 4; // 16 bytes ASCII; cursor then advances 17
const NAME_LENGTH = 16;

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

	// TODO: parse remaining modeled sections here as they gain coverage.

	return config;
}
