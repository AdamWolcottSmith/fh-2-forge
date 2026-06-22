# FH-2 Forge

A modern, visual, installable (PWA) configuration tool for the
[Expert Sleepers FH-2](https://www.expert-sleepers.co.uk/fh2.html) Eurorack
module — built to be faster and clearer than the official web config tool,
François Georgy's fork, and the paid FH-2 Wizard.

> **Status: Phase 1 scaffold.** Data model, theme, PWA shell, and a mock SysEx
> layer are in place. The real device SysEx codec is **not yet implemented** and
> must be reverse-engineered from the official tool before hardware use (see
> below).

## Tech stack

| Concern  | Choice |
| -------- | ------ |
| Framework | SvelteKit 2 + Svelte 5 (runes) + TypeScript |
| Styling   | Tailwind CSS 4 (`@tailwindcss/vite`) |
| State     | Svelte 5 runes + stores |
| MIDI      | Web MIDI API (Tauri native backend planned) |
| Visuals   | SVG primary, Canvas where needed |
| Tests     | Vitest |
| Desktop   | Tauri v2 (Phase 3, optional) |

## Commands

```sh
npm run dev        # dev server (localhost:5173)
npm run build      # production build
npm run preview    # preview the build
npm run check      # svelte-check (type + a11y check)
npm run test       # run Vitest once
npm run test:watch # Vitest watch mode
```

## Project structure

```
src/
  app.css                     # Tailwind import + dark synth theme tokens
  app.html                    # PWA meta, manifest link, theme-color
  service-worker.ts           # offline app-shell caching (SvelteKit native)
  lib/
    types/fh2.ts              # ← the FH2Config data model (source of truth)
    config/defaults.ts        # createDefaultConfig() + per-entity factories
    sysex/fh2-sysex.ts        # connect/request/send + .syx I/O (MOCK mode)
    sysex/fh2-sysex.test.ts   # round-trip tests
  routes/
    +layout.svelte            # sidebar nav + app shell
    +page.svelte              # Dashboard (placeholder)
static/
  manifest.webmanifest        # PWA manifest
  icons/                      # TODO: 192/512/maskable PNG icons
```

## ⚠️ SysEx is the critical unknown

Round-trip compatibility with the FH-2 and official tools is a hard success
criterion, and it depends on the exact SysEx byte format. That format is **not**
guessed here — it must be reverse-engineered from
[`expertsleepersltd/FH-2_tools`](https://github.com/expertsleepersltd/FH-2_tools)
(`fh2_config_tool.html` and its JS). Until then:

- `MockTransport` lets the whole UI be built and tested without hardware.
- `WebMidiTransport` can find the device but its `requestConfig`/`sendConfig`
  and the `encodeConfig`/`decodeConfig` codec throw "not implemented".
- Fields in `src/lib/types/fh2.ts` tagged `@verify` need confirmation against
  the official tool's parameter set and encoding.

## Roadmap

**Phase 1 — MVP (core editing + visual foundation)**

- [x] SvelteKit + TS + Tailwind 4 + Vitest setup, dark theme, PWA shell
- [x] `FH2Config` data model + default/mock data
- [x] SysEx layer skeleton with mock mode + `.syx` framing
- [x] Reverse-engineer the real SysEx format (docs/SYSEX_FORMAT.md)
- [x] Implement the real SysEx codec — all sections modeled + round-trip tested
- [ ] Dashboard with static SVG module visualizer
- [ ] Full MIDI/CV converter editor (all parameters)
- [ ] Load/Send config + JSON + `.syx` import/export
- [ ] Toasts

**Phase 2 — Visual power**

- [ ] Interactive FH-2 panel (clickable jacks)
- [ ] Euclidean circular/linear editor + sequencer grids
- [ ] MIDI Learn, guided wizards, expander drag-to-reorder
- [ ] Validation + conflict detection

**Phase 3 — Polish & desktop**

- [ ] Undo/redo, preset vs config management, command palette (⌘K)
- [ ] Tauri desktop build, perf, onboarding, accessibility pass

## Deployment note

The scaffold uses `adapter-auto`. For a self-contained installable PWA, switch
to `@sveltejs/adapter-static` in SPA mode (`fallback: 'index.html'`,
`export const ssr = false`) so the app is fully client-side — appropriate since
all device I/O happens in the browser via Web MIDI.
