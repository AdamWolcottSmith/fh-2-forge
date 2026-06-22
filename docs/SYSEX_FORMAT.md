# FH-2 SysEx format

Reverse-engineered from the official `fh2_config_tool.html`
(`makeSysEx()` / `parseConfigDump()`), vendored under `reference/`.
**Authoritative for firmware config version 11.**

All multi-byte values are little-endian. MIDI SysEx data bytes must stay in
`0x00–0x7F`; 14-bit values are packed with the "sysex-safe" transform below.

## Manufacturer / device header

Expert Sleepers manufacturer ID: `00 21 27`. All FH-2 messages are:

```
F0 00 21 27 2F <command> [..payload..] F7
```

| Command bytes | Direction | Meaning |
| ------------- | --------- | ------- |
| `10 00 00` + payload | both | **Config dump** (the big one) |
| `02` + text | → device | Display a text message |
| `18 00` | → device | Save current config to flash |
| `21` | → device | Request a config dump |
| `22` | → device | Request firmware version |
| `32` + ascii | ← device | Version string response |

On receive, validate the first 5 bytes are `F0 00 21 27 2F`. For a config dump
(`data[5] == 0x10`), the config payload is `data.slice(8, -1)` — i.e. skip the
8-byte header and drop the trailing `F7`.

A `.syx` config file is exactly the config-dump message: header `F0 00 21 27 2F
10 00 00`, payload, `F7`.

## Value packing helpers

```
sysexSafeShort(v)      = (v & 0x7f) | ((v << 1) & 0x7f00)      // pack 14-bit → 2 bytes
unSysexSafeShort(v)    = (v & 0x7f) | ((v >> 1) & 0x3f80)      // unpack
unSysexSafeSignedShort = unSysexSafeShort, then if (s & 0x2000) s -= 16384
sysexSafeSignedChar(v) = v & 0x7f                              // signed 8-bit → 1 byte
unSysexSafeSignedChar(v) = (v & 0x40) ? v - 128 : v
```

A packed short occupies two consecutive bytes: `[ packed & 0x7f, packed >> 8 ]`.

## Config-dump payload layout (after the 8-byte header)

Offsets are cumulative byte counts into the payload. Total is padded to **4096**
bytes, then an **addendum** of high-bits, then `F7`.

| Offset | Size | Section | Notes |
| ------ | ---- | ------- | ----- |
| 0 | 4 | version | LE int32, must equal `11` |
| 4 | 16 (+1) | name | ASCII, null-padded/truncated to 16; cursor advances **17** |
| 21 | 7 | globals A | triglen, transpose(signed char), legvel(bool), extclkmult, extclkrun, presetprogch, softtakeover(bool) |
| 28 | 64 | output ranges | `rng_1..rng_64`, 1 byte each |
| 92 | 16×32 | **MCVs** | 16 MIDI/CV converters, 32 bytes each — see below |
| 604 | 384×4 | **mappings** | MIDI→control routing table — see below |
| 2140 | 32×8 | clocks | per clock: type, base, mult, len, output, shift (6 used of 8) |
| 2396 | 64×4 | gate levels | per output: lo(short, 2B), hi(short, 2B) |
| 2652 | 64×4 | triggers | see below |
| 2908 | 16×1 | euclidean outputs | low 7 bits of output index; bit 8 in addendum |
| 2924 | 8 | globals B | taptype, tapch, tapcc, eucaccent, starttype, startch, startcc, pad |
| 2932 | 16×1 | euclidean OFF outputs | low 7 bits; bit 8 in addendum |
| 2948 | 32×8 | gamepad (HID) | usage, output, scale(short), offset(short) |
| 3204 | 32×8 | keyboard (HID) | type, output, key, 0, value0(short), value1(short) |
| 3460 | 64×2 | LFO resets | `(type<<4)|ch`, cc |
| 3588 | 2×8 | CV→MIDI | flags, `(type<<4)|ch`, cc, _, 0v(short), 5v(short) |
| 3604 | 4 | globals C | tempo_min, tempo_max, pad, pad |
| 3608 | 4×4 | note sequencers | ch, outs(bitmask), clk, pad |
| 3624 | 11 | drum sequencer | ch, outs(bitmask), pad, then 8 note bytes |
| 3635 | 16×4 | MIDI/CV 2 (arp) | clk, `ch|(c<<4)|(a<<5)|(d<<6)`, pad, pad |
| 3699 | 16×7 | shift-register random | output+1, change, trigger, clk, nch, ch, outs(bitmask) |
| … | pad | zeros until payload length = 4096 |
| 4096 | 16 | addendum: euc output high bits | `(output & 0x80) ? 1 : 0` |
| 4112 | 16 | addendum: euc OFF output high bits | same |
| 4128 | 16 | addendum: srr high bits | `((change&0x80)?1:0) | ((trigger&0x80)?2:0)` |

