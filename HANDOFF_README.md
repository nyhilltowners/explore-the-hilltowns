# NY Hilltowners Folk Atlas — Session Handoff (2026-09-21, v777)

This ZIP is a **complete, self-contained source tree**. A new chat can unzip it,
run the build, and continue exactly where this session left off. Everything here
is the source of truth EXCEPT `data/events.xlsx` (see Ownership below).

---

## Quick start (rebuild from scratch)

```bash
cd <unzipped-dir>
rm -rf site
python3 build/build.py        # deterministic; reads the 3 xlsx in data/
# -> writes site/ (index.html, calendar.html, directory.html, data.js, ...)
```

Expected: `BUILD OK — 5944 records (5583 mappable), ~2749 warning(s)`.
The warnings are almost all "couldn't reach <url> for a preview image" and the
hearts/abacus 403 — cosmetic, retried next build. **Zero ERRORs = good.**

To verify a record without opening the map:
```bash
node -e 'let fs=require("fs");let s=fs.readFileSync("site/data.js","utf8").replace(/^[^=]*=/,"g=");eval(s);console.log(g.records.find(r=>/NAME/.test(r.t)))'
```

---

## What's in this package

| Path | Role |
|---|---|
| `partials/header.html`, `partials/footer.html` | **The global header (brand + skyline widget + nav) and footer.** Edit these, never a page's copy. Each page carries `<!-- @@header -->` / `<!-- @@footer -->` markers; `build.py` stamps the partials in and marks the current page's nav link active. Page-specific buttons (search, night toggle) live in each page right after the header marker. (v669) |
| `index.template.html` | **The map app** — all pin logic, glow/dim, canvas effects (birds), List View. This is the master; `site/index.html` is generated from it. |
| `calendar.html` | Calendar + agenda + Explore-nearby module. Source root (never edit `site/calendar.html`). |
| `directory.html` | A–Z directory page. |
| `about.html`, `bulletin.html`, `instagram.html` | Static pages. |
| `manifest.json` | **Category → sheet map.** Drives which POI sheets build reads + category labels/glyphs/colors. |
| `build/build.py` | The deterministic builder. Reads the 3 xlsx, writes `site/`. |
| `build/bulletin_backend.gs` | Google Apps Script backend for the bulletin (deploy separately; `SHARE_API` placeholder in index.template.html). |
| `data/points_of_interest.xlsx` | **POI master** — 12 category sheets (see below). WE OWN THIS. |
| `data/events.xlsx` | Events master — INGESTOR-OWNED (see below). |
| `data/folklore_legends.xlsx` | Folklore layer master. WE OWN THIS. |
| `skyline.js` | Skyline header animation. |
| `images/` | Favicons, share card, raccoon mark. |
| `scripts/patch60.py` | Coord-patch stopgap for events drop-ins (currently a no-op — ingestor emits correct coords now; keep for safety). |

Not included (regenerate/reinstall): `site/` (build output), `node_modules/`
(run `npm i` if you need the `canvas` lib for offline glyph renders — not needed
for the build itself).

---

## OWNERSHIP — critical

- **We own and edit directly:** `points_of_interest.xlsx`, `folklore_legends.xlsx`,
  and ALL the HTML/JS/build source. Edit these freely.
- **The INGESTOR owns `events.xlsx`.** Laurie drops in a new `events__NN.xlsx`
  periodically; we replace `data/events.xlsx` with it wholesale. Never hand-edit
  events as a durable change — it gets overwritten on the next drop-in. Event
  fixes go in the **ingestor brief** instead (see below).

---

## POI master — sheet structure (points_of_interest.xlsx)

12 published sheets (+ "EXAMPLE — not published" template, ignore it). Each row =
one POI. Category = sheet name, mapped in manifest.json. Approx row counts:

- Points of Interest (historical markers etc.), Restaurants, Antiques & Vintage,
  Farm Stands, Lodging, Adventures, Mutual Aid, Wellness,
  **Flowers & Garden** (renamed from "Flowers & Gifts" in v633), Other Necessities,
  Arts & Entertainment, Transportation.

