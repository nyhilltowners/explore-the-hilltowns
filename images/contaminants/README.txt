Contaminant-card diagrams, one per workbook key: <key>.svg (lower-case: hg.svg, pfos.svg, microcystin.svg …).

Drawn by scripts/draw_molecules.py from data/water/molecules.csv (v995) and committed, so the site build needs no RDKit.
To change a picture: edit the row in molecules.csv (SMILES, labels, element, related, caption), then
    pip install rdkit && python3 scripts/draw_molecules.py
The caption column is the "How to read this" text shown under the picture; build/water.py reads it.

Kinds: mol = skeletal formula(s) · element = mini periodic table (gold = this element, outlined = related) ·
decay = uranium-238 chain · cell = E. coli drawing. Element colours are the same on every card:
F green · O red · N blue · S gold · Cl teal · Br tan · P orange · C and H white.
