# FH-2 Preset Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lossless FH-2 *preset* SysEx codec + transport that loads a real preset, round-trips it byte-for-byte, decodes/edits the 16 Euclidean generators, and sends it back.

**Architecture:** Mirror the existing config stack (`protocol.ts` → `codec.ts` → `fh2-sysex.ts`). Extend `protocol.ts` in place with preset framing; add `preset-codec.ts` using the raw-passthrough strategy (decode stashes the whole payload on `model.raw`; encode starts from `model.raw` and overwrites only modeled bytes, guaranteeing byte-exact round-trip); add `preset-sysex.ts` for `.syx` helpers; extend the existing transport (the port owner) with `requestPreset`/`sendPreset`.

**Tech Stack:** TypeScript, SvelteKit, Vitest. Node `fs` in tests to read committed `.syx` fixtures.

## Global Constraints

- **Preset format version = 8** (config is 11). Header: `F0 00 21 27 2F 13 00 00 … F7`.
- **Preset dump command = `0x13`; preset request command = `0x23`.**
- **Preset payload length = 4436 bytes** (4445-byte fixture − 8 header − 1 `F7`).
- **Lossless by construction:** `encodePreset` starts from `model.raw`; never re-derive bytes outside modeled fields. Acceptance gate is byte-for-byte round-trip of `device-preset-v8.syx`.
- **Euclidean section:** payload offset **1372**, 16 generators × **8** bytes (7 used + 1 pad), fields in order `P,S,R,T,G,A,E` → `pulses, steps, rotation, rate, gateLength, accent, reset`. All bytes are plain 0–127 (no addendum).
- **Fixtures (already committed):** `src/lib/sysex/fixtures/device-preset-v8.syx`, `src/lib/sysex/fixtures/device-dump-v11.syx`.
- Run tests with `npx vitest run <path>`. Commit after every passing task.
- `unSysexSafeInt` (preset tempo) is **deferred** — not needed for Euclidean; add it when tempo/drum fields are modeled in a later slice.

---

## File Structure

- **Modify** `src/lib/sysex/protocol.ts` — add preset framing constants + `requestPresetMessage`, `isPresetDumpFile`, preset case in `classifyMessage`.
- **Modify** `src/lib/sysex/protocol.test.ts` — framing tests.
- **Create** `src/lib/sysex/preset-codec.ts` — `PresetModel`, `EuclideanGenerator`, `decodePreset`, `encodePreset`, `createEmptyPreset`.
- **Create** `src/lib/sysex/preset-codec.test.ts` — round-trip + Euclidean field tests against the fixture.
- **Create** `src/lib/sysex/preset-sysex.ts` — `presetToSyx`, `syxToPreset`, `extractPresetPayload`.
- **Create** `src/lib/sysex/preset-sysex.test.ts` — `.syx` round-trip tests.
- **Modify** `src/lib/sysex/fh2-sysex.ts` — extend `MidiTransport` + `MockTransport` + `WebMidiTransport` with `requestPreset`/`sendPreset`.
- **Modify** `src/lib/sysex/fh2-sysex.test.ts` — `MockTransport` preset round-trip.

---

## Task 1: Preset framing in protocol.ts

**Files:**
- Modify: `src/lib/sysex/protocol.ts`
- Test: `src/lib/sysex/protocol.test.ts`

**Interfaces:**
- Consumes: `SYSEX_PREFIX`, `Command`, `classifyMessage`, `IncomingMessage` (existing in `protocol.ts`).
- Produces: `PRESET_VERSION = 8`, `PRESET_DUMP_HEADER`, `PRESET_PAYLOAD_LENGTH = 4436`, `Command.PRESET_DUMP = 0x13`, `Command.REQUEST_PRESET = 0x23`, `requestPresetMessage(): Uint8Array`, `isPresetDumpFile(bytes: Uint8Array): boolean`, and a new `IncomingMessage` variant `{ kind: 'preset'; payload: Uint8Array }`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sysex/protocol.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	requestPresetMessage,
	isPresetDumpFile,
	classifyMessage,
	PRESET_PAYLOAD_LENGTH
} from './protocol';

