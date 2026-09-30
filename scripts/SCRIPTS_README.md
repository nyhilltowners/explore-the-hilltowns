# Atlas maintenance scripts

Reusable tools for the NY Hilltowners Folk Atlas. **Run all of these from the
atlas root** (the directory containing `data/` and `build/`), after unzipping the
main handoff package. They are the reconstructed, cleaned-up versions of the
one-off `python3 -c` snippets used throughout the build sessions.

| Script | What it does |
|---|---|
| `tag_audit.py` | Scan every tag (POIs + events): unique count, frequency, variant clusters (singular/plural/case/hyphen dupes), and writes a numbered `one_off_tags_<date>.md`. Run this first when doing tag cleanup. |
| `tag_merge.py` | Apply tag **deletes + consolidations**. Edit the `DELETE` set and `REMAP` dict at the top, then run. De-dupes within each cell. **Always work from tag names**, not one-off row numbers (numbers shift each time the list is regenerated). |
| `variant_remap_v647.json` | The 83-entry variant→canonical mapping used for the big v647 merge. Reference / reusable as a REMAP source. |
| `hours_audit.py` | Flag hour-integrity problems: (1) identical hour-sets shared by 3+ differently-named places (copy-paste contamination — how the Greenville Pantry bug surfaced); (2) event/venue-type places carrying posted hours (often stray hours on an events-only venue). Verify results — bus stops, chains, town halls, beer halls are legit. |
| `events_inspect.py` | Sanity-check an events drop-in **before** building: confirms the 4 recurrence columns and Model A (all dated, no aggregates, no dupes). Usage: `python3 events_inspect.py <events__NN.xlsx>`. |
| `patch60.py` | Coord-patch stopgap for events drop-ins (also in the main package `scripts/`). Currently a no-op — the ingestor emits correct coords now — but keep it: run after each drop-in as a safety net. |

## Canonical tag style (enforce on all new adds)
Title Case · singular nouns (Museum, Goat, Trail) · hyphenated compounds
(Dog-Friendly, Gluten-Free Options, Family-Owned, Pet-Friendly).

## Typical tag-cleanup loop
```bash
python3 tag_audit.py                 # see clusters + get numbered one-off list
# Laurie reviews one_off_tags_<date>.md, calls out deletes/merges BY NAME
# edit DELETE / REMAP in tag_merge.py
python3 tag_merge.py
python3 tag_audit.py                 # re-verify, regenerate the list
rm -rf site && python3 build/build.py
```

## Known open (as of v655 handoff)
- `tag_audit` currently flags one leftover cluster: **Zine / Zines** — the v653
  "Zine Fair→Zine" rename left a separate "Zines" (x4). Merge Zines→Zine (or
  Zine→Zines, whichever Laurie prefers) next tag pass.


## events_carryover.py + events_carryover.json (v950, 2026-09-28)

The events master is ingestor-owned and replaced wholesale on every drop-in; the ingestor never reads the atlas
master back, so atlas-side corrections vanish unless re-applied. Before v950 that was done by hand from prose notes.
Now the fixes live as data in `events_carryover.json` (keyed by Event Name [+ Venue]; fields to set; a dated `why`).

    python3 scripts/events_carryover.py "events (79).xlsx"            # diff only: curated columns, master vs drop-in
    python3 scripts/events_carryover.py "events (79).xlsx" --apply    # replace data/events.xlsx, apply fixes, provenance in Notes

Read the diff first: anything the master has that the drop-in lacks is either (a) an atlas fix to carry — add it to the
JSON if it isn't there — or (b) a deliberate upstream edit — leave it. Remove a JSON entry once the ingestor carries
the fix itself (drop-in 78 already carried every Display/Agenda correction, so none of those are listed).

## mrds_ingest.py (v966)
Builds the `Mines & Quarries` sheet from a USGS MRDS state shapefile: `python3 scripts/mrds_ingest.py data/layers/mrds/mrds-fUS36 v966`. Refuses to run if the sheet already exists (delete the sheet first to re-ingest). Never writes the MRDS URL to Website (build preview fetch would hang).

## swmf_ingest.py (v967)
Ingests a NYSDEC Solid Waste Management Facilities CSV into `Waste & Contamination`: `python3 scripts/swmf_ingest.py data/layers/dec_swmf/<export>.csv v967`. Idempotent (skips sites already present by name+coords). Footprint bbox and the major-polluter regexes are at the top of the script.

## waste_extras_ingest.py / remediation_cso_ingest.py (v968)
Both append to `Waste & Contamination` from CSVs in `data/layers/dec_waste_extras/` and are idempotent on (name, rounded coords): `python3 scripts/waste_extras_ingest.py v968` (tire abatement, Title V, MSGP, PWL estuary) and `python3 scripts/remediation_cso_ingest.py v968` (remediation sites from the gzipped CSV, CSOs). Footprint bbox + major/legacy rules are at the top of each script.

## v969 ingest scripts
`bulk_storage_ingest.py` (DEC Bulk Storage from the gzipped export + BCP COC enrichment), `dec_permits_ingest.py` (Mined Land Permits → Mines & Quarries merge; Industrial WWTPs; Issued Title V permits enrichment), `wwtp_wells_ingest.py` (municipal WWTPs, Orphaned Wells). All take the version tag as argv[1] and are idempotent on (name, rounded coords). Lazy layers: set `"lazy": true` in manifest.json; build emits `site/data_<key>.js`.

- `sediment_caps_ingest.py <ver>` (v974) — joins the DEC Sediment Caps export (no coordinates) to remediation pins by program number; enriches tags/Notes, flips Display=Yes; unmatched → hidden `Coordinates Needed` row. Area/length are ground metres (see docstring).
- `source_backfill.py` (v975) — adds/fills the `Source` column on every POI sheet from Notes provenance phrases; idempotent. New ingest scripts should write Source directly (name — URL).
- `description_synth.py` (v976) — fills blank Description cells for dataset pins from their Notes (per-ingest templates); idempotent; never overwrites hand-written text.

## water_harness/ (v982)
Headless Playwright screenshot check for waterwip.html — see scripts/water_harness/README.md.

## draw_molecules.py (v995)
Draws the 23 contaminant-card diagrams into images/contaminants/<key>.svg from data/water/molecules.csv (skeletal formulas,
mini periodic tables, the uranium decay chain, E. coli). Needs RDKit (`pip install rdkit`); run it by hand after editing
the csv and commit the SVGs — the site build only copies them.

## split_waste.py (v997)
Splits the old 'Waste & Contamination' sheet of points_of_interest.xlsx into eight sheets by each row's type tag (Spills,
Fuel & Chemical Storage, Cleanup Sites, Orphaned Wells, Landfills & Waste Handling, Sewage & Overflows, Industrial
Discharges, Air Emissions). Idempotent. The older waste ingest scripts still write to 'Waste & Contamination' — if one is
re-run, run split_waste.py after it and the new rows are routed into the right sheets.