> Offsets above are computed from the source's cursor arithmetic and should be
> re-derived in code from the section sizes (do not hard-code) — they are listed
> here only as a map. The codec walks the same cursor as `makeSysEx()`.

### MCV (32 bytes, per converter `m`)

In order: enable, channel(−1), noteMin, noteMax, type, polyphony(voices),
bendDepth, scheme(allocation), ignoreSurplus(stealing), gatedPressure(GA),
sustain(SUS), baseOutput, stride, lastMPE(−1), pressure(A), paraGate(G),
cvOutput(VC), gateOutput(VG), velGateOutput(VVG), velOutput(VV),
relVelOutput(VR), triggerOutput(VT), voicePressureOutput(VP), mpeYOutput(VY),
envOutput(VE), baseGate, monoRetrigger(MT), interruptGate(IG), envZeroStart(ZS),
bendDownDepth, pitchBendOutput(PB), randomOutput(VRND).

Booleans are stored as 0/1. `channel` and `lastMPE` are stored as value−1.

### Mappings (384 entries × 4 bytes)

A flat routing table assigning a MIDI channel+CC (with optional "relative" flag)
to a destination control. Each entry: `ch, cc, t0, t1`.

- `ch >> 4 == 3` marks an active entry; real channel = `ch & 0x0f` (+1 for UI).
- `t0 & 32` = relative mode flag; clear it before decoding the control type.
- `t0` selects a control group; `t1` selects the index/sub-target, with
  `t1 >= 64` selecting a "high" variant (subtract 64). Unused entries are `0x7f`.
- The output-source control groups use the `ac` list:
  `DC, LFO, CLK, CLKM, MLT, SIN, SQR, PW, TRI, SAW, RND, NSE, PHS, FAD, SMO`.

This table is the backbone of MIDI-learn and per-control CC assignment. It is the
most intricate part of the format; implement it last and test against a real
`.syx` captured from hardware.

### Triggers (4 bytes, per trigger `i`)

- byte0: `type | ((env-1 >> 1) << 4)`
- byte1: `(ch-1) | (((env-1) & 1) << 4) | ((note < 0) << 5)`
- byte2: `note < 0 ? 0 : note`
- byte3: output

## Implementation status

- ✅ Constants, command/message builders, value-packing primitives — `protocol.ts`
- ✅ Framing (header/version/name) + raw-passthrough for unmodeled regions — `codec.ts`
- ✅ **MCV section** (16 × 32 bytes) fully modeled + round-trip tested — `codec.ts` `MCV_FIELDS`
- ✅ **Globals** (regions A/B/C incl. signed transpose), **output ranges** (64),
  **gate levels** (64 × 14-bit) — modeled + round-trip tested
- ✅ **Clocks** (32 × 8), **triggers** (64 × 4, bit-packed env + any-note),
  **euclidean** on/off output assignments (incl. −1 via addendum high-bit flag)
- ⬜ Remaining sections: mappings (384×4), HID (gamepad/keyboard), LFO resets,
  CV→MIDI, sequencers (note/drum), arp (MIDI/CV 2), SRR
- ⬜ Validate decode against a real hardware `.syx` capture (need a fixture)