const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const presetSyx = new Uint8Array(readFileSync(fixtureDir + 'device-preset-v8.syx'));
const configSyx = new Uint8Array(readFileSync(fixtureDir + 'device-dump-v11.syx'));

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sysex/protocol.test.ts`
Expected: FAIL — `requestPresetMessage`/`isPresetDumpFile`/`PRESET_PAYLOAD_LENGTH` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/sysex/protocol.ts`, add to the `Command` object:

```ts
	PRESET_DUMP: 0x13,
	REQUEST_PRESET: 0x23,
```

Add constants near `CONFIG_VERSION`:

```ts
/** Firmware preset-format version this codec targets (distinct from config v11). */
export const PRESET_VERSION = 8;

/** The fixed 8-byte header that opens a preset-dump message. */
export const PRESET_DUMP_HEADER = [0xf0, 0x00, 0x21, 0x27, 0x2f, 0x13, 0x00, 0x00] as const;

/** Preset-dump payload length (bytes between the 8-byte header and trailing F7). */
export const PRESET_PAYLOAD_LENGTH = 4436;
```

Extend the `IncomingMessage` union with a preset variant:

```ts
	| { kind: 'preset'; payload: Uint8Array }
```

Add the preset branch inside `classifyMessage`, before the final `return`:

```ts
	if (command === Command.PRESET_DUMP) {
		return { kind: 'preset', payload: data.slice(8, -1) };
	}
```

Add the two new functions:

