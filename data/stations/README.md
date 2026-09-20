# Weather stations (xmACIS2 daily listings, NOAA GHCN-Daily via NRCC)

One CSV per station, same 25 columns (Date, MaxT, MinT, AvgT, precip, snow, depth, xmACIS's
own HDD/CDD/GDD and 1991–2020 normals/departures). `build.py` turns each into per-year
cumulative degree days for the Signs + Signals page (`site/station_dd.js`). Add a station:
export "Daily Data Listing" from xmACIS2 for the full period of record as PDF or CSV, drop it
here as `<slug>.csv` (PDFs are parsed the same way in the atlas chat), and add it to
STATIONS in build.py with its display name and rough elevation.

| slug | station | record | notes |
|---|---|---|---|
| slide_mountain | Slide Mountain (co-op) | 1948-05 → 2017-04; temperatures 1961–2012 | ~2,650 ft, highest station in the region; the cold bracket for the Hilltowns; closed |
| albany_ap | Albany International Airport (ALB) | 1938-06 → present | first-order station, 285 ft; the long, continuous record |
| alcove_dam | Alcove Dam (co-op) | 1942-05 → present | Alcove Reservoir, Coeymans — the closest active station to Westerlo, ~590 ft |
| cairo_3nw | Cairo 3 NW (co-op) | 1978-07 → 2012-08 | closed |
| cobleskill_2ese | Cobleskill 2 ESE (co-op) | 1987-09 → 2021-02 | closed |
| phoenicia | Phoenicia / Phoenicia 2SW (co-op) | 1948-05 → 2025-08 | two station IDs merged (1948–2000, 2001–2025) |
| windham_3e | Windham 3 E (co-op) | 1900-01 → 2017-04 | closed; the oldest and highest (~1,600 ft) — temperatures only for part of the record |
| conklingville_dam | Conklingville Dam (co-op) | 1948-05 → present | Sacandaga Reservoir, Saratoga Co., ~780 ft; active |
| prattsville | Prattsville (co-op) | 1948-05 → 2017-04 | closed |
