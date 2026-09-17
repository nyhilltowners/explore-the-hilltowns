# NY Hilltowners Folk Atlas — Session Handoff (2026-09-17, v670)

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

Latest drop-in: **events_67**. Schema carries 4 recurrence columns after `Agenda`:
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

Version at handoff: **v670**. Next chat continues from v671.

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
