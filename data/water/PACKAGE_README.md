# Helderberg–Hudson Water Quality — Cartographer's Package

Assembled 2026-09-29. Regional study of water quality from the Westerlo–Rensselaerville divide to the Hudson; reference point Rensselaerville hamlet (42.515, −74.145, ~1,500 ft). Read `brief/Cartographers_Brief_Helderberg_Hudson_Water.pdf` first; its final section, "Handoff package", is the design and data-model contract. The live, editable brief is the Claude Docs artifact of the same name.

## Layout

```
brief/          the brief (PDF, 17 pp) and a plain-text copy
workbooks/      helderberg_hudson_water_quality.xlsx  (52 sheets, the master; every sheet's A1 cell comment states provenance)
                dmr_history_2009_2016.xlsx, dmr_history_2019_2024.xlsx  (raw monthly discharge reports, 361k rows)
csv/            one CSV per sheet of the master workbook, cached values (formulas resolved) — for loading into a dashboard
geo/            GeoJSON (EPSG:4326) ready to draw, see below
source_docs/    the 2013 Basic Creek TMDL and the 2000 NYC Phase II TMDL (PDF)
```

## Keys

- `site_id` — the 21 dashboard nodes (`csv/sites.csv`, `geo/nodes.geojson`). Joins measurements, assessments, habs_2025, dec_* sheets.
- `permit` — NPDES/SPDES ID (e.g. NY0094854). Joins echo_cwa_permits → dmr_limits / dmr_results / dmr_summary / dmr_annual / loading_tool_pollutant / loading_tool_facility.
- `sid` — USGS site number. Joins usgs_wells ↔ usgs_wells_raw.
- Every table with coordinates also carries `km_from_ref`, `aquifer_setting`, `dec_basin`, and (where relevant) `in_basic_creek_res_catchment`, so layers filter without a spatial join.

## Cell colours in the workbooks

Blue = verbatim from the named source. Black = derived by Claude (distances, tags, roll-ups). Yellow = an assumption meant to be edited (e.g. the effluent-P estimate in tmdl_basic_creek_detail). If a dashboard number cannot be traced to a blue cell, leave it off.

## GeoJSON layers (`geo/`)

| File | Features | What | Draw as |
|---|---|---|---|
| nodes.geojson | 21 | the dashboard nodes with all `sites` attributes | the transect glyphs (symbol grammar in the brief) |
| basic_creek_res_basin.geojson | 1 | Basic Creek Reservoir catchment, USGS StreamStats, 11,318 ac | polygon outline |
| streamstats_basic_creek_dam_catchment_shapefile.zip | 1 | same, as the original shapefile | — |
| nys_unconsolidated_aquifers_250k_clip.geojson | 40 | DEC valley-fill (sand & gravel) aquifers, clipped to the study box; `GPM` = well-yield class | pale underlay |
| nys_major_water_basins_clip.geojson | 14 | DEC permit basins (13-09 "Catskill Creek" lumps Hannacroix); `PERMIT_BAS` = the PWL ID prefix | faint boundaries |
| albsch_/schomont_karst_sinkholes_*.geojson | 40 + 14 | lidar-verified sinkholes and covered-karst candidates (USGS SIR 2021-5094) | stipple along the escarpment front |
| dams.geojson | 274 | DEC Inventory of Dams, Albany/Greene/Schoharie; `hazard_class`, `LastConditionRating` | impoundment glyphs with condition ring |
| echo_cwa_permits.geojson | 603 | every Clean Water Act permittee in the three counties; `tier` says individual permit vs general; `watchlist_note` names the 24 facilities the brief discusses | outfall glyphs; filter on watchlist_note for the curated industrial layer; join to dmr_annual for sparklines |
| usgs_wells.geojson | 213 | USGS groundwater sites with summarised chemistry | small triangles; plateau vs valley by `aquifer_setting` |
| dec_lake_monitoring_reports_clip.geojson | 110 | DEC lake report pages (LINK) | click-through on lake glyphs |
| reference_studies.geojson | 8 | far-afield exemplar studies (centroids; Cape Cod/NAWC/Darby are ±0.5–1 km estimates) | inset or labelled markers, never as local data |
| cannon_pfas_sites.geojson | 40 | Cannon AFB PFAS sampling sites with maxima | the one drillable exemplar, own zoom |