Key columns: Name, Address, Latitude, Longitude, Monday…Sunday (hours), Website,
Phone, Glyph, Tags, Display (Yes/No), Anchor Type (premise / proxy / none), Notes,
and recurrence cols (Recur Weeks / Recur Days / Recur Except / Recur Time).

**Standing data rules (never violate):**
- Never geocode from a bare address; verify coords via Places or a real source.
- Never delete rows — set `Display=No` with a provenance note in Notes.
- Existence-guard (search by normalized name/address) before every add.
- Read-back verify after every xlsx write; clean-room rebuild before packaging.
- `Anchor Type=none` + blank coords = directory-only (no map pin), e.g. region-wide
  services (CDPHP Cycle bike-share), international (ENGSKO), org chapters.
- Every add/edit gets a dated `YYYY-MM-DD: … per Laurie` note.

---

## Pin logic — current behavior (index.template.html)

All timing is **Eastern Time** regardless of viewer TZ. Re-stamped every 60s.

**Events (rewritten v649):**
- Shown on the map only within **48h of start (ET)** AND not yet ended.
- Full-color, **no glow**, until **1h before start**.
- **Glowing** from 1h-before → end time.
- **Disappears the instant it ends** (not end-of-day).
- Multi-day / all-day / long-run events fall back to calendar-day windowing.
- Helpers: `evWindow(r)` (ET epoch-minutes start/end), `nyNowEpochMin()`,
  `nyMinutesNow()`, `nyDowKey()`.

**Businesses / orgs (POIs):**
- **Lit** (full color) on any day with defined open hours — even before open / after
  close for that day. Brightness = "open today," not "open this minute."
- **Glowing** only while actively open right now (`openNow` → `!isClosedNow`).
- **Dimmed** when today is Closed / blank / by-appointment. **Neutral** (not dimmed,
  not glowing) when there are no hours at all.
- "By appointment", "Dawn-Dusk", "24 hours", Lodging, PO-Box/approximate recurring
  orgs → never glow (each for a documented reason in `openNow`/`isDimmed`).
- Recurring POIs (Recur Weeks set) glow only during their meeting window, and are
  EXCLUDED from the calendar/agenda entirely (Kiwanis, Legion — contact directly).

**Canvas effect:** a small **blue-jay flurry** (2-4… currently 5-8 birds, size 15-24,
life ~680-1240ms = "twice as fast", ~30% less travel distance) rises from open pins.
Fixed-hinge wingbeat, 4 white wing-spots. Day-only, reduced-motion safe. The
**northern-lights "beam" mode** is kept in code (`FLURRY_MODE`) for a seasonal swap.

---

## UX state (recent)

- **v790 BUGFIX (2026-09-21): hamburger menu was invisible on the atlas page.** A leftover `#menuToggle{display:none;}` rule from before the v719/v730 hamburger-at-all-widths redesign never got cleaned out of `index.template.html`'s own `<style>` block, and — same ID selector, later in the cascade — it silently overrode the `.menubtn, #menuToggle{display:flex;}` rule that was supposed to show it. Removed. Only `index.template.html` had this; calendar/signals/tradingpost were clean.

- **v789 (2026-09-21): every Geology-layer pin now has a source Description.** 9 Catskill Geologist (Titus) pins credit thecatskillgeologist.com; the karst-cave inventory (~22 pins) credits Nardacci's Altamont Enterprise "Back Roads Geology" column, with Knox Cave and McFail's Cave also citing their specific extra sources (the 2025 Pomeroy marker, the 2005 caving-symposium paper); Murderer's Creek cites the 1841 Barber & Howe text on archive.org; Natural Stone Bridge, Bartholomew's Cobble, Rosendale/Widow Jane Mine and Tory Cave each cite their own official/marker source. The 21 wild-cave rows keep their caving-grotto note too — both live in Description now, appended together.

