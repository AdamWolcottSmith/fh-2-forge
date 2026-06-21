# Vendored reference: official FH-2 tools

These files are copied verbatim from
[`expertsleepersltd/FH-2_tools`](https://github.com/expertsleepersltd/FH-2_tools)
(MIT License, © 2021 Expert Sleepers Ltd — see `FH-2_tools/LICENSE`).

They are the **authoritative source of truth** for the FH-2 SysEx format. The
config-dump byte layout in `docs/SYSEX_FORMAT.md` and the codec in
`src/lib/sysex/` are derived directly from `fh2_config_tool.html`:

- `makeSysEx()` — the encoder (config → bytes)
- `parseConfigDump()` / `parseMcv()` — the decoder (bytes → config)
- `sysexSafeShort` / `unSysexSafeShort` etc. — the 14-bit value packing helpers

When in doubt about a field, ranges, or ordering, **read these files**, not the
manual. Targets FH-2 firmware config **version 11**.