Clipping box for the *_clip layers: lon −74.75 to −73.55, lat 42.05 to 42.85. Full statewide originals are on the NYS GIS Clearinghouse.

## Sheets → CSVs

**Node & measurement core**

- `README.csv` — 48 rows × 3 cols
- `sites.csv` — 21 rows × 28 cols
- `parameters.csv` — 23 rows × 7 cols
- `measurements.csv` — 102 rows × 16 cols
- `assessments.csv` — 7 rows × 12 cols
- `habs_2025.csv` — 8 rows × 8 cols
- `tmdl_basic_creek.csv` — 23 rows × 4 cols
- `tmdl_basic_creek_detail.csv` — 66 rows × 4 cols
- `dec_lake_summer_summary.csv` — 49 rows × 14 cols
- `dec_basic_creek_profiles.csv` — 43 rows × 7 cols
- `dec_hab_toxins.csv` — 612 rows × 8 cols
- `dec_results.csv` — 17,121 rows × 22 cols
- `dec_dow_availability.csv` — 1,379 rows × 11 cols
- `wqp_import.csv` — 1 rows × 15 cols

**Groundwater**

- `usgs_wells.csv` — 213 rows × 45 cols
- `usgs_wells_raw.csv` — 6,010 rows × 11 cols

**Discharges (key: permit)** — plus `regional_top10_fy2025.csv` / `regional_loads_fy2025.csv`: FY2025 annual loads for every NY permittee within 100 miles (2,056 permit × pollutant rows; top ten per pollutant), with method and outlier flags — see the sheet A1 note before quoting.

- `echo_search_list.csv` — 115 rows × 12 cols
- `echo_local_facilities.csv` — 433 rows × 12 cols
- `echo_cwa_permits.csv` — 603 rows × 38 cols
- `dmr_limits.csv` — 3,725 rows × 21 cols
- `dmr_results.csv` — 54,408 rows × 22 cols
- `dmr_summary.csv` — 3,615 rows × 18 cols
- `dmr_annual.csv` — 45,366 rows × 18 cols
- `loading_tool_facility.csv` — 465 rows × 27 cols
- `loading_tool_pollutant.csv` — 9,160 rows × 57 cols
- `ny_wwtp_outfalls.csv` — 119 rows × 9 cols
- `ny_msgp_stormwater.csv` — 264 rows × 14 cols
- `ny_cso_outfalls.csv` — 54 rows × 11 cols

**Other pressures**

- `ny_withdrawals.csv` — 1,668 rows × 10 cols
- `ny_withdrawals_by_user.csv` — 114 rows × 13 cols
- `ny_land_application.csv` — 16 rows × 18 cols
- `ny_waste_facilities.csv` — 197 rows × 13 cols
- `ny_remediation_sites.csv` — 287 rows × 15 cols
- `ny_orphan_wells.csv` — 16 rows × 11 cols
- `ny_titlev_summary.csv` — 50 rows × 13 cols
- `ny_titlev_annual.csv` — 435 rows × 17 cols
- `ny_hg_deposition.csv` — 148 rows × 8 cols
- `ny_mercury_summary.csv` — 261 rows × 14 cols
- `ny_mercury_raw.csv` — 2,061 rows × 13 cols

**Framework & context**

