#!/usr/bin/env python3
"""Generate Euclidean-editor layout mockups as standalone SVG files."""
import math, os

OUT = "/Users/adamsmith/Projects/eurorack/fh-2-forge/docs/mockups"
os.makedirs(OUT, exist_ok=True)

# ---- palette (matches the app's dark theme) -------------------------------
BG      = "#0e1116"
PANEL   = "#161b22"
PANEL2  = "#1c2430"
STROKE  = "#2d3643"
TEXT    = "#e6edf3"
DIM     = "#8b97a7"
HIT     = "#6ee7ff"   # filled pulse
ACCENT  = "#ffd36e"   # accented pulse
SEL     = "#6ee7ff"   # selection outline

def bjorklund(pulses, steps, rot=0):
    """Even pulse distribution (Bjorklund). Returns list[bool] length=steps."""
    if steps <= 0:
        return []
    pulses = max(0, min(pulses, steps))
    if pulses == 0:
        return [False] * steps
    if pulses == steps:
        return [True] * steps
    a = [[True] for _ in range(pulses)]
    b = [[False] for _ in range(steps - pulses)]
    while len(b) > 1:
        n = min(len(a), len(b))
        na = [a[i] + b[i] for i in range(n)]
        if len(a) > len(b):
            nb = a[n:]
        else:
            nb = b[n:]
        a, b = na, nb
    seq = [x for grp in (a + b) for x in grp]
    rot = ((rot % steps) + steps) % steps if steps else 0
    return seq[rot:] + seq[:rot]

def ring(cx, cy, R, pulses, steps, rot=0, dotr=None, accents=None):
    seq = bjorklund(pulses, steps, rot)
    if dotr is None:
        dotr = max(3, R * 0.11)
    accents = accents or set()
    out = [f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{STROKE}" stroke-width="1.5"/>']
    for i in range(steps):
        ang = -math.pi/2 + i * 2*math.pi/steps
        x = cx + R*math.cos(ang)
        y = cy + R*math.sin(ang)
        on = seq[i]
        if on and i in accents:
            fill, stroke = ACCENT, ACCENT
        elif on:
            fill, stroke = HIT, HIT
        else:
            fill, stroke = "none", DIM
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{dotr:.1f}" '
                   f'fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
    return "\n".join(out)

def txt(x, y, s, size=13, fill=TEXT, anchor="start", weight="400", mono=False):
    fam = "ui-monospace,Menlo,monospace" if mono else "system-ui,-apple-system,sans-serif"
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')

def rect(x, y, w, h, fill=PANEL, stroke=None, rx=8, sw=1):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{s}/>'

def svg_open(w, h, title):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" font-family="system-ui,sans-serif">',
            rect(0, 0, w, h, fill=BG, rx=0),
            rect(0, 0, w, 44, fill=PANEL, rx=0),
            txt(24, 28, title, size=16, weight="600"),
            txt(w-24, 28, "FH-2 FORGE · Euclidean", size=12, fill=DIM, anchor="end")]

# 16 demo patterns (pulses, steps, rotation); a couple inactive (pulses 0)
PATS = [(5,8,0),(3,8,0),(4,16,0),(7,16,2),(2,5,0),(9,16,0),(1,4,0),(0,8,0),
        (11,16,3),(3,4,0),(6,8,0),(5,12,1),(0,16,0),(4,7,0),(8,16,0),(2,3,0)]

# =====================================================================
# A — GRID OVERVIEW
# =====================================================================
def gen_grid():
    W, H = 920, 700
    s = svg_open(W, H, "A · Grid overview — all 16 generators, click to edit")
    cols, cw, ch = 4, 210, 150
    x0, y0 = 24, 64
    for idx,(p,st,rt) in enumerate(PATS):
        r, c = divmod(idx, cols)
        x = x0 + c*cw; y = y0 + r*ch
        sel = (idx == 4)  # pretend #5 is selected
        active = p > 0
        s.append(rect(x, y, cw-14, ch-14, fill=PANEL if active else "#12161c",
                      stroke=SEL if sel else STROKE, sw=2 if sel else 1))
        cx, cy = x + (cw-14)/2, y + 52
        s.append(ring(cx, cy, 38, p, st, rt, dotr=4.2))
        label = f"{idx+1}  ·  {p}/{st}" + (f"  ↻{rt}" if rt else "")
        s.append(txt(cx, y+ch-30, label if active else f"{idx+1}  ·  empty",
                     size=12, fill=TEXT if active else DIM, anchor="middle", mono=True))
        if sel:
            s.append(txt(cx, y+ch-16, "▸ editing", size=10, fill=SEL, anchor="middle"))
    s.append('</svg>')
    return "\n".join(s)