- **v785 (2026-09-21): merged a diverged v2 climate-register handoff.** Laurie's two research threads had branched apart. Pulled in v2's real coordinate pass on the karst sheet (21 rows upgraded from hamlet-centroid guesses to actual USGS-gage/published loci) and 5 new features (Natural Stone Bridge & Caves, Bartholomew's Cobble, Rosendale/Widow Jane Mine, Tory Cave, Wolf Hollow) into `data/climate_events.xlsx`, matching Geology-layer pins in `points_of_interest.xlsx`, and Tory Cave's 1777 Loyalist-spy legend into `folklore_legends.xlsx`. `data/hilltowns_extractions_all.md` and `hilltowns_poi_lore_notes.md` refreshed to v2's copies. Full accounting in the register's README sheet, addendum #2.

- **v784 (2026-09-21): 15 folklore entries added** to `data/folklore_legends.xlsx` (Little People & Folklore sheet, IDs H-716 through H-730) from `data/hilltowns_poi_lore_notes.md` — 4 Knox Cave sub-legends, Old Skull's bone-chamber legend, Clarksville Cave's carved dates, Barton Hill's "hollow hill" reputation, the Murderer's Creek/Sally Hamilton story, Rip Van Winkle's mountains + Palenville's gateway framing, the Cohoes mastodon, the Ghost Lake (Glacial Lake Albany), the Teator Stone, Gilboa's forest drowned twice, and McFail's corrected death date. All Website=thecatskillgeologist.com per Laurie; true original sources (Nardacci, Stone 2005, Irving, Roscoe, etc.) kept in each row's Notes/Recorded By. Coordinates reuse the matching Geology-layer pin where one exists (same cave/site, two layers: fact vs. story). Laurie asked for ~24; 15 is what the source notes actually support without inventing content — see her reply for the accounting.

- **v783 (2026-09-21), Claude worked the climate register's own open-items list** (Laurie sent a separate research-project handoff package and asked the atlas session to take it over, since the original chat was bloated). Resolved what web search + the atlas's own station data could reach: Knox Cave collapse month leans March 1975 (2nd source, a 2025 historic marker); Albany's 104°F/-28°F extremes confirmed against the current NWS ALY PDF; a new **Frost & Freeze Phenology sheet** computed straight from `data/stations/alcove_dam.csv` (70-year + recent-30-year medians, full year-by-year). Left genuinely open (need physical archive access or Laurie's own GIS work): McFails' historic-entrance collapse date, Ludlum vol. II, fine LiDAR off her own parcel (already run separately — no karst, see the land-mapping package), the NYS Museum karst inventory PDF, exact post-2012 tornado coordinates. Full accounting in `data/climate_events.xlsx`'s README sheet. Folklore-only items appended to `data/hilltowns_poi_lore_notes.md`.

- **v779 (2026-09-21), Laurie:** 10 deep-time geology / folklore POIs added to the Geology layer, from `data/hilltowns_poi_lore_notes.md` (The Catskill Geologist, Robert & Johanna Titus) — the alluvial fan on Rte 67 Freehold, Austin Glen turbidites (New Baltimore Conservancy), Cohoes Falls, the Twin Bridges Normanskill outcrop, the Rte 23 Catskill Front overlook, Gilboa Fossil Forest, Murderer's Creek (Athens, 1813), and the three Glacial-Lake-Albany-delta landmarks (Springwood/FDR, Vanderbilt Mansion, Mount Ida/Poestenkill Gorge). Landslide field-ID methods (leaning trees, headwall scarps) and the Route 102/Joralemon rock-shelter item are documentation, not new pins — the latter was already added as a lore POI. `hilltowns_poi_lore_notes.md` still has thinner leads (Altamont naming/Lucy Cassidy, undated) held back for lack of a confirmed location.

