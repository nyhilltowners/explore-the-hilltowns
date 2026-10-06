# Signals page headless harness (v963, 2026-09-28)

Renders `site/signals.html` in headless Chromium with every third-party feed mocked, so Signals changes can be
seen and checked without USGS / Open-Meteo / iNaturalist / eBird access (the Claude sandbox cannot reach them).

    cd scripts/signals_harness
    npm i maplibre-gl@4.7.1 playwright          # once; MapLibre is served from node_modules in place of cdnjs
    node run.js ../../site out.png              # after `python3 build/build.py`

What it does: serves `site/` on localhost:8765; routes cdnjs MapLibre to node_modules; answers USGS `nwis/iv`
(P1D transect+sweep, P7D charts, P30D ranges), `nwis/stat` and `nwis/site` with fixtures; answers Open-Meteo
archive with a synthetic 3-year daily series; answers iNaturalist and Wikipedia with fixtures; aborts everything
else. Prints marker/pin/chart counts, the popup text colour, the pinned-panel text, the station picker state and
the year-to-date grid; screenshots the water section. Chromium path is hard-coded to the sandbox's
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` — change `executablePath` elsewhere.

Fixture site numbers match the real transect (01350000, 01350100, 01350480, 01350750, 01351200, 01358000,
01359165, 01359525, 01362230, 01372058 …) so ordering and chain assignment are exercised for real.
OpenFreeMap is unreachable from the sandbox, so the harness always exercises the Esri raster FALLBACK, never the
grey/blue vector style — that must be eyeballed live.

v1010 (2026-10-05): the harness now mocks the modern USGS Water Data API (monitoring-locations, continuous, daily,
statistics/observationNormals) and answers 503 for waterservices.usgs.gov, so the adapter path in signals.js is what gets
tested. The statistics mock uses a guessed response schema (month/day/computation_type/value/year) — confirm against the
live API once a key is in place.
