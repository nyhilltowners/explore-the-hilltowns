# water_harness — v982 (2026-09-29)

Headless check for `site/waterwip.html`. Serves `site/` on :8123, loads the page in Playwright's Chromium,
prints a JSON line (cards / creek panels / lake multiples / outfall cards / page height) plus any page errors,
and writes `out/full.png` and one PNG per panel (`tx`, `ncards`, `bugs`, `lakes`, `prof`, `tmdl`, `bloom`,
`toxin`, `gw1`, `gw2`, `outfalls`, `wq-map`).

    rm -rf site && python3 build/build.py
    ln -sfn /home/claude/node_modules node_modules      # sandbox: playwright lives there
    node scripts/water_harness/shot.js

In the sandbox the CDN (Google Fonts, MapLibre, OpenFreeMap tiles) is blocked, so `ERR_TUNNEL_CONNECTION_FAILED`
console lines are expected and the map panel renders its fallback text. A `PAGEERROR` line is a real bug.