- **v776-v778 (2026-09-21), Laurie:**
  - Karst & Caves layer renamed to **Geology** (manifest key `geology`, same sheet/data).
  - **Locust Grove** (Oak Hill events venue) hours cleared — events-only, never glows.
  - **Six Hands Farm Store**: an exact-duplicate row consolidated into one.
  - **Gem Mercantile**: Display=No.
  - 5 directory adds: Art Murphy (fossils/geology, no pin), Catskills Visitor Center / Catskill Center (Mt Tremper), Meadowdale Winery (Voorheesville), Kaatsbaan Cultural Park (Tivoli), Herb Society of America NY (no pin).
  - **33 orchards/PYO farms** added to Farm Stands (🍎, tags `Apples; Pick Your Own`), 2 already present (Boehm Farm, Saunderskill Farms) skipped, 3 unverified (Apple Hill Farm, Meadowbrook Apples, Wilkens Fruit & Fir Farm) filed directory-only pending Laurie confirming location.
  - Dropped 3 weak weather stations from `STATIONS` in `build.py` (conklingville_dam, phoenicia, saratoga_springs_4sw) — thin/low-elevation, were bloating `station_dd.js`. CSVs left in `data/stations/`, harmless.
  - Updated `data/climate_events.xlsx` (register); added `data/hilltowns_poi_lore_notes.md` and `data/hilltowns_extractions_all.md` as reference material (Titus deep-time geology, folklore leads, Ways Atlas cross-links) — not yet built into map layers; flag for a future pass.

