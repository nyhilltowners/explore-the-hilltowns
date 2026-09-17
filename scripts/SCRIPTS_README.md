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