# =====================================================================
# B — FOCUS + LIST
# =====================================================================
def gen_focus():
    W, H = 920, 560
    s = svg_open(W, H, "B · Focus + list — one big ring, sidebar to switch")
    # big ring panel
    s.append(rect(24, 64, 470, H-90, fill=PANEL, stroke=STROKE))
    cx, cy = 200, 230
    s.append(ring(cx, cy, 120, 5, 8, 0, dotr=11, accents={3}))
    s.append(txt(cx, cy+5, "5/8", size=26, fill=TEXT, anchor="middle", weight="600", mono=True))
    s.append(txt(cx, 90, "Generator 5", size=15, fill=TEXT, anchor="middle", weight="600"))
    # controls column
    ctrls = [("Pulses","5"),("Steps","8"),("Rotation","0"),
             ("Rate","1/16"),("Gate len","50%"),("Accent","every 4"),("Reset","off")]
    cyy = 380
    for i,(k,v) in enumerate(ctrls):
        col = i % 2; row = i // 2
        bx = 48 + col*215; by = cyy + row*42
        s.append(rect(bx, by, 200, 32, fill=PANEL2, stroke=STROKE, rx=6))
        s.append(txt(bx+12, by+21, k, size=12, fill=DIM))
        s.append(txt(bx+188, by+21, v, size=13, fill=HIT, anchor="end", mono=True, weight="600"))
    # sidebar list
    lx, lw = 512, 384
    s.append(rect(lx, 64, lw, H-90, fill=PANEL, stroke=STROKE))
    s.append(txt(lx+16, 92, "GENERATORS", size=11, fill=DIM, weight="600"))
    ry = 108
    for idx,(p,st,rt) in enumerate(PATS):
        sel = (idx == 4); active = p > 0
        rh = 24
        if sel:
            s.append(rect(lx+10, ry-1, lw-20, rh, fill="#13313a", stroke=SEL, rx=5))
        s.append(txt(lx+22, ry+15, f"{idx+1:>2}", size=12, fill=TEXT if active else DIM, mono=True))
        s.append(txt(lx+58, ry+15, (f"{p} / {st}" + (f"  ↻{rt}" if rt else "")) if active else "empty",
                     size=12, fill=TEXT if active else DIM, mono=True))
        # tiny inline ring
        s.append(ring(lx+lw-30, ry+8, 9, p, st, rt, dotr=1.7))
        ry += rh + 2
    s.append('</svg>')
    return "\n".join(s)

# =====================================================================
# C — HYBRID
# =====================================================================
def gen_hybrid():
    W, H = 920, 640
    s = svg_open(W, H, "C · Hybrid — big focused ring + live thumbnail strip")
    # focus panel
    s.append(rect(24, 64, W-48, 360, fill=PANEL, stroke=STROKE))
    cx, cy = 230, 244
    s.append(ring(cx, cy, 118, 5, 8, 0, dotr=11, accents={3}))
    s.append(txt(cx, cy+5, "5/8", size=24, fill=TEXT, anchor="middle", weight="600", mono=True))
    s.append(txt(cx, 100, "Generator 5", size=15, fill=TEXT, anchor="middle", weight="600"))
    # controls block on right of ring
    ctrls = [("Pulses","5"),("Steps","8"),("Rotation","0"),
             ("Rate","1/16"),("Gate len","50%"),("Accent","every 4"),("Reset","off"),("Output","CV 5")]
    bx0 = 440
    for i,(k,v) in enumerate(ctrls):
        col = i % 2; row = i // 2
        bx = bx0 + col*215; by = 110 + row*64
        s.append(rect(bx, by, 200, 50, fill=PANEL2, stroke=STROKE, rx=6))
        s.append(txt(bx+12, by+20, k, size=11, fill=DIM))
        s.append(txt(bx+12, by+40, v, size=16, fill=HIT, mono=True, weight="600"))
    # play bar
    s.append(rect(60, 392, 110, 22, fill=PANEL2, stroke=SEL, rx=11))
    s.append(txt(115, 407, "▶ preview", size=12, fill=SEL, anchor="middle"))
    s.append(txt(190, 407, "tempo 120 · in-browser only", size=11, fill=DIM))
    # thumbnail strip
    s.append(rect(24, 440, W-48, H-460, fill=PANEL, stroke=STROKE))
    s.append(txt(40, 466, "ALL 16 · live", size=11, fill=DIM, weight="600"))
    tx0, tw = 40, 53
    for idx,(p,st,rt) in enumerate(PATS):
        x = tx0 + idx*tw
        sel = (idx == 4); active = p > 0
        if sel:
            s.append(rect(x-2, 476, 48, 120, fill="#13313a", stroke=SEL, rx=6))
        cx2 = x + 22
        s.append(ring(cx2, 524, 18, p, st, rt, dotr=2.4))
        s.append(txt(cx2, 580, str(idx+1), size=11,
                     fill=TEXT if active else DIM, anchor="middle", mono=True))
    s.append('</svg>')
    return "\n".join(s)

for name, fn in [("layout-a-grid", gen_grid),
                 ("layout-b-focus", gen_focus),
                 ("layout-c-hybrid", gen_hybrid)]:
    path = os.path.join(OUT, name + ".svg")
    with open(path, "w") as f:
        f.write(fn())
    print("wrote", path)