- **Karst & Caves layer (v776, Laurie):** new sheet in `points_of_interest.xlsx` + manifest category (key `karst_caves`, 🕳️, off by default). 23 features from the Regional Climate & Weather Event Register's Subsidence & Karst sheet — active caves, filled/erased sinks, and standing-hazard context rows. Coordinates are Places-confirmed where a preserve/park matched, hamlet-centroid `approximate` where only a general area is documented, and `none` (no pin, directory-only) for the three Barton Hill features (Caboose, Single X, Joober Hole) and the Joralemon/regional context rows still waiting on Mylroie 1977 for exact coordinates.
- **Lore / lost-places POIs (v776):** four rows added to Points of Interest — the Coonley house (Altamont), White Sulphur Springs (Berne), vanished Knox landmarks (Si Stevens' store, the old post office), and the Joralemon Park rock shelter. From `Hilltowns_extractions_ALL.md` (Altamont Enterprise archive, staged via the climate register). All `approximate` anchors pending exact sites.

- **Phenology pairs (v767, Laurie):** the Signals carousel now shows one PAIR per fortnight — Expected (from `data/microseasons.md`, *The Twenty-Four Microseasons of Albany Hill*, parsed by `build.py` → `site/phenology_expected.js`; bullets tagged ghost/health/garden/foodways) beside On record (the register). ← → step a fortnight at a time. Update either source by replacing the file and pushing.
- **Historical Phenology (v760, Laurie):** top of the Signals page. `data/climate_events.xlsx` (the Regional Climate & Weather Event Register: Events + Wind & Tornadoes sheets) → `build.py` → `site/phenology_history.js`; the page shows the current two-week window (1st–15th / 16th–end) as a card carousel with ← → to step through windows. Historical record ONLY — Laurie will add a separate current/expected phenology layer later. Update the register by replacing the xlsx and pushing.

- **Signs + Signals page (v747, Laurie):** `signals.html` + `signals.js`, an old-instrument-panel dashboard for Berne: sun arc (rise/set, daylight, delta vs tomorrow), moon (phase, %, Onondaga lunation name), today's hi/lo/precip, temperature/humidity/barometer/cloud gauges, five wind compasses (surface, 850, 500, 100, 10 hPa), and year-to-date heating/cooling (base 65°F) and growing (base 50/86°F) degree days from the Open-Meteo archive API. Nav link is commented out in both partials until Laurie approves; page builds at signals.html.

- **Renamed (v737, Laurie): the site lockup, page titles and OG tags now read "Hilltowns Field Guide"** (was "Hilltowns Folk Atlas"). The repo, build, and this README still say "atlas" internally; the About page's body copy still uses the word atlas descriptively — Laurie to rewrite when she wants.

- **Agenda-quiet (v733):** events already honor an `Agenda` column (No → map + search only, off the calendar), but drop-ins overwrite hand edits. `data/agenda_quiet.txt` is the durable atlas-side list: one substring (or `re:` regex) per line, matched against title + venue at build → `ag:0`. Ask the ingestor to emit Agenda=No upstream for series that are permanently list-noise.

- **Trading Post page (v720, Laurie):** `tradingpost.html` + nav item. Data lives in `data/trading_post.xlsx` (Category, Business, Town, Product, Price, URL, Image, Notes, Display); `build.py` emits `site/trading_post.js`. Blank Image → the product page's Open Graph image is fetched at build time (needs network — the GitHub runner has it; a sandbox build shows a placeholder 🛍️). Categories become horizontal scroll-snap carousels in workbook order. Adding a product = one row + push.

- **Landing page is the Calendar (v719, Laurie):** `build.py` emits `calendar.html` → `site/index.html` (list view is its default) and the map template → `site/atlas.html` (`site/calendar.html` is also emitted for old links). Nav order: Calendar, Atlas, Directory, IG. Pin deep-links are `atlas.html#<slug>`.
- **Hamburger nav at all widths (v719):** the link row is always behind the ≡ button (dropdown panel, right-aligned on desktop, full-width on phones).
- **Calendar list view is emoji-only again (v777, Laurie):** the OG-image treatment from v719 was tried and reverted — too visually heavy in the list. Left glyph column stays for layout; `img` is still fetched into `data.js` for other uses (the events preview cache), just not shown here.

- **Radio tuner (v698):** fixed bottom-left tuner on every page, injected by `skyline.js` (no markup). Presets live in the `STATIONS` array at the bottom of `skyline.js`; each `url` must be a direct HTTPS audio stream. All five shipped presets are `verified:false` best-guess endpoints — Laurie to test in a browser and fix/delete; a failed stream shows 'Stream unavailable' rather than breaking. Remembers station + play state in localStorage; browsers block autoplay until first click.
- **Atina Foods (v698):** pin + 13 stockist rows (some far out of region by design) + 3 online/distribution rows (no pin), all tagged `Atina Foods`; four pre-existing rows (Toko, Story Farms, Olana, Montgomery Place) tagged. Stockist websites were inferred from names and are flagged UNVERIFIED in Notes.

- **`Staffed 24h` tag (v683):** a POI whose day cells read `Open 24 hours` is lit but never glows (rule of 2026-09-15 for fridges/trailheads). Adding the tag `Staffed 24h` opts a genuinely staffed round-the-clock place (24-hour Stewart's) into the glow. Never fake it with a 1-minute closure.

- **Mobile bottom sheet opens COLLAPSED (peek) by default** (v658, per Laurie): peek height is
  measured from content (handle + Show filters + List View), not a fixed vh. Expanding filters or
  List View auto-lifts the sheet to mid (`window.__sheetExpand`). Tap on the handle: peek→mid→tall→mid.
- **Deploy path (v656+):** `.github/workflows/build.yml` rebuilds on push to `main` and publishes
  `site/` via GitHub Pages (Settings → Pages → Source: GitHub Actions). Repo holds the source tree;
  never commit `site/`. Pushing an edited `data/*.xlsx` is a self-serve deploy.
- `hilltowns_directory_editor.xlsx` is RETIRED (no copy exists; the POI master is the editing surface).

- **List View** (formerly "On the map"): collapsed by default, toggle button;
  expanding it collapses the filters and vice-versa (mutually exclusive). Sorts by
  distance from the **live map centre**, re-sorting on `moveend`. No sub-heading.
- Explore-nearby button sits BELOW event info (full-width text), expands downward.
- Down-weighted in Explore-nearby: Legion posts, post offices, off-season
  camping/glamping lodging, Wolberg Electrical, Agway Rentals (`isDownweightKind`).
- Mobile: fixed a duplicated `<div id="hnav">` that was collapsing the nav; added an
  emoji-bias (`GLYPH_DX/DY`) to center emoji glyphs in the shield.

---

## Events pipeline / recurrence schema

Latest drop-in: **events_72**. Schema carries 4 recurrence columns after `Agenda`:
`Recur Weeks` / `Recur Days` / `Recur Except` / `Recur Time`.

**Model A contract:** the ingestor emits ONE fully-dated row per occurrence and
stamps the recurrence cols as *metadata*. The atlas renders each dated row ONCE and
MUST NOT expand recurrence cols into new dates (that doubles everything). build.py
already reads all 4 cols (incl. Recur Except skip-months).

Drop-in procedure:
```bash
cp <new events__NN.xlsx> data/events.xlsx
python3 scripts/patch60.py     # coord stopgaps (currently 0 patches — ingestor fixed upstream)
rm -rf site && python3 build/build.py
```
Coordless events settle to ~2 (a chronic unverifiable pair). Super-Stories should
pin to Kinderhook (42.396) — comes correct from the feed now.

**Ingestor brief** (event-side changes that must go upstream, not patched here):
kept as `ingestor_brief_glyphs_2026-09-15.md` in the outputs folder across sessions.
Open items: event glyphs (Anger Management→🧠, Warmachine→🎲, Bard&Baker default 🎲,
Toddler Time→🐤, Trinity Feeds→🥫, Community Science→🔬, adaptive→🧑‍🦼); Senior Van
weekday-split coords (Greenville Tue / Cobleskill Thu).

---

## Tag cleanup — in progress

Big ongoing effort to tame tag sprawl. Started at 2,332 unique tags; now ~2,178.
- **79 variant clusters merged** (singular/plural, hyphenation, case) — canonical
  style is Title Case, singular nouns, hyphenated compounds (Dog-Friendly, etc.).
  Enforce this on all new adds.
- Consolidations done: Artisan(s)→Artists & Craftspeople; Volunteer variants→Volunteer;
  many deletes; Accessible cluster; etc.
- **~1,196 tags still used exactly once** (the long tail). Laurie reviews the
  numbered `one_off_tags_YYYY-MM-DD.md` and calls out deletes/merges by NAME
  (row numbers shift between regenerations — always work from names, and
  regenerate the list after each batch).

---

## Delivery ritual (every change)

1. Edit source (xlsx via openpyxl, or the HTML/build files).
2. Read-back verify the write.
3. `rm -rf site && python3 build/build.py` → expect BUILD OK, 0 errors.
4. Spot-check via the `node -e` data.js eval.
5. Package: copy source tree to a versioned folder, zip to
   `/mnt/user-data/outputs/nyhilltowners-atlas-YYYYMMDD-vNNN.zip`.
6. Also copy flat masters to `/mnt/user-data/outputs/points_of_interest.xlsx` and
   `events.xlsx` (Laurie pulls these directly).
7. Clean-room verify: unzip the package fresh, rebuild, confirm BUILD OK.
8. `present_files` the zip + both xlsx.

Version at handoff: **v777**. Next chat continues from v778.

---

## Known open items / flags

- SHARE_API placeholder in index.template.html — bulletin backend not yet deployed.
- Hours-integrity: recurring copy-paste-style errors keep surfacing (Greenville
  Pantry, Rudy's, Unbridled, Wisdom Roots, Hilltown Commons, Conkling Hall all
  fixed). Consider a routine "event-venue / no-public-hours" audit after each POI
  batch. A shared-hour-set audit script pattern exists (identical hour tuples across
  differently-named places = likely contamination).
- Ambiguous animal-sanctuary hours left as-is pending Laurie's call (Woodstock Farm
  Sanctuary, Kitten Angels, Mustang Valley, Animal Kind Hudson).