- `ny_dams.csv` — 274 rows × 37 cols
- `ny_lake_reports.csv` — 61 rows × 10 cols
- `ny_wetlands_summary.csv` — 16 rows × 5 cols
- `karst_sinkholes.csv` — 54 rows × 14 cols
- `ny_habs_2012_2018.csv` — 62 rows × 12 cols
- `ny_hudson_estuary_segments.csv` — 7 rows × 12 cols
- `ny_hre_grants.csv` — 129 rows × 7 cols
- `ny_biomonitoring_sites.csv` — 280 rows × 11 cols
- `ny_cslap_lakes.csv` — 7 rows × 26 cols

**Air, land and water releases (key: tri_id)**

- `tri_releases.csv` — EPA TRI, every facility × chemical × year within 100 miles, 1987–2024
- `tri_facilities.csv` — per facility-year totals (air / water / on-site / POTW / off-site) with top chemicals
- `tri_mercury.csv` — mercury stack-air series by facility
- `tri_trend_50mi.csv` — regional totals by chemical and year within 50 miles

**Reference studies**

- `references.csv` — 22 rows × 13 cols
- `pfas_map_studies.csv` — 8 rows × 21 cols
- `pfas_map_cannon_sites.csv` — 40 rows × 25 cols
- `sources.csv` — 73 rows × 6 cols

## Contaminant profiles (key: contaminants.key)

- `contaminants.csv` — 23 substances: name, group, CAS, every applicable standard with type and what it protects, natural-occurrence note, persistence, two-line summary, and result/release counts.
- `contaminant_results.csv` — long-format join, one row per ambient measurement (finished water, raw lake, creek, groundwater, bloom sample, fish muscle, bird blood) keyed to `contaminants.key`; non-detects carry `qualifier = "not detected"` and the limit in `detection_limit` with `value` blank.
- `contaminant_key` column on dmr_annual, dmr_summary, dmr_limits, tri_releases, loading_tool_pollutant, regional_loads_fy2025, dec_results, usgs_wells_raw and measurements, so "who releases it" ranks itself from the release tables.
- `dec_hab_reports.csv` / `dec_hab_by_year.csv` — per-report bloom status (S / C / HT) 2012–2025 from the DEC portal export, and the worst status per lake per year.

## Cadence warning

Four clocks in one workbook: finished water (annual, at the tap: `measurements`), raw ambient (DEC, years apart: `dec_results`, `dec_lake_summer_summary`), monthly discharge reports (`dmr_results`), and EPA annual loads (`loading_tool_*`, and the `source = "EPA Loading Tool annual"` rows in `dmr_annual`). Never share an axis across clocks without labelling it. Concentration (mg/L) and load (kg/yr) are different quantities.

## Units in the discharge tables

EPA's FY2009–2016 bulk extracts carry no DMR unit field. Because the DMR unit equals the permit-limit unit in 99.98% of rows where both exist, every row now has a `unit` inherited from its limit and a `unit_source` column saying whether it came from the DMR field or the limit. Use `unit`, not `limit_unit`, and honour `unit_source` in tooltips. `reported_in_standard_units` / `standard_unit` are EPA's own normalisation where present.

## Known holes (as of 2026-09-29)

- FY2017–18 monthly DMRs: EPA's bulk extracts for those years are header-only (their defect, reported). Annual Loading Tool figures bridge the gap.
- Basic Creek Reservoir water-column sampling after 2018 not found.
- Ten of 21 node elevations are still estimates (marked in `elev_source`).
- Study centroids for Cape Cod, NAWC, Darby Creek: ±0.5–1 km.
- AA/AA(s) watersheds and freshwater wetlands: attribute-only exports, no geometry.
- Albany AWQR 2022 and 2024 not obtained.
- `loading_tool_facility` total loads are unreliable for small plants (EPA double-counts across units); use `loading_tool_pollutant`.

## Provenance

Every sheet's A1 comment names the source, date and processing. `sources.csv` lists every document and export used; `references.csv` (REF-001…022) is the study bibliography. Distances are equirectangular, ±0.1 km at this scale. Point-in-polygon tags were computed with shapely against the GeoJSON layers included here.