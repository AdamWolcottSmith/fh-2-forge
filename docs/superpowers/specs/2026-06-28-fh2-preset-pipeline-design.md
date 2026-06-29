# FH-2 Preset Pipeline — Codec + Transport Foundation

_Design spec • 2026-06-28 • status: approved, ready for implementation plan_

> First vertical slice of the "better sequencer GUI" effort. This spec covers **only**
> the preset SysEx foundation: a transport and a lossless codec that can request, load,
> round-trip (byte-for-byte), edit the Euclidean fields, and send a real FH-2 preset.
> The Euclidean **editor UI** (layout C / Hybrid, Bjorklund visualizer, ▶ preview) is a
> separate, later spec that consumes the typed model this one produces.
>
> Context: `docs/SEQUENCER_GUI_PLAN.md` (overall effort), `docs/SYSEX_FORMAT.md` (config
> wire format), `RECAP.md` (project state).

## Background

The FH-2 splits its state into two SysEx domains (manual p.14):

- **Configuration** (command `0x10`) — what the I/O does + MIDI mapping. Fully modeled
  today in `src/lib/sysex/codec.ts`.
- **Preset** (command `0x13`) — the living sequencer content. This is where the real
  Euclidean pattern data lives (pulses, steps, rotation, rate, gate length, accent,
  reset — manual p.43–44). **Nothing in the app reads or writes this today.**

Making the sequencers fun to program means editing preset data, so we need a preset
pipeline before any sequencer UI is meaningful. We build it on the smallest preset
payload first — the 16 Euclidean generators — to prove the whole load → edit → send →
`.syx` path on the simplest data.

The official `reference/FH-2_tools/fh2_preset_tool.html` is the ground-truth reference
implementation (the same role `fh2_config_tool.html` played for the config codec). Key
facts already extracted from it:

- Preset **dump** header: `F0 00 21 27 2F 13 00 00 … F7`; payload is `data.slice(8, -1)`,
  parsed by `parsePresetDump()`.
- Preset **request** message: `F0 00 21 27 2F 23 F7`.
- Sequencer/drum **banks** are *separate* dumps (`reqSeqDump`, `reqDrumSeqDump`) — out of
  scope here; Euclidean is in the `0x13` preset dump.
- One packing helper the config codec didn't need: `unSysexSafeInt` (port it).

## Goals

1. Request a preset from a connected FH-2 and decode it into a typed `PresetModel`.
2. **Byte-for-byte round-trip**: `encodePreset(decodePreset(dump)) === dump` for a real
   hardware dump. This is the acceptance gate.
3. Decode and re-encode the **16 Euclidean generators' fields** correctly.
4. Send an edited preset back to the device; import/export preset `.syx` files.
5. Keep preset state fully separate from config state (independent dirty/load/save).

## Non-Goals (deferred to later specs)

- Any UI: the C/Hybrid Euclidean editor, Bjorklund ring visualizer, ▶ in-browser preview.
- Decoding note sequencers, drum grids, or sequencer banks (kept as opaque spans here).
- Live device step-position sync.

## Architecture

Mirror the proven config stack one layer at a time. Shared primitives (5-byte prefix,
14-bit packing helpers, SysEx framing) are **extended in place**, not duplicated.

| File | Status | Mirrors | Responsibility |
|------|--------|---------|----------------|
| `src/lib/sysex/protocol.ts` | extend | — | Add `Command.PRESET_DUMP = 0x13`, `Command.REQUEST_PRESET = 0x23`, `PRESET_DUMP_HEADER`, `requestPresetMessage()`, `isPresetDumpFile()`; port `unSysexSafeInt`; classify `0x13` in `classifyMessage` (new `IncomingMessage` variant `{ kind: 'preset'; payload }`). |
| `src/lib/sysex/preset-codec.ts` | new | `codec.ts` | `decodePreset(payload) → PresetModel`, `encodePreset(model) → payload`. |
| `src/lib/sysex/preset-transport.ts` | new | `fh2-sysex.ts` | Request / receive / send preset dumps; separate dirty state; `.syx` import/export. |
| `src/lib/sysex/preset-codec.test.ts` | new | `codec.test.ts` | Round-trip identity gate + Euclidean field assertions against the hardware fixture. |
| `src/lib/sysex/fixtures/device-preset-v11.syx` | new | — | Authoritative hardware-captured preset dump (see Task 0). |

