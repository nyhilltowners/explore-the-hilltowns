#!/usr/bin/env python3
"""Draw the contaminant-card diagrams → images/contaminants/<key>.svg   (v995, 2026-09-30, Laurie)

One picture per contaminant key, all in one visual language so what you learn on one card carries to the next:
  mol      skeletal formulas (RDKit) — corners are carbons, hidden hydrogens; one colour per element on every card
  element  a miniature periodic table with the element in gold (and a related element outlined), plus a callout
  decay    the uranium-238 → lead-206 chain, with radium or radon in gold
  cell     E. coli, drawn (fecal indicator bacteria are organisms, not molecules)

Input: data/water/molecules.csv (key, kind, smiles '|'-separated, labels '|'-separated, hs = draw explicit H, element,
related, caption). The caption is read by build/water.py and shown under the picture; this script only draws.

Run after editing molecules.csv:   pip install rdkit   then   python3 scripts/draw_molecules.py
The SVGs are committed, so the site build does not need RDKit.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Draw import rdMolDraw2D

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images" / "contaminants"
W, H = 400, 300
FONT = "system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif"
WHITE, GOLD, DIM = "#ffffff", "#fca315", "rgba(255,255,255,.55)"
BOND_SINGLE, BOND_GRID = 44, 26   # same bond length on every single-molecule card, so size on screen = size of molecule

# one colour per element, every card (RGB 0–1 for RDKit)
PAL = {1: (1, 1, 1), 6: (1, 1, 1), 7: (0.50, 0.70, 1.0), 8: (1.0, 0.45, 0.45), 9: (0.55, 0.95, 0.55),
       15: (1.0, 0.65, 0.30), 16: (1.0, 0.85, 0.30), 17: (0.35, 0.90, 0.65), 35: (0.88, 0.64, 0.42), 80: (0.75, 0.78, 1.0)}


def mol_svg(smi: str, w: int, h: int, hs: bool, bond_len: float | None = None) -> str:
    m = Chem.MolFromSmiles(smi)
    if hs:
        m = Chem.AddHs(m)
    AllChem.Compute2DCoords(m)
    d = rdMolDraw2D.MolDraw2DSVG(w, h)
    o = d.drawOptions()
    o.clearBackground = False
    o.bondLineWidth = 2
    o.minFontSize = 12
    o.maxFontSize = 18
    o.padding = 0.08
    o.updateAtomPalette(PAL)
    o.setBackgroundColour((0, 0, 0, 0))
    if bond_len:
        o.fixedBondLength = bond_len
    d.DrawMolecule(m)
    d.FinishDrawing()
    return d.GetDrawingText()


def nest(svg: str, x: float, y: float, w: float, h: float) -> str:
    """Re-root an RDKit SVG document as a nested <svg> at (x, y)."""
    body = re.sub(r"<\?xml[^>]*\?>", "", svg)
    body = re.sub(r"<svg[^>]*>", f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">', body, count=1)
    body = re.sub(r"<rect[^>]*style='opacity:1.0;fill:#FFFFFF[^>]*/>", "", body)  # any stray white background
    return body


def doc(inner: str, title: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            f'aria-label="{title}"><title>{title}</title>{inner}</svg>\n')


def txt(x, y, s, size=12, fill=WHITE, anchor="middle", weight=400, extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
            f'font-weight="{weight}" {extra}>{s}</text>')


# ---------------------------------------------------------------- molecules
def draw_mol(row) -> str:
    smis = row["smiles"].split("|")
    labels = row["labels"].split("|")
    hs = row["hs"].strip() == "1"
    n = len(smis)
    if n == 1:
        return doc(nest(mol_svg(smis[0], W, H - 10, hs, bond_len=BOND_SINGLE), 0, 5, W, H - 10), labels[0])
    cols = 2 if n in (2, 4) else 3
    rows = (n + cols - 1) // cols
    cw, ch = W // cols, (H - 4) // rows
    inner = []
    for i, (s, lab) in enumerate(zip(smis, labels)):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        inner.append(nest(mol_svg(s, cw, ch - 22, hs, bond_len=BOND_SINGLE if n == 2 else (22 if cols == 3 else BOND_GRID)), cx, cy + 2, cw, ch - 22))
        inner.append(txt(cx + cw / 2, cy + ch - 8, lab, size=11.5, fill=DIM))
    return doc("".join(inner), " · ".join(labels))


# ---------------------------------------------------------------- periodic table
PT = [
    "H . . . . . . . . . . . . . . . . He",
    "Li Be . . . . . . . . . . B C N O F Ne",
    "Na Mg . . . . . . . . . . Al Si P S Cl Ar",
    "K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr",
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe",
    "Cs Ba La Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn",
    "Fr Ra Ac Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og",
]
POS = {}
for p, line in enumerate(PT):
    for g, sym in enumerate(line.split()):
        if sym != ".":
            POS[sym] = (p + 1, g + 1)
INFO = {  # Z, name, standard atomic weight, family
    "Hg": (80, "Mercury", "200.59", "transition metal"), "Pb": (82, "Lead", "207.2", "post-transition metal"),
    "As": (33, "Arsenic", "74.922", "metalloid"), "Fe": (26, "Iron", "55.845", "transition metal"),
    "Mn": (25, "Manganese", "54.938", "transition metal"), "Ba": (56, "Barium", "137.33", "alkaline earth metal"),
    "Na": (11, "Sodium", "22.990", "alkali metal"), "Cl": (17, "Chlorine", "35.45", "halogen"),
    "Ca": (20, "Calcium", "40.078", "alkaline earth metal"), "P": (15, "Phosphorus", "30.974", "nonmetal"),
}


def draw_element(row) -> str:
    el, rel = row["element"].strip(), row["related"].strip()
    cell, x0, y0 = 20, 20, 12
    g = []
    for sym, (p, grp) in POS.items():
        x, y = x0 + (grp - 1) * cell, y0 + (p - 1) * cell
        if sym == el:
            g.append(f'<rect x="{x+1}" y="{y+1}" width="{cell-2}" height="{cell-2}" rx="2" fill="{GOLD}"/>')
            g.append(txt(x + cell / 2, y + 14, sym, 10, "#00004d", weight=800))
        elif sym == rel:
            g.append(f'<rect x="{x+1.5}" y="{y+1.5}" width="{cell-3}" height="{cell-3}" rx="2" fill="none" stroke="{WHITE}" stroke-width="1.6"/>')
            g.append(txt(x + cell / 2, y + 14, sym, 10, WHITE, weight=700))
        else:
            g.append(f'<rect x="{x+1}" y="{y+1}" width="{cell-2}" height="{cell-2}" rx="2" fill="rgba(255,255,255,.10)"/>')
    z, name, mass, fam = INFO[el]
    p, grp = POS[el]
    by = y0 + 7 * cell + 16
    g.append(f'<rect x="20" y="{by}" width="92" height="104" rx="8" fill="none" stroke="{GOLD}" stroke-width="2"/>')
    g.append(txt(30, by + 18, str(z), 13, GOLD, "start", 700))
    g.append(txt(66, by + 66, el, 42, WHITE, weight=800))
    g.append(txt(66, by + 92, name, 12, WHITE))
    lines = [(name, 16, 700), (f"element {z} · {fam}", 12, 400), (f"row {p} · column {grp}", 12, 400), (f"atomic mass {mass}", 12, 400)]
    if rel:
        rz, rname, _, _ = INFO[rel]
        lines.append((f"outlined: {rname} ({rz})", 12, 400))
    has_inset = bool(row["smiles"].strip())
    tx = 126
    for i, (s, sz, wt) in enumerate(lines):
        g.append(txt(tx, by + 18 + i * 19, s, sz, WHITE if i == 0 else DIM, "start", wt))
    if has_inset:   # the empty bay of the table (rows 1–3, columns 3–12) holds the small molecule
        iw, ih = 104, 64
        g.append(nest(mol_svg(row["smiles"].strip(), iw, ih, row["hs"].strip() == "1", bond_len=22), 62, 8, iw, ih))
        g.append(txt(170, 38, row["labels"].strip(), 11.5, WHITE, "start", 700))
        g.append(txt(170, 53, "the form in fish", 11, DIM, "start"))
    return doc("".join(g), f"{name} on the periodic table")


# ---------------------------------------------------------------- decay chain
CHAIN = [("U", 238, "4.5 billion yr", "uranium"), ("Th", 230, "75,000 yr", "thorium"), ("Ra", 226, "1,600 yr", "radium"),
         ("Rn", 222, "3.8 days", "radon · gas"), ("Pb", 210, "22 yr", "lead"), ("Pb", 206, "stable", "lead")]
SKIP = {0: "+3", 3: "+4", 4: "+2"}   # intermediate decays not drawn after box i


def draw_decay(row) -> str:
    hi = row["element"].strip()
    bw, bh = 90, 84
    xs = [14, 155, 296]
    y1, y2 = 36, 176
    pos = [(xs[0], y1), (xs[1], y1), (xs[2], y1), (xs[2], y2), (xs[1], y2), (xs[0], y2)]
    g = [txt(200, 20, "uranium-238 decay chain, as it runs in the bedrock", 12, DIM)]
    for i, ((sym, a, hl, nm), (x, y)) in enumerate(zip(CHAIN, pos)):
        on = sym == hi
        g.append(f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="8" fill="{GOLD if on else "rgba(255,255,255,.08)"}" '
                 f'stroke="{GOLD if on else "rgba(255,255,255,.4)"}" stroke-width="1.5"/>')
        ink = "#00004d" if on else WHITE
        g.append(f'<text x="{x+bw/2+6}" y="{y+40}" font-family="{FONT}" fill="{ink}" text-anchor="middle" font-weight="800">'
                 f'<tspan font-size="11" dy="-14" dx="-4">{a}</tspan><tspan font-size="28" dy="14">{sym}</tspan></text>')
        g.append(txt(x + bw / 2, y + 60, nm, 11.5, ink))
        g.append(txt(x + bw / 2, y + 76, hl, 11.5, ink, weight=700))
    # arrows between consecutive boxes (row 1 → right, down, row 2 ← left)
    def arrow(x1, y1_, x2, y2_, label=None, lx=None, ly=None):
        dash = ' stroke-dasharray="4 3"' if label else ""
        s = (f'<line x1="{x1}" y1="{y1_}" x2="{x2}" y2="{y2_}" stroke="{WHITE}" stroke-width="1.6"{dash} marker-end="url(#ah)"/>')
        if label:
            s += txt(lx, ly, label, 10.5, DIM)
        return s
    g.insert(0, '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
                f'<path d="M0,0 L10,5 L0,10 z" fill="{WHITE}"/></marker></defs>')
    g.append(arrow(xs[0] + bw + 2, y1 + bh / 2, xs[1] - 3, y1 + bh / 2, SKIP[0], (xs[0] + bw + xs[1]) / 2, y1 + bh / 2 - 8))
    g.append(arrow(xs[1] + bw + 2, y1 + bh / 2, xs[2] - 3, y1 + bh / 2))
    g.append(arrow(xs[2] + bw / 2, y1 + bh + 2, xs[2] + bw / 2, y2 - 3))
    g.append(arrow(xs[2] - 2, y2 + bh / 2, xs[1] + bw + 3, y2 + bh / 2, SKIP[3], (xs[1] + bw + xs[2]) / 2, y2 + bh / 2 - 8))
    g.append(arrow(xs[1] - 2, y2 + bh / 2, xs[0] + bw + 3, y2 + bh / 2, SKIP[4], (xs[0] + bw + xs[1]) / 2, y2 + bh / 2 - 8))
    g.append(txt(200, 280, "mass number above the symbol · half-life below", 11, DIM))
    g.append(txt(200, 295, "dashed arrow: +n short-lived steps not drawn", 11, DIM))
    return doc("".join(g), "Uranium-238 decay chain")


# ---------------------------------------------------------------- E. coli
def draw_cell(row) -> str:
    g = []
    cx, cy, L, R = 200, 138, 230, 44
    x0 = cx - L / 2
    # flagella (drawn first, behind the cell)
    ends = []
    for k, (sx, sy, dx, amp) in enumerate([(x0 + 20, cy + R - 6, -1, 9), (x0 + L - 30, cy + R - 4, 1, 8),
                                           (x0 + 60, cy - R + 4, -1, 8), (x0 + L - 10, cy - 10, 1, 9)]):
        pts, x, y = [], sx, sy
        for i in range(24):
            pts.append(f"{x:.1f},{y:.1f}")
            x += dx * 5
            y += (amp * (1 if (i // 3) % 2 == 0 else -1)) * 0.45 + (3 if sy > cy else -3)
        g.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{DIM}" stroke-width="1.6" stroke-linecap="round"/>')
        ends.append(pts[14])
    g.append(f'<rect x="{x0}" y="{cy-R}" width="{L}" height="{2*R}" rx="{R}" fill="rgba(90,200,140,.20)" stroke="{WHITE}" stroke-width="2"/>')
    g.append(f'<rect x="{x0+7}" y="{cy-R+7}" width="{L-14}" height="{2*R-14}" rx="{R-7}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>')
    g.append(f'<path d="M{cx-70},{cy} q20,-18 40,0 t40,0 t40,0 t30,0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/>')
    for i in range(14):  # pili
        t = i / 13
        x = x0 + R * 0.6 + t * (L - R * 1.2)
        g.append(f'<line x1="{x:.1f}" y1="{cy-R}" x2="{x-3:.1f}" y2="{cy-R-7}" stroke="{DIM}" stroke-width="1"/>')
        g.append(f'<line x1="{x:.1f}" y1="{cy+R}" x2="{x+3:.1f}" y2="{cy+R+7}" stroke="{DIM}" stroke-width="1"/>')
    g.append(txt(cx, 28, "Escherichia coli", 15, WHITE, weight=700, extra='font-style="italic"'))
    g.append(txt(cx + 70, cy + 4, "DNA", 10.5, DIM))
    fx, fy = (float(v) for v in ends[1].split(","))
    g.append(txt(W - 8, min(fy + 18, 250), "flagellum (tail)", 11, WHITE, "end"))
    g.append(txt(cx - 60, cy - R - 12, "pili (hairs)", 11, WHITE))
    # scale bar: L ≈ 2 µm → 1 µm = L/2
    sb = L / 2
    g.append(f'<line x1="{cx-sb/2}" y1="262" x2="{cx+sb/2}" y2="262" stroke="{GOLD}" stroke-width="3"/>')
    g.append(txt(cx, 282, "1 micrometre (a thousandth of a millimetre)", 11.5, GOLD))
    return doc("".join(g), "E. coli cell")


KINDS = {"mol": draw_mol, "element": draw_element, "decay": draw_decay, "cell": draw_cell}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader((ROOT / "data" / "water" / "molecules.csv").open(encoding="utf-8")))
    for r in rows:
        svg = KINDS[r["kind"].strip()](r)
        (OUT / f"{r['key'].strip().lower()}.svg").write_text(svg, encoding="utf-8")
        print(f"  {r['key']:12s} {r['kind']:8s} → images/contaminants/{r['key'].lower()}.svg ({len(svg)//1024} KB)")
    print(f"{len(rows)} diagrams")


if __name__ == "__main__":
    main()
