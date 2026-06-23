# Sequencer GUI — Working Plan & Session Handoff

> Status snapshot for the "better sequencer GUI" effort. Written mid-brainstorm so
> work can resume cleanly after a context compaction. See `RECAP.md` for the
> overall project state and `docs/SYSEX_FORMAT.md` for the config wire format.

_Last updated: 2026-06-23_

## Where we are

We connected a **real FH-2** for the first time and validated the live path, then
pivoted to designing a genuinely better GUI for the sequencers. We are **mid-brainstorm**
(superpowers `brainstorming` skill) — decisions below are locked; the design doc /
spec has **not** been written yet.

### Hardware validation — done this session
- First-ever live connect via our own build succeeded.
- Device firmware reports **v2.0.0**; it emits config format **v11** (our codec's
  target — consistent).
- `Load` pulled real data off the device: config name **"Init"**, **8 MIDI mappings**,
  **1** MIDI/CV converter, **2** clocks.
- **Connection gotcha:** the earlier "FH-2 not found" was a **charge-only / flaky USB
  cable**, NOT our `findFH2` regex (the port is literally named `FH-2`, which matches).
  Suspect the cable first. Web MIDI needs Chrome/Edge; only one app can own the port.

## THE key insight: config vs preset

The FH-2 splits its state into two separate SysEx domains (manual p.14):

- **Configuration** — what the I/O does + how MIDI maps to it. For sequencers/Euclidean
  this is ONLY: output routing, MIDI channel, destinations, clock source, and
  CC→parameter mappings. **This is all our app reads/writes today.**
- **Preset** — the actual living state. This is where the real sequencer content lives:
  - **Euclidean:** pulses, steps, rotation, rate, gate length, accent rate, reset (manual p.43–44).
  - **Note seqs:** notes, octaves, ratchet/tie patterns, resets/skips/mutes, direction/permutation (manual p.51–58).
  - **Drum seq:** 8 lanes × up to 32 steps, on/off/accent, per-lane mutes (manual p.59–61).
  - Sequencer **banks** (28 note + 28 drum saved slots, 8 banks each) are separate from both.

**Consequence:** "make the sequencers fun to program" = editing pulses/steps/notes/grids,
and **none of that is in the config dump.** It lives in the **preset**, a separate SysEx
format handled by the *other* official tool. We must add preset support.

Ground truth for the preset format: `reference/FH-2_tools/fh2_preset_tool.html` (same
approach we used to reverse-engineer the config from `fh2_config_tool.html`). We will
also need to **capture a real preset `.syx`** off the hardware as a decode fixture
(the config equivalent we still want too: `src/lib/sysex/fixtures/device-dump-v11.syx`).

### The "16/16 Euclidean" bug (explained)
The dashboard counted Euclidean slots that have an **output assigned** (all 16 do by
default) instead of patterns that are actually **active (pulses > 0)**. Pulse count is
preset data we never load, so the count was measuring the wrong thing. Real factory
`Init` has ~0 active Euclidean patterns. Fix lands naturally once preset support exists;
until then the dashboard metric is misleading.

## Decisions locked (brainstorming)

1. **Add preset support** — reverse-engineer the preset SysEx (using `fh2_preset_tool.html`
   as ground truth), so we can edit real pattern/note/grid content. This is the foundation.
2. **Build it in vertical slices**, one working editor at a time; brainstorm/spec/build
   each slice separately.
3. **First slice = Euclidean.** Smallest preset payload (16 patterns × 7 params), directly
   fixes the count bug, and proves the whole preset load→edit→send→`.syx` pipeline on the
   simplest payload. Note + drum sequencers come in later slices.
4. **Euclidean is algorithmic, not hand-painted.** The device sets pulse count / step count /
   rotation and distributes pulses via the Bjorklund algorithm. The UI ring is a
   *visualization* of the computed pattern + the controls that drive it — NOT a freeform
   step painter (a painted pattern couldn't round-trip to the device).
5. **In-browser preview animation**, not live device sync. A local Play button animates the
   ring at an app-set tempo for feel; no real-time MIDI plumbing now. Device-sync is a
   possible later add if MIDI exposes step position.

## Next steps (resume here)

1. **(Pending) Visual companion offer** — I offered to open a browser tab for layout
   mockups (the ring + controls + how all 16 patterns sit on screen). Awaiting the
   user's yes/no. Layout is the next brainstorm question either way.
2. Finish brainstorming the Euclidean editor: screen layout, whether to unify config-side
   routing (`output`/`offOutput`) with preset params in one per-pattern view, and how the
   16 patterns are presented (grid of rings vs. one big ring + selector).
3. Write the design doc to `docs/superpowers/specs/2026-06-23-fh2-euclidean-editor-design.md`,
   self-review, commit, user-review.
4. Then invoke the `writing-plans` skill for the implementation plan.

## Open implementation notes (for the spec, not yet decided)
- Need a **preset transport** alongside the config transport: request/send preset SysEx,
  separate dirty state, separate `.syx` import/export. Mirror the existing
  `MidiTransport` interface in `src/lib/sysex/fh2-sysex.ts`.
- Need a **preset codec** (`src/lib/sysex/preset-codec.ts`?) modeled on `codec.ts`.
- Bjorklund algorithm implementation (pure function, unit-tested) to compute the
  pulse distribution for the visualizer.
- Capture real fixtures from hardware: a config dump AND a preset dump, both as decode tests.
