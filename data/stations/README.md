# Weather stations (xmACIS2 daily listings, NOAA GHCN-Daily via NRCC)

One CSV per station, same 25 columns (Date, MaxT, MinT, AvgT, precip, snow, depth, xmACIS's
own HDD/CDD/GDD and 1991–2020 normals/departures). `build.py` turns each into per-year
cumulative degree days for the Signs + Signals page (`site/station_dd.js`). Add a station:
export "Daily Data Listing" from xmACIS2 for the full period of record as PDF or CSV, drop it
here as `<slug>.csv` (PDFs are parsed the same way in the atlas chat), and add it to
STATIONS in build.py with its display name and rough elevation.

| slug | station | record | notes |
|---|---|---|---|
| indian_lake_2sw | Indian Lake 2 SW (co-op) | 1899-09 → present | ~1,660 ft, Adirondacks; active, near Westerlo's elevation |
| old_forge | Old Forge (co-op) | 1907-12 → 2021; temps through 2021 | ~1,720 ft, Adirondacks; closed, close to Westerlo's elevation |
| mohonk_lake | Mohonk Lake (co-op) | 1896-01 → present | ~1,245 ft, Shawangunks; the best-kept station in NY, active |
| saratoga_springs_4sw | Saratoga Springs 4 SW (co-op) | 1955-08 → present | ~305 ft; low elevation, included for regional context |
| lake_luzerne | Lake Luzerne (co-op) | 2009-03 → present | ~700 ft; precipitation/snow only, no temperature record |
| slide_mountain | Slide Mountain (co-op) | 1948-05 → 2017-04; temperatures 1961–2012 | ~2,650 ft, highest station in the region; the cold bracket for the Hilltowns; closed |
| albany_ap | Albany International Airport (ALB) | 1938-06 → present | first-order station, 285 ft; the long, continuous record |
| alcove_dam | Alcove Dam (co-op) | 1942-05 → present | Alcove Reservoir, Coeymans — the closest active station to Westerlo, ~590 ft |
| cairo_3nw | Cairo 3 NW (co-op) | 1978-07 → 2012-08 | closed |
| cobleskill_2ese | Cobleskill 2 ESE (co-op) | 1987-09 → 2021-02 | closed |
| phoenicia | Phoenicia / Phoenicia 2SW (co-op) | 1948-05 → 2025-08 | two station IDs merged (1948–2000, 2001–2025) |
| windham_3e | Windham 3 E (co-op) | 1900-01 → 2017-04 | closed; the oldest and highest (~1,600 ft) — temperatures only for part of the record |
| conklingville_dam | Conklingville Dam (co-op) | 1948-05 → present | Sacandaga Reservoir, Saratoga Co., ~780 ft; active |
| prattsville | Prattsville (co-op) | 1948-05 → 2017-04 | closed |
| central_park | Central Park (NWS first-order, USW00094728) | 1869-01 → present | ~140 ft, Manhattan; the longest continuous active weather record in New York; out of core, added for context |
| berne_2s | Berne 2 S (co-op) | 1966-06 → 1983-07 | ~1,300 ft (est.), Albany Co.; precip/snow only, closed |
| berne_5sw | Berne 5 SW (co-op) | 1983-12 → 1998-07 | ~1,500 ft (est.), Albany Co.; precip/snow only, closed |
| east_berne | East Berne 2.7 NE (CoCoRaHS) | 2021-03 → present | ~1,200 ft (est.), Albany Co.; precip only, active |
| greenville_07e | Greenville 0.7 E (CoCoRaHS) | 2012-05 → present | ~650 ft (est.), Greene Co.; precip/snow, active |
| greenville_07ene | Greenville 0.7 ENE (CoCoRaHS) | 2023-08 → present | ~650 ft (est.), Greene Co.; precip only, active |
| rensselaerville_21nnw | Rensselaerville 2.1 NNW (CoCoRaHS) | 2008-10 → present | ~1,550 ft (est.), Albany Co.; precip/snow, active |
| rensselaerville_2nw | Rensselaerville 2 NW (co-op) | 1971-06 → 1974-11 | ~1,550 ft (est.), Albany Co.; precip/snow, brief real temps at the very end (44 days), closed |
| westerlo_2 | Westerlo (co-op) | 1948-05 → 1959-06 | ~1,550 ft (est.), Albany Co.; precip only, closed |
| clarksville | Clarksville 2.7 S (CoCoRaHS) | 2019-05 → 2021-08 | ~600 ft (est.), Albany Co.; precip only, discontinued |
| altamont_29sw | Altamont 2.9 SW (CoCoRaHS) | 2019-05 → 2021-01 | ~900 ft (est.), Albany Co.; precip/snow, closed |
| altamont_04se | Altamont 0.4 SE (CoCoRaHS) | 2023-06 → present | ~700 ft (est.), Albany Co.; precip/snow, active |
| altamont_35nw | Altamont 3.5 NW (CoCoRaHS) | 2021-07 → present | ~1,100 ft (est.), Albany Co.; precip only, active |
| altamont_27ssw | Altamont 2.7 SSW (CoCoRaHS) | 2007-11 → present | ~800 ft (est.), Albany Co.; precip/snow, active — 19 years, the deepest CoCoRaHS record in this batch |
| athens_22nnw | Athens 2.2 NNW (CoCoRaHS) | 2017-04 → present | ~400 ft (est.), Greene Co.; precip only, active |
| athens_co_op | Athens, historic co-op | 1901-10 → 1919-10 | ~200 ft (est.), Greene Co.; REAL daily temps, 18 years (6,097 of 6,605 days) — the source PDF misspells the station "Atnens"; closed |
| berne_2nw | Berne 2 NW (co-op) | 1963-08 → 1966-05 | ~1,400 ft (est.), Albany Co.; precip/snow only, closed |
| catskill_41nnw | Catskill 4.1 NNW (CoCoRaHS) | 2024-06 → present | ~500 ft (est.), Greene Co.; precip only, active |
| fleischmanns_57n | Fleischmanns 5.7 N (CoCoRaHS) | 2015-01 → 2024-11 | ~2,000 ft (est.), Delaware Co.; precip/snow, Catskills high country, closed |
| knox | Knox, historic co-op | 2000-01 → 2001-02 | ~1,600 ft (est.), Albany Co.; REAL daily temps, ~13 months (327 of 406 days) — real but too short for the year-drawn chart, closed |
| ravena_14nnw | Ravena 1.4 NNW (CoCoRaHS) | 2018-10 → present | ~200 ft (est.), Albany Co.; precip only, active |
| freehold_2nw | Freehold 2 NW (co-op) | 1963-08 → 1978-11 | ~900 ft (est.), Greene Co.; REAL daily temps, 15 years (5,159 of 5,601 days), closed |
| freehold_34e | Freehold 3.4 E (CoCoRaHS) | 2011-08 → present | ~900 ft (est.), Greene Co.; precip only, active |
| middleburgh_63ese | Middleburgh 6.3 ESE (CoCoRaHS) | 2021-01 → 2025-12 | ~1,000 ft (est.), Schoharie Co.; precip/snow, discontinued |
| oak_hill | Oak Hill (co-op) | 1948-05 → 1962-09 | ~900 ft (est.), Greene Co.; precip only, closed |
| preston_hollow | Preston Hollow (co-op) | 1948-05 → 1963-02 | ~900 ft (est.), Albany Co.; precip only, closed |
| voorheesville | Voorheesville, historic co-op | 1950-04 → 1951-02 | ~300 ft (est.), Albany Co.; REAL daily temps, ~11 months (278 of 334 days), closed |
| west_berne | West Berne, historic co-op | 1898-08 → 1932-12 | ~1,300 ft (est.), Albany Co.; REAL daily temps, **34 years** (12,224 of 12,565 days) — the oldest and most local station in the whole set, closed |