```ts
/** Request a full preset dump from the device. */
export function requestPresetMessage(): Uint8Array {
	return new Uint8Array([...SYSEX_PREFIX, Command.REQUEST_PRESET, 0xf7]);
}

/** Validate that a byte blob is a preset-dump message (as written to `.syx`). */
export function isPresetDumpFile(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 9 &&
		bytes[0] === 0xf0 &&
		bytes[1] === 0x00 &&
		bytes[2] === 0x21 &&
		bytes[3] === 0x27 &&
		bytes[4] === 0x2f &&
		bytes[5] === 0x13 &&
		bytes[bytes.length - 1] === 0xf7
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sysex/protocol.test.ts`
Expected: PASS (existing protocol tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sysex/protocol.ts src/lib/sysex/protocol.test.ts
git commit -m "feat(fh-2): preset SysEx framing in protocol.ts"
```

---

## Task 2: Preset codec skeleton — version, name, lossless round-trip

**Files:**
- Create: `src/lib/sysex/preset-codec.ts`
- Test: `src/lib/sysex/preset-codec.test.ts`

**Interfaces:**
- Consumes: `PRESET_DUMP_HEADER`, `PRESET_PAYLOAD_LENGTH`, `PRESET_VERSION` from `protocol.ts`.
- Produces:
  - `interface EuclideanGenerator { pulses: number; steps: number; rotation: number; rate: number; gateLength: number; accent: number; reset: number }`
  - `interface PresetModel { version: number; name: string; euclidean: EuclideanGenerator[]; raw: Uint8Array }`
  - `decodePreset(input: Uint8Array): PresetModel` — accepts a full dump message *or* a bare payload.
  - `encodePreset(model: PresetModel): Uint8Array` — full dump message (header…F7).
  - `createEmptyPreset(): PresetModel` — zeroed payload, version byte = 8 (mock/dev scaffold; not a device-valid preset).
  - In this task `decodePreset` sets `euclidean: []`; Task 3 fills it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sysex/preset-codec.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePreset, encodePreset, createEmptyPreset } from './preset-codec';

const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const presetSyx = new Uint8Array(readFileSync(fixtureDir + 'device-preset-v8.syx'));

describe('preset codec — framing & round-trip', () => {
	it('decodes version 8 and the name "Init"', () => {
		const p = decodePreset(presetSyx);
		expect(p.version).toBe(8);
		expect(p.name).toBe('Init');
	});

	it('round-trips the real preset dump byte-for-byte', () => {
		const out = encodePreset(decodePreset(presetSyx));
		expect(out.length).toBe(presetSyx.length);
		expect([...out]).toEqual([...presetSyx]);
	});

	it('decodePreset accepts a bare payload too', () => {
		const fromFull = decodePreset(presetSyx);
		const fromBare = decodePreset(presetSyx.slice(8, -1));
		expect(fromBare.version).toBe(fromFull.version);
		expect([...fromBare.raw]).toEqual([...fromFull.raw]);
	});

	it('createEmptyPreset yields a version-8 preset of the right length', () => {
		const p = createEmptyPreset();
		expect(p.version).toBe(8);
		expect(p.raw.length).toBe(4436);
		expect(encodePreset(p).length).toBe(4436 + 9);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sysex/preset-codec.test.ts`
Expected: FAIL — module `./preset-codec` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sysex/preset-codec.ts`:

```ts
/**
 * FH-2 PRESET codec (format version 8) — the living sequencer state, distinct
 * from the config codec in `codec.ts`. Reverse-engineered from the official
 * `reference/FH-2_tools/fh2_preset_tool.html` (`parsePresetDump`) and verified
 * against the hardware fixture `fixtures/device-preset-v8.syx`.
 *
 * RAW-PASSTHROUGH STRATEGY (round-trip safety): only the 16 Euclidean generators
 * are modeled. `decodePreset` stashes the entire payload on `model.raw`;
 * `encodePreset` starts from `model.raw` and overwrites only the Euclidean bytes,
 * so every unmodeled byte survives a load->edit->send cycle untouched.
 */
import { PRESET_DUMP_HEADER, PRESET_PAYLOAD_LENGTH, PRESET_VERSION } from './protocol';

export interface EuclideanGenerator {
	pulses: number;
	steps: number;
	rotation: number;
	rate: number;
	gateLength: number;
	accent: number;
	reset: number;
}

export interface PresetModel {
	version: number;
	name: string;
	euclidean: EuclideanGenerator[];
	raw: Uint8Array;
}

const OFF_NAME = 4; // 16 ASCII bytes; tool advances cursor 17

/** Strip the 8-byte dump header + trailing F7 if a full message was passed. */
function toPayload(input: Uint8Array): Uint8Array {
	return input[0] === 0xf0 && input[5] === 0x13 ? input.slice(8, -1) : input;
}

export function decodePreset(input: Uint8Array): PresetModel {
	const payload = toPayload(input);
	const version =
		payload[0] | (payload[1] << 8) | (payload[2] << 16) | (payload[3] << 24);
	let name = '';
	for (let i = 0; i < 16; i++) {
		const n = payload[OFF_NAME + i];
		if (n === 0) break;
		name += String.fromCharCode(n);
	}
	return {
		version,
		name: name.replace(/\s+$/, ''),
		euclidean: [],
		raw: payload.slice()
	};
}

export function encodePreset(model: PresetModel): Uint8Array {
	const payload = model.raw.slice();
	// Task 3/4 will write Euclidean bytes here.
	return new Uint8Array([...PRESET_DUMP_HEADER, ...payload, 0xf7]);
}

export function createEmptyPreset(): PresetModel {
	const raw = new Uint8Array(PRESET_PAYLOAD_LENGTH);
	raw[0] = PRESET_VERSION; // int32 LE; high bytes stay 0
	return { version: PRESET_VERSION, name: '', euclidean: [], raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sysex/preset-codec.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sysex/preset-codec.ts src/lib/sysex/preset-codec.test.ts
git commit -m "feat(fh-2): preset codec skeleton with lossless round-trip"
```

---

## Task 3: Decode the 16 Euclidean generators

**Files:**
- Modify: `src/lib/sysex/preset-codec.ts`
- Test: `src/lib/sysex/preset-codec.test.ts`

**Interfaces:**
- Consumes: `PresetModel`, `EuclideanGenerator` (Task 2).
- Produces: `decodePreset` now populates `euclidean` with 16 entries. Internal: `OFF_EUCLIDEAN = 1372`, `EUC_STRIDE = 8`, `EUC_COUNT = 16`, `decodeEuclidean(payload): EuclideanGenerator[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sysex/preset-codec.test.ts`:

```ts
describe('preset codec — Euclidean decode', () => {
	it('decodes 16 generators with the factory Init values', () => {
		const p = decodePreset(presetSyx);
		expect(p.euclidean.length).toBe(16);
		// Verified from the fixture: every generator is 00 10 00 0c 00 00 00 (+pad)
		for (const g of p.euclidean) {
			expect(g).toEqual({
				pulses: 0,
				steps: 16,
				rotation: 0,
				rate: 12,
				gateLength: 0,
				accent: 0,
				reset: 0
			});
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sysex/preset-codec.test.ts -t "Euclidean decode"`
Expected: FAIL — `p.euclidean.length` is 0.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/sysex/preset-codec.ts`, add the constants below `OFF_NAME`:

```ts
const OFF_EUCLIDEAN = 1372; // 16 generators × 8 bytes (7 used + 1 pad)
const EUC_STRIDE = 8;
const EUC_COUNT = 16;
```

Add the decode helper:

```ts
function decodeEuclidean(payload: Uint8Array): EuclideanGenerator[] {
	const gens: EuclideanGenerator[] = [];
	for (let i = 0; i < EUC_COUNT; i++) {
		const base = OFF_EUCLIDEAN + i * EUC_STRIDE;
		gens.push({
			pulses: payload[base + 0],
			steps: payload[base + 1],
			rotation: payload[base + 2],
			rate: payload[base + 3],
			gateLength: payload[base + 4],
			accent: payload[base + 5],
			reset: payload[base + 6]
			// base + 7 is padding — preserved via raw
		});
	}
	return gens;
}
```

In `decodePreset`, replace `euclidean: []` with `euclidean: decodeEuclidean(payload)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sysex/preset-codec.test.ts`
Expected: PASS (round-trip test from Task 2 still passes — decode does not affect encode yet).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sysex/preset-codec.ts src/lib/sysex/preset-codec.test.ts
git commit -m "feat(fh-2): decode 16 Euclidean generators from preset"
```

---

## Task 4: Encode Euclidean edits back into the payload

**Files:**
- Modify: `src/lib/sysex/preset-codec.ts`
- Test: `src/lib/sysex/preset-codec.test.ts`

**Interfaces:**
- Consumes: `decodeEuclidean` constants (`OFF_EUCLIDEAN`, `EUC_STRIDE`).
- Produces: `encodePreset` now writes Euclidean fields over `model.raw`. Internal: `encodeEuclidean(gens, payload): void`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sysex/preset-codec.test.ts`:

```ts
describe('preset codec — Euclidean encode', () => {
	it('still round-trips byte-for-byte after decode populates euclidean', () => {
		const out = encodePreset(decodePreset(presetSyx));
		expect([...out]).toEqual([...presetSyx]);
	});

	it('editing one field changes exactly one payload byte', () => {
		const p = decodePreset(presetSyx);
		p.euclidean[0].pulses = 5;
		const out = encodePreset(p).slice(8, -1); // payload only
		const orig = presetSyx.slice(8, -1);
		const diffs: number[] = [];
		for (let i = 0; i < orig.length; i++) if (out[i] !== orig[i]) diffs.push(i);
		expect(diffs).toEqual([1372]); // generator 0, pulses byte
		expect(out[1372]).toBe(5);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sysex/preset-codec.test.ts -t "Euclidean encode"`
Expected: FAIL — the edit test finds `diffs = []` (encode ignores `euclidean`).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/sysex/preset-codec.ts`, add the encode helper:

```ts
function encodeEuclidean(gens: EuclideanGenerator[], payload: Uint8Array): void {
	gens.forEach((g, i) => {
		const base = OFF_EUCLIDEAN + i * EUC_STRIDE;
		payload[base + 0] = g.pulses & 0x7f;
		payload[base + 1] = g.steps & 0x7f;
		payload[base + 2] = g.rotation & 0x7f;
		payload[base + 3] = g.rate & 0x7f;
		payload[base + 4] = g.gateLength & 0x7f;
		payload[base + 5] = g.accent & 0x7f;
		payload[base + 6] = g.reset & 0x7f;
		// base + 7 padding left untouched (preserved from raw)
	});
}
```

In `encodePreset`, replace the `// Task 3/4 will write…` comment with:

```ts
	if (model.euclidean.length) encodeEuclidean(model.euclidean, payload);
```

(The length guard keeps `createEmptyPreset`, whose `euclidean` is `[]`, a pure zeroed payload.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sysex/preset-codec.test.ts`
Expected: PASS (all four describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sysex/preset-codec.ts src/lib/sysex/preset-codec.test.ts
git commit -m "feat(fh-2): encode Euclidean edits with lossless raw passthrough"
```

---

## Task 5: `.syx` helpers + transport request/send

**Files:**
- Create: `src/lib/sysex/preset-sysex.ts`
- Test: `src/lib/sysex/preset-sysex.test.ts`
- Modify: `src/lib/sysex/fh2-sysex.ts`
- Test: `src/lib/sysex/fh2-sysex.test.ts`

**Interfaces:**
- Consumes: `decodePreset`, `encodePreset`, `createEmptyPreset`, `PresetModel` (preset-codec); `classifyMessage`, `requestPresetMessage` (protocol).
- Produces:
  - `presetToSyx(preset: PresetModel): Uint8Array`
  - `extractPresetPayload(bytes: Uint8Array): Uint8Array`
  - `syxToPreset(bytes: Uint8Array): PresetModel`
  - `MidiTransport.requestPreset(): Promise<PresetModel>` and `MidiTransport.sendPreset(preset: PresetModel): Promise<void>` implemented on both `MockTransport` and `WebMidiTransport`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sysex/preset-sysex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { presetToSyx, syxToPreset, extractPresetPayload } from './preset-sysex';

const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const presetSyx = new Uint8Array(readFileSync(fixtureDir + 'device-preset-v8.syx'));
const configSyx = new Uint8Array(readFileSync(fixtureDir + 'device-dump-v11.syx'));

describe('preset .syx helpers', () => {
	it('round-trips a preset .syx file byte-for-byte', () => {
		expect([...presetToSyx(syxToPreset(presetSyx))]).toEqual([...presetSyx]);
	});

	it('extractPresetPayload rejects a config dump', () => {
		expect(() => extractPresetPayload(configSyx)).toThrow(/preset dump/i);
	});
});
```

Add to `src/lib/sysex/fh2-sysex.test.ts`:

```ts
import { MockTransport } from './fh2-sysex';

describe('MockTransport preset', () => {
	it('stores and returns a sent preset', async () => {
		const t = new MockTransport();
		const p = await t.requestPreset();
		p.euclidean = [
			{ pulses: 3, steps: 8, rotation: 0, rate: 12, gateLength: 0, accent: 0, reset: 0 }
		];
		await t.sendPreset(p);
		const back = await t.requestPreset();
		expect(back.euclidean[0]?.pulses).toBe(3);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sysex/preset-sysex.test.ts src/lib/sysex/fh2-sysex.test.ts`
Expected: FAIL — `./preset-sysex` missing; `MockTransport.requestPreset` not a function.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sysex/preset-sysex.ts`:

```ts
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
```

In `src/lib/sysex/fh2-sysex.ts`:

Add imports:

```ts
import { decodePreset, encodePreset, createEmptyPreset, type PresetModel } from './preset-codec';
import { requestPresetMessage } from './protocol';
```

Add to the `MidiTransport` interface:

```ts
	requestPreset(): Promise<PresetModel>;
	sendPreset(preset: PresetModel): Promise<void>;
```

In `MockTransport`, add a stored preset field and the two methods:

```ts
	private storedPreset: PresetModel = createEmptyPreset();

	async requestPreset(): Promise<PresetModel> {
		return structuredClone(this.storedPreset);
	}
	async sendPreset(preset: PresetModel): Promise<void> {
		this.storedPreset = structuredClone(preset);
	}
```

In `WebMidiTransport`, add a pending resolver field next to `pendingConfig`:

```ts
	private pendingPreset?: (payload: Uint8Array) => void;
```

Add a preset branch in `handleMessage`, after the `config` branch:

```ts
		} else if (msg.kind === 'preset' && this.pendingPreset) {
			const resolve = this.pendingPreset;
			this.pendingPreset = undefined;
			resolve(msg.payload);
```

Add the two methods next to `requestConfig`/`sendConfig`:

```ts
	async requestPreset(): Promise<PresetModel> {
		const reply = new Promise<Uint8Array>((resolve, reject) => {
			this.pendingPreset = resolve;
			setTimeout(() => {
				if (this.pendingPreset) {
					this.pendingPreset = undefined;
					reject(new Error('Timed out waiting for preset dump.'));
				}
			}, REPLY_TIMEOUT_MS);
		});
		this.send(requestPresetMessage());
		return decodePreset(await reply);
	}

	async sendPreset(preset: PresetModel): Promise<void> {
		this.send(encodePreset(preset));
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sysex/preset-sysex.test.ts src/lib/sysex/fh2-sysex.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + type check**

Run: `npx vitest run && npm run check`
Expected: all tests PASS; `svelte-check` reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sysex/preset-sysex.ts src/lib/sysex/preset-sysex.test.ts src/lib/sysex/fh2-sysex.ts src/lib/sysex/fh2-sysex.test.ts
git commit -m "feat(fh-2): preset .syx helpers + transport request/send"
```

---

## Task 6: Hardware verification (manual)

**Files:** none (manual bench check with the FH-2 connected via Chrome/Edge).

This is the real-world gate that automated tests can't cover. No code; record results in `RECAP.md`.

- [ ] **Step 1:** Connect the FH-2 (known-good data cable — suspect charge-only cables first). In a dev scratch route or the browser console with a `WebMidiTransport`, call `requestPreset()`.
- [ ] **Step 2:** Confirm `version === 8` and `euclidean.length === 16`, and that the values match what `reference/FH-2_tools/fh2_preset_tool.html` shows for the same device (load the live device or the captured `preset.syx` into the tool and compare a couple of generators).
- [ ] **Step 3:** Edit one generator (`euclidean[0].pulses = 4`), `sendPreset(...)`, then `requestPreset()` again and confirm the device echoes `pulses === 4`. Inspect the module UI to confirm the Euclidean change took.
- [ ] **Step 4:** Record outcomes in `RECAP.md` (firmware version, preset version, any byte ranges that needed the semantic-equivalence fallback). Commit the RECAP update.

```bash
git add RECAP.md
git commit -m "docs(fh-2): record preset pipeline hardware verification"
```

---

## Self-Review notes

- **Spec coverage:** framing (Task 1), lossless round-trip gate (Tasks 2 & 4), Euclidean decode/encode (Tasks 3 & 4), transport request/send + `.syx` import/export + separate preset state (Task 5), hardware validation (Task 6). The two-tier round-trip gate's *semantic-equivalence fallback* is exercised by the byte-for-byte test passing (no fallback needed for Euclidean, which is plain-byte); Task 6 records any range that needs it for future slices.
- **Deferred (documented, not gaps):** `unSysexSafeInt`/tempo, note seqs, drum grids, all UI — per spec Non-Goals.
- **Type consistency:** `PresetModel`/`EuclideanGenerator` field names are identical across Tasks 2–5; `OFF_EUCLIDEAN = 1372`, `EUC_STRIDE = 8`, `EUC_COUNT = 16` defined once in Task 3 and reused in Task 4.