## The codec model — lossless by construction

`preset-codec.ts` follows the **partial-model / raw-passthrough strategy** already used by
`codec.ts` ("PARTIAL-MODEL STRATEGY (round-trip safety)"):

- `decodePreset(payload)` stashes the entire raw payload on `model.raw`, then decodes the
  fields it understands (Euclidean) into typed properties.
- `encodePreset(model)` starts from `model.raw` (or a zeroed buffer for a fresh preset)
  and overwrites **only** the modeled byte ranges, leaving every unmodeled byte exactly
  as received.

This guarantees regions we don't yet understand (note seqs, drum grids, future fields)
survive a load→edit→send cycle untouched — essential, because this is real device state
and silent corruption would be invisible until the bench.

`PresetModel` shape (final field set + byte offsets are derived during implementation from
the hardware fixture cross-checked against `parsePresetDump`):

```ts
interface EuclideanGenerator {
  pulses: number;     // 0..steps
  steps: number;      // 1..N (device max per manual p.43)
  rotation: number;   // 0..steps-1
  rate: number;       // clock division enum
  gateLength: number; // % or device units
  accent: number;     // accent-every-N (0 = off)
  reset: number;      // reset source/enum
}

interface PresetModel {
  version: number;            // preset format version (expect 11)
  euclidean: EuclideanGenerator[]; // length 16
  raw: Uint8Array;            // full payload, for lossless re-encode
}
```

Euclidean encode/decode use the existing `encodeFields`/`decodeFields` table-walk pattern
from `codec.ts` so the two directions stay symmetric by construction.

## Transport & app integration

`preset-transport.ts` mirrors the `MidiTransport` interface in `fh2-sysex.ts` and **reuses
the existing Web MIDI connection** (one port, already owned by the app — only one app can
own the FH-2 port at a time). It adds:

- **Request Preset** → send `0x23` → receive `0x13` → `decodePreset` → hold model.
- **Send Preset** → `encodePreset` → send `0x13` dump to device.
- **Import / Export `.syx`** → validate with `isPresetDumpFile`, decode/encode.
- **Dirty state** for the preset, tracked **separately** from the config's, so the two
  domains never cross-contaminate a save.

No new UI surface beyond whatever minimal dev affordance is needed to trigger
request/send/import/export for verification (a throwaway dev button or a test harness —
the real UI is the next spec).

## Validation & testing

- **Task 0 — hardware capture (precondition).** Connect the FH-2 (Chrome/Edge, known-good
  data cable — suspect charge-only cables first), request a preset dump, and save it to
  `src/lib/sysex/fixtures/device-preset-v11.syx`. Also capture the config dump fixture we
  still owe: `src/lib/sysex/fixtures/device-dump-v11.syx`. The codec is built against these
  authoritative bytes — not against tool-generated guesses.
- **Round-trip identity (the gate):** `encodePreset(decodePreset(fixture)) === fixture`,
  byte-for-byte, mirroring `codec.test.ts`'s "preserves bytes in unmodeled regions" test.
- **Euclidean field assertions:** decode the fixture and assert specific generators' field
  values match what the official preset tool shows for the same dump (cross-checked by
  loading the same `.syx` into `fh2_preset_tool.html`).
- **Framing tests:** `isPresetDumpFile`, `classifyMessage` for `0x13`, request-message bytes.

## Risks & open items

- **Euclidean byte offsets** are not yet pinned — they're recovered during implementation
  from the fixture + `parsePresetDump`. Low risk: the tool source is the exact authority.
- **Preset format version** is assumed to be `11` (matching config on firmware v2.0.0);
  confirm from the captured dump's header. If it differs, record it and target the captured
  version.
- **`unSysexSafeInt` semantics** must be ported exactly from the tool (28-bit pack); verify
  against round-trip rather than by inspection.

## What comes after this spec

Spec 2 (separate brainstorm → spec → plan): the Euclidean **editor UI** — layout C
(Hybrid: big editable ring + live 16-thumbnail strip), the Bjorklund visualizer (must
short-circuit `pulses == 0 → all rests` and `pulses == steps → all hits` to avoid the
infinite loop), and the ▶ in-browser preview animation — all consuming the `PresetModel`
this pipeline produces.
