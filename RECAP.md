# FH-2 Forge — Recap

A status snapshot of the project: what's built, how it's structured, and what's
left. See `README.md` for commands and `docs/SYSEX_FORMAT.md` for the wire format.

## TL;DR

A SvelteKit PWA to configure the Expert Sleepers FH-2. The **entire SysEx config
format is reverse-engineered and modeled** (round-trip tested), and **editor UIs
exist for the main sections**. A **preset SysEx pipeline** (codec + transport,
format v8) now also loads/edits/sends the 16 Euclidean generators. Both the
config and the preset Euclidean loops are **hardware-verified on a live FH-2**.

- Repo: `github.com/AdamWolcottSmith/fh-2-forge` (branch `main`)
- 47 unit tests passing · `npm run check` clean · production build clean

### Hardware verification — DONE (2026-06-28)
Live FH-2 (firmware v2.0.0). Preset pipeline echo test passed end-to-end:
`requestPreset` decoded the on-device preset (format **v8**, 16 generators at
factory Init = pulses 0 / steps 16 / rate 12 — matching the captured fixture);
editing `euclidean[4].pulses = 4` and calling `sendPreset` was **echoed back by
the device** on re-read (PASS). Confirms decode + encode + device acceptance on
real hardware, not just the fixture. (Config-side round-trip remains
functionally correct; see the SRR don't-care-byte note in the design spec.)
- Stack: SvelteKit 2 / Svelte 5 runes / TypeScript / Tailwind 4 / Vitest; PWA
  (manifest + service worker); Web MIDI; mock transport for hardware-free dev

## Done

### SysEx codec — complete
Every section of the v11 config dump is modeled and round-trip-tested in
`src/lib/sysex/`:

- `protocol.ts` — verified value-packing primitives, command/message builders,
  message classification (ported 1:1 from the official tool)
- `codec.ts` — full `FH2Config` ⇄ bytes:
  - globals (regions A/B/C), output ranges (64), gate levels (64 × 14-bit)
  - 16 MCV converters, 32 clocks, 64 triggers (bit-packed), 16 euclidean
    (−1 via addendum high-bit), HID gamepad/keyboard (32 each), 64 LFO resets,
    2 CV→MIDI, 4 note + 1 drum sequencer, 16 "arp", 16 SRR, and the
    384-entry **mapping table**
  - `config.raw` preserves any bytes not yet typed (only device padding remains)
- `reference/` vendors the official MIT-licensed tool as ground truth

### UI — main sections editable
- App shell: sidebar nav (active highlighting) + top **connection bar**
  (Connect / Use mock / Load / Send / Import-Export `.syx`, dirty indicator)
- Shared runes store: `src/lib/stores/config.svelte.ts`
- Reusable form fields: `src/lib/components/form/{Number,Select,Toggle}Field.svelte`
- Editor pages: **Converters, Globals, Clocks, Triggers, Euclidean,
  Sequencers, Outputs** + a Dashboard with live counts
- PWA: installable, offline app-shell caching

## To do

### 1. Validate against real hardware (highest priority)
Nothing is confirmed against a live FH-2 yet — only self-consistency and the
official tool's source. When the module is connected:
- Open in **Chrome/Edge**, plug in over USB, **Connect → Load**, compare values.
- Best fixture: export a `.syx` from the official tool / device and add it as a
  decode test so the whole codec is validated end-to-end. Reconcile any
  mismatched bytes (watch the `@verify`-tagged spots in `docs/SYSEX_FORMAT.md`).

### 2. Remaining editor UIs
Modeled in the codec but no screen yet (all still round-trip via raw):
SRR, HID gamepad/keyboard, CV→MIDI, LFO resets, arp (MIDI/CV 2).

### 3. Mapping table UX
The mapping table is stored as raw `{channel, cc, relative, group, index}`
entries. A real MIDI-learn screen needs a resolver that maps `group`/`index`
codes ↔ human-readable destinations (needs the `acc`/`aco` + per-section control
lists from the official tool).

### 4. Phase 2/3 polish (from README roadmap)
- Visual: interactive SVG front panel, Euclidean circle visualizer, sequencer grids
- MIDI Learn, guided setup wizards, validation / conflict detection
- Undo/redo, command palette (⌘K), preset vs config management
- Switch to `adapter-static` SPA + real PWA icons for a fully installable build
- Tauri desktop build (optional)

## How to resume
```sh
cd ~/Projects/eurorack/fh-2-forge
npm install
npm run dev      # http://localhost:5173 — click "Use mock" to explore
npm run test     # 34 tests
npm run check    # types
```
