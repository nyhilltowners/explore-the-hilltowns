# Hilltowns Atlas — Cartographer Handoff
*Assembled 2026-09-22 from the climate & geology research/staging chat. Staging output only — merge into the live atlas happens in a separate atlas session.*

**Conventions used throughout**
- All GeoJSON and lat/lon CSVs are **WGS84 (EPSG:4326)**. (Source shapefiles were NAD83 UTM 18N; already reprojected.)
- Register dates are **ISO-TEXT**; register confidence is **A / B / C**.
- Glyphs: **🛘 U+1F6D8** (landslides), **🕳 U+1F573** (sinkholes). Keep them distinct — do not merge sinkholes under the landslide glyph.

---

## 1. Climate & Geology Event Register — `climate_register/`
- **`climate_geology_intake_FILLED.xlsx`** — the staging workbook. Primary payload is the **Events** sheet: **63 staged events, IDs 307–369** (historical climate / weather / geohazard events for the Helderberg Hilltowns, Capital Region, Hudson Valley, Catskills). Columns: ID, Start/End date (ISO-TEXT), Year, Century, Category, Event name, Area affected, Key measurement, Station/gauge, Impact summary, Primary source, Source URL, Confidence. The other sheets (Wind & Tornadoes, Subsidence & Karst, Geology pins, Folklore companions, Sources) are the intake template with a few reference/seed rows — Events is the main content.
- **`CARTOGRAPHER_MERGE_NOTES.md`** — **read this first.** The merge protocol: dedup, existence-guard against the current live timeline, ISO date handling, out-of-core (~N mi) tagging, fatalities handling, and per-event flags. Sections A–Q.
- **`RESEARCH_LEADS.md`** — banked but not-yet-staged leads (A–N): candidate geology pins needing coordinates, folklore companions, date confirmations, unresolved sources.
- **`SEARCH_TERMS.md`** — the keyword/search vocabulary used, for continuing the research passes.

> **Pending confirmations** (see merge notes): a few inferred dates (Events 367 / 368 / 369) and the 1839 freshet-vs-State-St-bridge discrepancy (Event 353) to resolve at merge; Event 343 (Blizzard of '88) enrich rather than duplicate; Event 347 (1914) headline 26 in vs body ~35 in.

---

## 2. Landslides — `landslides/`
- **`landslides_NY_VT_PA_NJ_MA.csv`** — **10,926 landslides** across NY, VT, PA, NJ, MA, filtered by true state boundaries from the **USGS US Landslide Inventory v3**. Coordinates in `Lat_N` / `Lon_W`. Key columns: USGS_ID, Date_Min/Max, LS_Type, Inventory, Inv_URL, `State`, `Feature` (point vs polygon-centroid), `Glyph` (🛘). Counts: PA 7,448 (mostly polygon centroids), VT 3,047, NJ 266, NY 153, MA 12.
  - **Caveats:** (a) **NY coverage is thin (153)** — v3 has no comprehensive NY statewide inventory, so the Hudson Valley / Helderberg core is sparse here; the register captures more local NY slides than this does. (b) ~11k markers, PA-heavy — **needs marker clustering**. (c) 🛘 is a new emoji (Unicode 15.1) — may render as a box on older devices. (d) Use `Feature` to split a lighter points-only layer (3,677) from the PA polygon bulk.
- **`six_county_landslides.csv`** — 15 slides for the six core NY counties: USGS Conterminous debris-flow points **plus** a few dated, news-sourced local slides with narrative notes (mud-across-road, Capital Hills, Bridge St). Keep these curated local ones; the 5-state file does not reproduce them.

---

## 3. Karst sinkholes — `karst_sinkholes/`
Derived from **USGS SIR 2021-5094 / data release DOI 10.5066/P9AYMP94 (v4.0, 2024)** closed-depression inventory + its hand-verified subset (30 cm depth threshold). Each feature has both a **polygon** (outline) and a **centroid** (point); the CSV is the centroids. Fields: `verify`, `verify_meaning`, `host_unit`, `area_m2`, `glyph` (🕳).

- **`verify`**: `1` = positively identified (**confident**); `2` = unable to identify (**ambiguous**). Code 0 (false positive) and unverified blanks are excluded.
- **`host_unit`**: `Don` = Onondaga Limestone, `Dhg` = Helderberg Group — **both carbonate/soluble = karst**. `Dhm` = Hamilton Group (shale over Onondaga) = **not outcrop carbonate** → delivered separately as covered-karst candidates.

| Layer | Features | Host split | Confidence |
|---|---|---|---|
| `albsch_karst_sinkholes_*` (Albany–Schenectady) | **22** | Dhg 14, Don 8 | 19 confident / 3 ambiguous |
| `albsch_covered_karst_candidates_*` | 8 | Dhm | 7 / 1 |
| `schomont_karst_sinkholes_*` (Schoharie–Montgomery) | **18** | Dhg 14, Don 4 | 16 confident / 2 ambiguous |
| `schomont_covered_karst_candidates_*` | 6 | Dhm | 5 / 1 |

- **Regional total: 40 carbonate-hosted karst sinkholes (36 confident) + 14 covered-karst candidates.**
- Map these as their own 🕳 layer; style/filter by `verify` (confident vs ambiguous). They can also feed the workbook's **Subsidence & Karst** sheet.
- The covered-karst candidates sit on Hamilton shale *over* buried Onondaga — possible cover-collapse, so kept as a separate lower-certainty class rather than discarded.
- Per-layer READMEs (`*_README.txt`) carry the full derivation and the correction history.

---

## 4. Reference layers — `reference_layers/`
- **`ny_caves_by_county.csv`** (+ `_README.txt`) — all **62 NY counties** × karst/cave characterization (Geology, Karst Features, Cave Size/Frequency/Hydrology, Comments) from **USGS SIR 2020-5030, Appendix 1**. **County-level and qualitative** — render as a choropleth or county popup attribute, **not** as points. Comments are expert testimony (Northeastern Cave Conservancy / NSS); some are anecdotal. `—` = none/not applicable.
- **`phenology_1891_coeymans_hollow.csv`** — 11 dated phenology observations (frost / heat / planting signals) from an 1891 Coeymans Hollow farm diary. Per-row confidence C. (1891 only; the reprinting columnist's 1985 bloom notes are deliberately excluded.)

---

## 5. Not included / open next steps
- **Karst susceptibility surface — not built.** All ingredients are staged in the P9AYMP94 layer stack (the `Soil_Classes` layer flags carbonate directly: class 1 = <20″ soil over carbonate, class 2 = 20–40″; plus Ksat, depth-to-bedrock, water table, surficial, land use). Needs an agreed weighting scheme before modeling.
- **An "all verified depressions" set** (145 features, Albany, pre-carbonate-filter) was an intermediate; it is **superseded** by the karst layers here and omitted. Regenerable if a broader (non-karst-filtered) depression layer is ever wanted.
- **Merging** the landslide and sinkhole layers into the register's Subsidence & Karst / Geology pins sheets is still pending — they are delivered here as standalone geospatial layers.
