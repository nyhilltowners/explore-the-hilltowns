# NY Hilltowners Folk Atlas — Session Handoff (2026-09-25, v868)

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

- **v868 (2026-09-25): phenology rewrite, batch 1 + Apiary first** — Radio tuner: Apiary is now the first preset (and the default for anyone without a saved station). Microseasons: season 18 (Sept 16–30, Dogwood Berries White) replaced verbatim with Laurie's edit — scientific-with-an-edge tone, no Ghost section, tender-crops entry moved to Garden, two duplicate/attic entries dropped; season 19 (Oct 1–15) rewritten to match: Ghost entries folded into Flora (reduced canopy, chestnut/elm) and Garden (apple harvest), garlic moved Health Watch → Garden, the two buck-sign entries merged, Orionids moved to season 20 where the dates belong. Both `Entries (Long Form)` and `Calendar Matrix` updated (matrix rebuilt from long-form for 18–20). Ghost column kept for now; remove when all 24 are done. Pre-edit workbook at /tmp/microseasons_pre_v868.xlsx (session only). NEXT BATCHES: seasons 20–24, then 1–17 — slow, one or two per pass, Laurie reviews tone.
- **v867 (2026-09-25): Independent Media removed from the Atlas page** — new manifest flag `"atlas": false` (emitted as `c.atlas`); the atlas category loop skips it and forces the layer off, so no checkbox and no pins. It stays in the Directory untouched. Same flag works for any future directory-only category.
- **v866 (2026-09-25): Geology layer relabeled 'Natural History'** (manifest label only — sheet, key and `NEARBY_EXCLUDE_CATS` updated; the workbook sheet is still named Geology). **Signs + Signals link shown in header and footer nav.** Every event pin on the layer now carries its year(s) in the title (21 renamed: landslides, mudslides, erosion, Berne Mill/Irene; Mount Ida and Hudson/Claverack list multiple years); non-events labeled as such — '(karst feature)', '(deep time)', USGS centroids '(2021 survey)'. Standing rule: a Natural History event pin's Name includes its year.
- **v865 (2026-09-25): Signals page edits (Laurie)** — page subhead removed; phenology window title gold with the season name in italics; phenology subheads (Sky & Light etc.) gold (were white: `.sg-wrap div` outranked `.ph-sech`); the '24 microseasons in N entries…' line removed; Air grid forced to 4 columns ≥1000px (`#air-grid`); barometer now shows a 3-hour tendency (arrow + ±hPa/3 h + rising/falling/steady, WMO-style bands, from Open-Meteo hourly surface_pressure past_hours=6); Degree-days / Water station picker defaults to Alcove Dam; 'What people are actually finding out there this week' removed; `.sg-btn` (all of them, incl. earlier/later and year-by-year) now solid gold with dark text.
- **v864 (2026-09-24): events master replaced with Laurie's `events (74).xlsx`** — 2,322 event rows (130 new since the v863 master, 2 removed; 127 of the new rows carry 'AUTO — needs review'). Out-of-region auto-ingest leaks set Display=No (Secret Riso Club ×~5 Brooklyn, Tatter Brooklyn, Temenos Retreat Center); Glenville Oktoberfest coordinate flagged (~200 km off). 14 new rows have no coordinate (online webinars, Zoom clubs, and a few venues that need geocoding: New Baltimore Fire District, Shamrock House, St Paul Lutheran, Island Green Golf, Magic Forest Farm). Pre-replacement master saved at /tmp only — the workbook Laurie uploaded is the new master.
- **v863 (2026-09-24): Catskill Creek bridges article ingested** (Knapp & Miller, NY Almanack Apr 2025) — register Events 384–389 (1804 freshets, Mar 1818 ice, May 1869 span collapse, spring 1870 ice, June 1874 flood/3 bridges, Apr 1 1875 LOC ice-gorge photo), one 🧊 Geology pin at Bridge St, Catskill (with the 1882 'West Shore piers as ice dam' concern in notes), folklore H-742 (Burr's 1802 draw-bridge). 1818 vs 1870 quotations flagged as possibly conflated in the source. Register next ID 390; folklore H-743.
- **v862 (2026-09-24): H-741 'When did New York stop speaking Dutch?'** (Kieran O'Keefe, NY Almanack 2019) added as region-wide language-history context, anchored in-core by the 1842 Herald line sending readers to 'the Helderburgh' for pure Dutch; Berne-hamlet stand-in pin. Folklore next free ID: H-742.
- **v861 (2026-09-24): Berne Historical Project (bernehistory.org) added** to Independent Media as a directory-only reference (📜, Anchor none), alongside the Harold Miller entry.
- **v860 (2026-09-24): Harold Miller series ingested (6 of 8 remaining articles) + directory entry** — folklore H-735 West Mountain ME church & Swiss bell; H-736 Zeh & Warner sawmill / Weidman mill / East Berne origin; H-737 squatters-above-the-escarpment thesis (Bleeker 1767, Cockburn 1787); H-738 Fischer–Wood House (also a 🏛️ Points of Interest pin at Stranahan Lane); H-739 slavery in Berne / Jack Deitz; H-740 Dietz Massacre re-dated to Sept 1 1781. Harold Miller (d. 2022) added to Independent Media, directory-only. PENDING (Almanack 502s): 'Morgan Filkins returns the Civil War dead' (Jan 11 2022) and 'Berne & Knox: German Heritage' (Feb 1 2022). All pins approximate (Places road/cemetery centroids); coordinate hunts noted in each row. Folklore next free ID: H-741.
- **v859 (2026-09-23): West Mountain history (Berne) added** — folklore H-734 from Harold Miller's New York Almanack article (settlement 1790s, Taylor 1799, Peasleys, buckwheat exhaustion, 1935 Resettlement Administration buyout at $2–4/ac, Katie Wood's refusal, 1940s $1 state lease); Partridge Run WMA pin cross-referenced. DEC vs Miller acreage/date discrepancy noted, not resolved. Folklore next free ID: H-735.
- **v858 (2026-09-23): World Imagery Wayback added** to Other Necessities as a citizen-science directory resource (🛰️, Anchor Type none, no pin) per Laurie.
- **v857 (2026-09-23): 11 DEC state lands added to Adventures** from pages Laurie supplied — Dutton Ridge, Leonard Hill, High Knob, Mount Pisgah, Bates, Cole Hill, Scott Patent, Stone Store state forests (🌲) and Franklinton Vlaie, Partridge Run, Margaret Burke WMAs (🦆). One pin per property at a DEC-listed parking/access coordinate; every other DEC access point is in Notes. Partridge Run State Forest already existed. Stone Store coordinate flagged suspect (DEC page's text and map link disagree; approximate).
- **v856 (2026-09-23): Rte 157A / Sawmill Rd 'Ames Acres' sink pinned** (🕳️, approximate — Laurie's map-identified closed depression; not yet matched to the 1988 parcel). Karst sheet row 40 updated. All karst-sheet loci now have coordinates.
- **v855 (2026-09-23): Fox Creek swimming-hole sinkhole pinned** (🕳️, approximate at the Bradt Hollow Rd bridge — coordinate from Laurie; pool just downstream). Karst sheet row updated. Remaining karst locus without a coordinate: Rte 157A/Sawmill Rd sink, Berne.
- **v854 (2026-09-23): places of concern + wind history.** New pin type ❗ 'Place of Concern' (tag 'Not an Event'): Krumkill Rd ravine-fill mudslide fear (2003, approx). Rte 443 ditch sinkhole in Berne hamlet (2004) pinned 🕳️ approx at the BKW campus, carrying the hamlet karst/gas-station concern in its notes. Vly Creek PFAS (v836) is the third concern-type pin. Web check of straight-line wind history against the Wind sheet: coverage already good (1950 83-mph all-time gust, 1976 flash freeze 67 mph, 1995 derecho, 1998 outbreak, 2002 microburst, 2019 Halloween, 2020 Oct 7 derecho); enriched 119 (NWS: 83 mph record, $20M) and 167 (77 mph at ALB 6:41 a.m.); row 381's 'Thanksgiving 1961' flagged as a probable memory slip for 1950. Christmas 2020 rain-on-snow flood and the Dec 16–17 snowstorm were already rows 239/240 — nothing added. Fox Creek/Bradt Hollow bridge still not Places-resolvable (returns Fox Creek Park) — needs a coordinate.
- **v853 (2026-09-23): 9 Enterprise scans 2002–07.** ENRICHED 191 (Tax Day nor'easter Apr 2007 — Knox/Onesquethaw pump-outs, Berne road closures, Johnston Rd, FEMA/state 100% reimbursement), the 2002-08-14 microburst wind row + its pin (Lone Pine area second core, two homes condemned). NEW karst row: spring-2004 sinkhole in the Rte 443 ditch, Berne hamlet, 200 ft W of the BKW bus garage (Coordinates Needed — Places-able). The two Nardacci columns (Knox Cave Oct 2004, Skull Cave Jan 2005) were already in the pins from v826; the 2003 Krumkill Rd fill/mudslide-fear item is context only.
- **v852 (2026-09-23): 14 Enterprise scans 1987–2002.** NEW rows 382 Oct 18 1990 Westerlo windstorm (Fields Rd barn lifted, Rte 404 willow — in core) and 383 June/July 13 1996 Hilltowns flash floods (7–8 in/12 hrs at Knox). ENRICHED 159 (Oct 4 1987 snowstorm — 200k out, Voorheesville–East Berne line last), 169 (Jan 1996 floods — Hilltowns FEMA tally, Altamont ice jams), 173 (May 31 1998 tornadoes — 46 warnings, Derbyshire Rd towers), 175 (Floyd — Western Ave collapse, Knox/Berne/Westerlo/Rensselaerville road detail). Karst sheet: Fox Creek sinkhole locus pinned down (pool below the Bradt Hollow Rd bridge, ~60 m wide, West Berne/Knox — Places-able next pass); NEW karst row for the Rte 157A/Sawmill Rd sinkhole, Berne (1988 Ames Acres file). Skipped: 1988 GEPOD, 1989 master-plan maps, 2002 karst guide (context only), Dec 1992 Doc Murphy boat (NJ). No pins this pass.
- **v851 (2026-09-23): 16 more scans (Argus 1888–1900, News-Herald 1910/1974/1989, Enterprise 1910–52).** NEW rows 375 Johnstown NY cloudburst flood Jul 1889 (Cayadutta; pin candidate Perry St bridge), 376 Feb 7 1891 Albany ice/wire storm, 377 Jun 16 1894 Albany cloudburst (2.12 in/77 min record), 378 Aug 23–24 1898 hail/86-mph squall, 379 spring 1899 lower-Hudson drought (C), 380 Memorial Day 1910 hickory-nut hail at Clarksville/Westerlo (in core), 381 Mar 10 1974 Ravena windstorm (flags a Thanksgiving-1961 windstorm as missing). ENRICHED 344 (Jul 5 1888 squall), 336 (Sep 12 1900 Galveston-remnant wind, Altamont Fair tents), 107 (1938 hurricane — 12 bridges out in Knox), 161 (Jul 10 1989 F4 day — Ravena/Cobleskill detail). Noise: 1889-05-11 (NYC/Pa. cyclone), 1899-06-13 Wisconsin tornado, AE 1910-06-17 (European floods), AE 1915-07-23 (Mount Vernon VA landslide), AE 1940-11-01 & 1952-11-14 (nothing). No pins this pass.
- **v850 (2026-09-23): 14 newspaper scans (Argus 1887–1920, Enterprise 1949–83) — mostly keyword noise on 'sinkhole'.** Useful: Argus Feb 19 1899 → Blizzard of '99 enrichment (all railroads blockaded, Albany Railway sole transit, 3rd time since 1882); Enterprise May 13 1949 → already row 324 (May 1949 heat spike), nothing added; same issue is the PRIMARY SOURCE for Stoodley's and Featherstonhaugh's caves (Schoharie escarpment, early May 1949) — karst sheet enriched; Knox Cave pin gets its 1949 baseball-league colour. Enterprise Feb 17 1983 → NEW karst-sheet row + 🕳️ pin: natural sinkhole in the cellar of Becker's Store, 125 Maple Ave, Altamont (c.1818 building; conf C, local memory). Enterprise Jul 22 1977 cave-rescue exercise was already in the Clarksville pin (v826). Nothing usable in the other nine (Lexington VA murder, Michigan train wreck, Florida feud, figurative 'sinkhole of corruption/Plattism', Proctor Knott's rabbit joke ×2, Brother Bogus, Florida 1981 sinkholes, Green Island runaway).
- **v849 (2026-09-23): Titus 'A visit to an old cement mine' (May 9 2019)** — Rosendale / Widow Jane Mine pin enriched (Snyder Estate district, Century House Historical Society, room-and-pillar mine, Rondout Fm ~420 Ma: Rosendale Dolostone / Glasco Limestone / Whiteport Dolostone, Canvass White natural cement 1825, last production 1970). Nothing for the register. Possible future pin: Coeymans cement plant as living industrial geology.
- **v848 (2026-09-23): Titus 'The Pine Street Flood' (Aug 7 2026)** — row 288 (Pine St distributary flood, Palenville, recurring) already existed from the earlier column; enriched with the bridge destruction, highway-crew 'several times before', and the overbank-distributary mechanism. First pin for it: 🌊 (new glyph for flash-flood loci), approximate at Places' Pine Ave, Palenville. Still needs the 2025 TV/Daily Mail date and prior washout dates.
- **v847 (2026-09-23): Titus 'Family Day Trip: Cohoes Falls' (2015/2019)** — Cohoes Falls pin enriched (Cataract Rd viewing stand directions; Normanskill Fm turbidites + black shale, Taconic tilting ~450 Ma; Harmony Mills 1872–1988). Deep time only; ⛰️ kept; nothing for the register.
- **v846 (2026-09-23): 'Yellow Alert?' date conflict flagged.** Titus reposted the same column dated Jul 8 2005 (2017 repost) and Apr 17 2007 (2021 repost). Rows 371 (Amsterdam slump) and 372 (Freehold slides) keep 2005 but carry the discrepancy — if 2007 holds, Amsterdam ≈ early Apr 2007 and Freehold 2006–07. Row 297 notes the 2021 repost's 'LANDSLIDE IN GLENMONT' headline (probably Groesbeck Pl, May 2021; no new July 2021 row). Nothing else new.
- **v845 (2026-09-23): Titus 'A deep sea at New Baltimore' (2013/2021)** — Austin Glen / New Baltimore Conservancy pin notes enriched (Armstrong farm site on CR 61, quarry, greywacke + black shale, flute casts = turbidite, ~465 Ma foreland basin). Deep-time only; nothing for the register; ⛰️ kept.
- **v844 (2026-09-23): Titus 'St. Peters slide' column** — enrichment only: row 72 (Mar 17 1859 St. Peters College, Mt. Ida) gets the date confirmation, no-deaths detail, half-built-college context; Mount Ida Delta pin notes updated; row 293 Haverstraw gets Titus's 19-dead corroboration.
- **v843 (2026-09-23): Titus 'threat of landslides' (2017) + 'Yellow Alert?' (2005).** Sources added to 291/292 (Bridge St Greenport 2017/2006), 294 (Delmar), 290 (1st Ave — 2005 contemporaneous 'six homes'). **New rows 371 June 2005 Amsterdam delta slump and 372 Freehold small bank slides 2004–05** (both conf C, no loci, no pins). Titus's climate framing (NY precip 36→42 in/yr over the century, rising water tables) noted on 371. Not entered: Gilboa spill 2005, Valatie basements 2005.
- **v842 (2026-09-23): Titus 'Haverstraw' column.** Row 293 (Haverstraw Jan 1906) and its pin enriched with the mechanism (over-steepened Lake Albany clay bank, clay-mining tunnels under downtown, rain-on-snow; six blocks sank, gas fire). **New row 370: April 2025 New Baltimore landslide** (conf C, month precision, possibly fill-triggered per Titus) — no pin, no coordinate; Titus's 'Normans Kill in New Baltimore' watercourse name is flagged as suspect. Separate from the still-undated pre-2018 New Baltimore slide.
- **v841 (2026-09-23): Nott Terrace dedupe.** Row 229 (dated 2018-02-22 = Titus's blog-post date) was the same slide as row 303 (2018-01-28, Barney St / Nott Terrace) — folded into 303 and removed; ID 229 is now a gap. Titus column correctly cited as Mountain Eagle Feb 2 2018. Phenology count −1.
- **v840 (2026-09-23): Titus 'Schenectady landslide' column ingested (enrichment only).** Everything named is already in the register: Nott Terrace 2018 (229/303, pinned), 1st Ave 2004 (290, pinned approx), Broadway/890 1996 (289, still unpinned — Titus confirms Pleasant Valley Creek as the locus), plus row 195's recurring list. Source added to 289/290/229/303/195; six-condemned-houses detail on 290; two pins' notes updated. **New gaps surfaced:** a modern Germantown slide and a New Baltimore slide ('a few years ago' as of 2018) — neither dated nor in the register; the Aug 17 2023 repost date is just when Titus re-ran the 2018 column — no Aug 2023 Schenectady slide found or entered; worth a TU check.
- **v839 (2026-09-23): approximate-locus landslide pins.** Per Laurie, every remaining register landslide got a pin anchored to a Places-confirmed named locus (hamlet/road/landmark centroid), Anchor Type approximate, tag 'Approximate Locus', with the anchor named in Notes: Kaaterskill Clove 2006, Staatsburg 1903, Richmondville 1893, Rte 443 near New Scotland 2000 (row 286 — possibly = Delaware Ave 294), 1st Ave Schenectady 2004, Fonda FJ&G 1903, Kingston brickyard bank 1886 (Hutton Brickyards), Bozenkill Rd Knox 2000, Stillwater RR cut 1888, Iron Works station South Troy 1902 (Burden), Milton West Shore 1923, Rensselaer RR 1902. **Still unpinned** (no Places-confirmable locus): Broadway/Rte 890 Schenectady 1996 (Places returns downtown, not Pleasant Valley Creek), Bartlett brickyard N of Hudson 1890, Mica Insulating Works W Schenectady 1903, Irene Catskill-escarpment debris flows 2011 (regional), Lake Albany clay slides (recurring, regional).
- **v838 (2026-09-22): Blue Cross = Maher Rd.** Laurie located the Blue Cross/Blue Shield building at 1251 New Scotland Rd (Rte 85) at Maher Rd, Slingerlands — the same corner as the 1968 'Mahar Road' slide (row 304; spelling variant). Existing Mahar pin renamed, given the Places-confirmed coordinate (⚠️, approximate — parcel, not the bank face), Coordinates Needed tag dropped; rows 304 and 325 cross-noted. Open: whether 325 (undated, 'when the building was built', 1988 Enterprise) IS the 1968 event — needs the building's construction year; not folded.
- **v837 (2026-09-22): ⚠️ sweep #2** — Hyde Park Delta (Springwood), Hyde Park Delta (Vanderbilt), Mount Ida Delta and the Meads Corners Route 32 slab watch-item → ⚠️ (their notes carry actual slides/rockfall). Rule now: any Geology pin whose notes describe a slide, slump or rockfall is ⚠️, even a deep-time site. Austin Glen (submarine debris-flow *rock*, not a hazard) stays ⛰️, as do Cohoes Falls, Twin Bridges outcrop, Catskill Front overlook, Gilboa, Murderer's Creek, A Bump in the Road.
- **v836 (2026-09-22): Vly Creek biosolids/PFAS pin** (💧, new glyph on the layer) — 2025 New Scotland well contamination near the Vly Creek Reservoir, from the Altamont Enterprise Feb 9 2026. Anchored to Places' Vly Creek (stream) result, Anchor Type approximate, tagged Coordinates Needed — the article names no farm or street and the affected home is private, so nothing tighter was attempted. Not a climate-register event (hydrogeology).
- **v835 (2026-09-22): four coordinate gaps closed per Laurie.** Geology pins added: Schoharie Creek Thruway bridge collapse 1987 (⚠️, exact — Laurie's coordinate; register row enriched with the NTSB sequence: pier 3 → spans 3–4 → pier 2 ~90 min → pier 1 shift; ~50-yr flood, ~150 mm rain + snowmelt; Mill Point Bridge lost a section 6 days later ~3.1 mi upstream — NO pin, coordinate still needed); 4th & Federal St sinkhole, Troy 2023 (🕳️, exact — Laurie's coordinate); Berne Mill site at 2978 Berne-Altamont Rd (⚠️, Places-confirmed address); Barber farm sinkholes at 3621 NY-30, Middleburgh (🕳️, Places-confirmed address). Still coordinate-less: Rossman 1948, Broadway/890 1996, 1st Ave 2004, Blue Cross Rte 85 (also undated), Kaaterskill Clove 2006, Mill Point Bridge 1987, railroad-era slides.
- **v834 (2026-09-22): ⚠️ for slides + coverage pass.** Landslide/slump/mudslide Geology pins re-glyphed ⛰️ → ⚠️ (26 pins; deep-time sites — deltas, outcrops, falls, cloves, fossil forest — keep ⛰️). Coverage check of the register against pins: every event with a confirmable tight locus is pinned; two more added this pass with Places-confirmed loci — Magnolia Terrace landslide, Albany (1919) and the Hudson ice jam at The Glen (1903). Still register-only, deliberately: region-wide storms/blizzards/cold waves/heat/drought (no point), reach-scale Mohawk/Hudson jams and freshets, county-centroid tornadoes, the 1987 Thruway bridge collapse (Places won't resolve the bridge — needs a coordinate from a source), 4th & Federal Troy 2023, Rossman 1948, Kaaterskill Clove 2006, Broadway/890 1996, 1st Ave 2004, Berne Mill, Barber farm, Blue Cross Rte 85, and the railroad-era slides — all listed in RESEARCH_LEADS / v827 entry.
- **v833 (2026-09-22): Susan's hours + karst layer merge.** Adventures: Susan's Pleasant Pheasant Farm & Kayak Rentals hours → By appointment. Research package `Hilltowns_Atlas_Handoff_2026-09-22.zip` ingested: its register workbook was byte-identical to the one merged in v826/v828 (Events 307–369) — skipped. **Karst sinkholes → 54 Geology pins** (🕳️, USGS SIR 2021-5094 / P9AYMP94 v4.0 closed-depression centroids, Anchor Type exact): 35 confident carbonate-hosted sinkholes Display=Yes; 5 ambiguous + 14 shale-covered candidates Display=No (manifest said 36/4 — the CSVs carry 35/5). Named by host unit/region/# (no place names exist for them). **Not pinned:** the 10,926-row five-state USGS landslide CSV (PA-heavy, needs clustering; NY only 153 rows) and `six_county_landslides.csv` (15 rows — the 8 undated debris-flow points already sit at Display=No; the dated local ones are already pinned). Everything shipped is kept in `data/layers/research_2026-09-22/` (polygons, GeoJSON, county cave table, 1891 Coeymans Hollow phenology diary, RESEARCH_LEADS, SEARCH_TERMS) for a future clustered landslide layer / county choropleth. Research chat suggested 🛘 (U+1F6D8) for landslides — not adopted; it's Unicode 15.1 and boxes on older devices; ⛰️ stays. Build below.
- **v832 (2026-09-22): Mine Kill + Explore-nearby ranking.** Adventures: 'Mine Kill State Park Pool' → **Mine Kill State Park** (year-round Dawn-Dusk, weather permitting; parks.ny.gov/visit/state-parks/mine-kill-state-park); Keleher Preserve glyph 🌲 → 🚵. `calendar.html`: NEARBY_PRIORITY += The Huyck Preserve, Thacher State Park; NEARBY_DEMOTE (tier 1) += Capital Ceramic Supply, T&J Soaps, Town Line Auto, Schoharie Sheriff, Greenville Dental, The Gristmill, Big Hollow Road Trail Head, The Woodhouse Lodge, Love Albany Center, Winter Clove Inn. Note: 'the gristmill' is a substring match — check no other Gristmill-named place is caught.
- **v831 (2026-09-22): Z's Nutty Ridge** added to Flowers & Garden (🌰 hazelnut/chestnut nursery & orchardists, 5296 Town Line Rd, McGraw/Cortland Co. — Places-confirmed; znutty.com; no published hours; out of core footprint ~110 mi W).
- **v830 (2026-09-22): Restaurants edits** — The Babbling Brook glyph 🍟 → 🍔; **Wunderstop** added (☕ coffee/cafe/pastries/chocolate inside the Hudson Amtrak Station, 69 South Front St; same coordinates as the station's Transportation pin; Mon–Fri 6–5, Sat–Sun 7–5; wunderstop.com).
- **v829 (2026-09-22): Explore-nearby priority** — Via Ravioli (Restaurants) and ThTree (Wellness) added to `NEARBY_PRIORITY` in `calendar.html` (tier −1: picked into the panel before everyone else, still shown in distance order).
- **v828 (2026-09-22): second research-chat merge — storm-scan batches (intake Events 333–369).** Workbook `climate_geology_intake_FILLED.xlsx` re-delivered with 307–369; 307–332, the 19 pins, karst, folklore and sources were already in v826 and were skipped. **30 new Events added (333–342, 344–346, 349–353, 355–357, 359–361, 364–369)** — newspaper-scan windstorms, blizzards, freshets, ice jams, the 1919 Magnolia Terrace slide, 1938 Delanson tornado, 1925 October snowstorm; mostly B, retrospective-sourced 1833/1839/1853/1869/1925 rows are C. **7 folded as duplicates** into existing rows (enriched, IDs left as gaps): 343→81 Blizzard of '88, 347→93 Feb 1914 blizzard (26 vs 35 in discrepancy recorded), 348→165 Superstorm 1993 (Westerlo named), 354→71 Feb 1857 flood, 358→179 Apr 2003 ice storm, 362→134 Dec 1969 snowstorm, 363→294 Delaware Ave (secondhand c.2000 account). Existence-guard note: 338 (Feb 17 1902) is a separate storm from row 319 (early Feb 1902) — kept both. Merge-notes §§A–F were handled in v826; §K out-of-region backlog is Laurie's call and untouched. `docs_research_leads_2026-09-22.md` (the research chat's coordinate-hunt list) added to the tree for reference. Build: 5,952 records (unchanged — no pins this pass), phenology 432 (+30).
- **v827 (2026-09-22): hazard pins on the Geology layer.** Per Laurie: every register hazard with a fairly tight location is now a pin, source and year in the name/tags/notes. **50 wind pins** (🌪️) from the Wind & Tornadoes sheet — all tornadoes with a Tornado Project/NCEI/NWS start coordinate, the 1989 F4 family, and the 2002 Guilderland Center microburst; pin = touchdown/start point, track end in Notes; Anchor Type exact for A-grade NCEI rows, approximate for NWS-survey "coords approx" rows. **Skipped 26 wind rows** on purpose: 8 county-centroid rows (6 pre-1950 Grazulis + 2018/2020 Greene), 17 region-wide events sitting on the Albany placeholder (derechos, synoptic windstorms, ice storm, Isaias, thunderstorm-wind days), and the April 2021 tornadoes (no coords). **5 event pins** with Places-confirmed loci: Prattsville Schoharie Creek recurring ice jams (1939/1978/1979, one pin, 🧊), Green Island Bridge 1977 (🧊, exact), Hudson jam at I-787/Corning Preserve 1976 (🧊, approx), Schoharie Creek at Rte 5S/Fort Hunter 2004 (🧊, approx), Rustic Barn tank-collapse sinkhole 2018 (🕳️, exact). **Not pinned** (no confirmable tight locus): Mohawk/Hudson reach-scale jams, Rossman 1948, The Glen 1903, Kaaterskill Clove 2006, 4th & Federal Troy 2023, Barber farm sinkholes 2011, Berne Mill scour, the 1996 Broadway/890 and 2004 1st Ave Schenectady slumps, Fonda/Stillwater/Iron Works/Mica Works/Milton/Bartlett railroad-era slides, Blue Cross Rte 85 — all still register-only. Subsidence & Karst: every coordinate-bearing feature was already pinned; nothing added. Existing pins enriched with dated register events + sources: Mount Ida Delta (1837, 1859), Bridge St Hudson (2006, 2017), Cohoes Falls (2018 jam), Knox Cave (1975), Onesquethaw (1991, 2011). **Register dedupe:** my v826 merge had created two duplicates of pre-existing rows — 318 folded into 284 (Richmondville 1893) and 329 into 291 (Bridge St 2017) — rows deleted, sources/notes carried across, IDs 318/329 now gaps; formulas rewritten after the deletion. **Flagged, not acted on** (pre-v825 rows, Laurie's call): 257 vs 299 look like the same May 7 2024 Catskill/Cauterskill slide; 286 (Spring 2000 Rte 443 slide into the Normanskill) may be the Delaware Ave slide of row 294 under its Altamont Enterprise framing. Glyphs 🌪️/🧊 are new on this layer — if the map wants them styled, that's an index.template.html change. Build: 5,952 records (5,549 mappable), Geology 111 visible, phenology 402 (−2 from the dedupe).
- **v826 (2026-09-22): first climate/geology research-chat merge.** Ingested `climate_geology_intake_FILLED.xlsx` + `CARTOGRAPHER_MERGE_NOTES.md` from the separate research chat (newspaper-scan batch + USGS Landslide Inventories v3.0 six-county pull). Register: **24 new Events** (IDs 308–325, 327–332; **307 and 326 retired as duplicates** of live rows 293 Haverstraw 1906 and 287 Clarksville diving death — merged as enrichment, IDs left as gaps), 5 existing rows enriched (293, 287, 294 Delaware Ave [SBA declaration + May 16 vs 17-19 date discrepancy flagged], 141 Knox 1975 [Nardacci corroboration], 298 Normanside [USGS catalog coord]), 4 Subsidence & Karst features (all Coordinates Needed), 7 Sources. Geology: **19 new pins** — 5 newspaper sites, 5 dated USGS/NASA slides, Whiteface (Display=No, out-of-core), and **8 undated USGS debris-flow compilation points set to Display=No at merge** (unverified; flip on once vetted or style-separated). 7 existing pins enriched from Nardacci columns (Knox, Onesquethaw, Clarksville, New Skull, Old Skull, Barney St [USGS coord ~330 m off, left as-is], Delaware Ave [date flag]). Folklore: H-732 Ithaca 1903 train slide (Display=No), H-733 Becker store cellar sinkhole (Display=Yes); H-720 enriched. Row 325 (Blue Cross / Rte 85 slide) has **no date** — formulas IFERROR-wrapped on that row only; excluded from phenology until dated. Build: 5,897 records (5,494 mappable), Geology 56 visible, phenology_history 404. Pre-merge masters kept at `data.bak-pre-v826/` (not shipped). Still open from the notes: D-1/D-2 coordinate hunts, D-3 Blue Cross date, D-4 Richmondville Oct-vs-Dec 1893 scan, D-5 The Glen ice jam vs CRREL sheet, D-6 Bozenkill tag, D-8 Milton own pin?, D-9 La Grange own pin?; D-10 resolved (1899 outbreak already row 86).
- **v825 (2026-09-21): Keene Valley row (ID 305) enriched a third time** with a June 2011 mid-story TU article — names the second family, the Macholds of Princeton NJ, whose home and 4.1-acre property were a total, uninsured loss; adds the Marlatts' I-beam stabilization and insurance-denial detail. Geology pin's notes updated to match.

- **v824 (2026-09-21): Normanside row (ID 298) enriched a fifth time** — the Apr 23 2015 Clukey report on downstream flooding fear at the Szydlowski home (37 Normanside Drive, later plaintiffs), confirming the slide's timing (Sun night-Mon morning, Apr 19-20) and continued active erosion days on. Sixth article now merged into this single event row.

- **v823 (2026-09-21): Normanside row (ID 298) enriched a fourth time** with the Apr 23 2015 cost/response report — emergency-response costs (hundreds of thousands, pumps + Connecticut-trucked pipe), Albany's reimbursement demand vs. Bethlehem's 'no deep municipal pockets,' no FEMA eligibility (no home damage, fell short of the $27.3M threshold, and NY has no municipal cleanup reimbursement program), and the US Army Corps of Engineers' Clean Water Act oversight role. Fifth article merged into this one event row.

- **v822 (2026-09-21): Keene Valley row (ID 305) enriched** with the original May 28 2011 TU report (Nearing) — the earliest coverage, naming the 9-12in rain trigger, the early-stage numbers (moving ~2 in/day, ~20 ft traveled so far), the Johns Brook/Mount Marcy trailhead proximity, and a noted discrepancy: this article describes the ground as sand/glacial till, while the 2012 follow-up (same geologist) frames it as glacial Lake Chapel lakebed sediment — flagged in the notes rather than silently reconciled.

- **v821 (2026-09-21): Normanside row (ID 298) enriched a third time** with the week-after immediate-aftermath report (Apr 28 2015) — both golf courses reopened within a week, but Normanside's restaurant/banquet room/maintenance shed stayed closed pending a club-hired geotechnical engineer's report; DEC opened its own investigation. Third article merged into this event row.

- **v820 (2026-09-21): the definitive 2015 Normanside investigative piece merged in**, plus a new 1982 lead. Row 298 (2015 Normanside slide) upgraded to day-precision (overnight Apr 19-20 2015) with the full permit/dumping timeline — illegal dumping traced to an Albany developer's project, named officials at each step, the town's failure to require a geotechnical study, and a decades-old pamphlet warning the area was "slippage-prone." New row (ID 306): a 1982 slide behind Del Lanes Bowling Alley, confidence C, year-only, no pin (location unverified — not guessed). Six documented Normans Kill slides now in the register: 1968, 1982, 2000, 2012, 2015, 2021, plus the 2025/2026 Hoffman Car Wash episode.

- **v819 (2026-09-21): Keene Valley/Porter Mountain landslide added** — New York's largest documented modern landslide, from a July 2012 Times Union article Laurie pasted in. New Events row (ID 305) — May 6, 2011, 82 acres of Porter Mountain slid on saturated glacial Lake Chapel sediments (Adirondacks, Essex Co., OUT OF CORE FOOTPRINT); a home was lifted and moved 50 ft at $300K cost, another demolished, homeowners' insurance excluded landslides entirely. Direct tie to Dr. Andrew Kozlowski (already in the atlas directory), who led the site's ongoing monitoring — his directory entry cross-referenced. Matching Geology-layer pin added, approximate at Adrians Acres Rd. Different mechanism/region from the Hudson Valley clay-slide cluster (Glacial Lake Chapel vs. Glacial Lake Albany).

- **v818 (2026-09-21): Waterford row (ID 302) enriched a fourth time** — a May 9 2020 TU staff report: 10-12 people displaced total, two families cleared to return home for Mother's Day after no further land movement, one more deck lost when it collapsed into the pit afterward. Fifth article now merged into this single event row.

- **v817 (2026-09-21): logged, not ingested — a USGS national landslide dataset.** Laurie uploaded the FGDC metadata record for "Landslide Inventories across the United States v3" (5,687 records nationwide, 131 source inventories, DOI 10.5066/P14AJF8I). The upload was metadata only — no actual points/coordinates were in the file, and this session couldn't reach sciencebase.gov/ArcGIS services to query it live (network restrictions + can't construct un-visited query URLs). Logged as a new Sources row with the exact next steps: upload the real US_Landslide_v3_csv (from the ScienceBase item), or a working pre-built ArcGIS REST query URL for the Hilltowns/Capital Region bbox, and this session can parse it directly. No new Events rows added from this file — nothing fabricated.

- **v815 (2026-09-21): 2015 Normanside Country Club event upgraded, plus a new 1968 lead.** A 2018 TU article on the lawsuit appeal filled the gap flagged when row 298 (2015 Normanside slide) was first added — confidence B→A, dated to April 2015, full cause/cost/lawsuit detail (town-approved fill permit, 120,000 cu yd, ~$250K emergency channel, $1.4-7.8M DOT long-term estimate, 3 lawsuits). Also surfaced a **1968 Mahar Road landslide** (new row, confidence C, year-only) — the oldest documented Normans Kill slide now in the register. Its Geology pin has NO coordinates (Mahar Rd couldn't be geocoded this pass) — directory-only, Anchor Type none, flagged for a real location later rather than guessed.

- **v814 (2026-09-21): Waterford row (ID 302) enriched a third time** with the April 2021 TU follow-up (Liberatore) — the Murphys' year-later fight with the town: a \$1,500 vacant-building fine on the town-ordered-evacuated house, a tree-tacked 60-day fence notice, a plow-damaged gate, unpaid taxes on now-unusable land, and their rejection of the rain-cause finding. Fourth article merged into this one event row.

- **v812 (2026-09-21): Hoffman Car Wash outcome resolved.** The Oct 2025 precautionary closure (row ID 295) was left with an open outcome; an Aug 3 2026 Times Union article confirms it's permanent — CEO Tom Hoffman Jr. says shoring up the site was cost-unfeasible, company seeking a new Bethlehem location. Merged into the existing row, event name updated to reflect the resolution, Geology pin's notes updated to match. Recent regional rain explicitly did NOT factor into the decision per Hoffman.

- **v811 (2026-09-21): Waterford row (ID 302) enriched again** with the July 2020 TU follow-up — Gifford Engineering's causal report (rain-driven water-table rise, 12% above-normal rainfall, ~50ft/17ac failure zone), the homeowner's disputed downspout-pipe theory, the cleanup/regrading at 3 Middletown Rd, and the town's liability stance. Third article merged into this one event row rather than a third pin.

- **v810 (2026-09-21): the Waterford landslide row (ID 302) enriched, not duplicated.** Laurie pasted the original day-1 Times Union report (Massarah Mikati, May 4 2020) after the May 7 follow-up was already in. Recognized as the same event and merged in the new detail: exact time (~3pm Sunday), the 75-ft cliff left behind, 7 homes initially evacuated down to 4, Fire Chief Don Baldwin, the Waterford Canal Harbor overlook.

- **v809 (2026-09-21): Waterford landslide added**, Weaver Ave/Middletown Rd (Saratoga Co.), from a May 2020 Times Union article Laurie pasted in. New Events row (ID 302) — a slow-moving, multi-day active slide starting May 3 2020, ~150 ft hillside drop into a pond, still worsening as of the May 7 update (5 more ft of soil lost). Fifth distinct Hudson Valley slide-corridor event added this session. Matching Geology-layer pin near the Mohawk-Hudson confluence, north of the Troy/Mount Ida cluster.

- **v808 (2026-09-21): Spring Avenue (Troy) landslide added**, from a March 2024 Times Union article Laurie pasted in. New Events row (ID 301) — March 11 2024, slide took out utility poles and trees on a Troy shortcut street, closed for repairs with no firm timetable. Ties directly to the already-pinned Mount Ida Delta (Glacial Lake Albany) — same delta-city as the historic 1837/1859 Troy slides; that Geology pin's notes updated rather than a new pin added, since it's the same site. Fourth Hudson Valley slide-corridor event added this session (with Bethlehem/Normans Kill, Catskill/Cauterskill Rd, Castleton-on-Hudson/Mann Dr).

- **v807 (2026-09-21): Mann Drive landslide added**, Castleton-on-Hudson (Rensselaer Co.), from a May 2025 Times Union article Laurie pasted in. New Events row (ID 300) — May 10 2025, home sank 3+ ft after a week of heavy rain, foundation washed out, road collapsed, 2 neighboring properties affected, 9 residents got Red Cross aid. A third distinct Hudson Valley slide corridor now in the register (with Bethlehem/Normans Kill and Catskill/Cauterskill Rd) — genuinely regional pattern, not one recurring site. Matching Geology-layer pin added, approximate at street level.

- **v806 (2026-09-21): Cauterskill Road landslide added**, Catskill Creek valley (Catskill, Greene Co.), from a May 2024 Times Union article Laurie pasted in. New Events row (ID 299) — May 7 2024, heavy rain undermined a home's foundation soil at 5525 Cauterskill Rd; family got out unharmed, house condemned but left standing. Kept explicitly separate from the Normans Kill/Bethlehem cluster (different creek, mechanism not confirmed as the same Lake-Albany-clay process) — flagged for a bedrock/surficial-mapping follow-up before asserting that link. Matching Geology-layer pin added at the exact address, same Catskill Creek corridor as the Freehold ice-age alluvial fan already in that layer.

- **v805 (2026-09-21): two more Normans Kill clay-slide events**, from a 2021 Times Union article Laurie pasted in. New Events rows: Groesbeck Place, Delmar (May 2021, ID 297) — 20+ ft drop across ~300 ft behind two 1950s homes, prompted Bethlehem's steep-slope building rule — and the previously-unsourced 2015 Normanside Country Club slide (ID 298, confidence B, dated to the year only pending the original 2015 reporting), which fills the exact gap flagged in the 2000 Delaware Ave row's notes. Matching Geology-layer pin added for Groesbeck Place (approximate, street-level); Hoffman Car Wash pin's notes not further changed. Three confirmed Normans Kill slides now in one hazard thread: 2000, 2015, 2021, plus the 2025 Hoffman Car Wash precautionary closure.

- **v803 (2026-09-21): Scarborough Hudson Line mudslide added**, from an Oct 2023 news article Laurie pasted in. New Events row (ID 296) — Oct 21-23 2023, a mudslide near the Scarborough Metro-North station (Briarcliff Manor, Westchester Co.) buried all four Hudson Line tracks (350 cu yd soil/debris + 250 cu yd rock/wall), suspending Metro-North and Amtrak's entire Albany-NYC service. OUT OF CORE FOOTPRINT (~90+ mi S), included per the Haverstraw precedent as another case of the Hudson-corridor rail/slope-failure hazard the register already flags as a Ways Atlas cross-link (Staatsburg 1903 etc.) — a mudslide/debris-flow mechanism, distinct from the Lake-Albany-clay rotational slumps at Bethlehem/Mount Ida/Haverstraw. No Geology-layer pin added (out of that layer's footprint, same as Haverstraw).

- **v802 (2026-09-21): 2025 follow-on at the same Bethlehem/Delaware Ave site.** New Events row (ID 295) — Oct 13, 2025, Hoffman Car Wash + Jiffy Lube in Delmar closed precautionary ahead of a nor'easter after a 23-ft-deep parking-lot crack gave a 1.0 (unstable) geotechnical slope rating, 25 years and a week after the 2000 slide at the same spot. No confirmed collapse as of the source — outcome is open, flagged for a follow-up if one surfaces. Geology-layer pin's notes updated to carry both events.

- **v801 (2026-09-21): Bethlehem (Delaware Ave) landslide added**, from a Times Union 25th-anniversary retrospective Laurie pasted in. New Events row (ID 294) in `data/climate_events.xlsx` — May 17-19, 2000, 400 ft of hillside into the Normans Kill behind Hoffman's Car Wash, Delaware Ave severed, $25M+ repair; grade A (contemporaneous news + a dedicated 25-years-later retrospective). Matching Geology-layer pin at Hoffman Car Wash, 55 Delaware Ave, Delmar — same Glacial Lake Albany clay-slide thread as the Hyde Park and Mount Ida deltas already there.

- **v795 (2026-09-21), two new tag-driven glow/fade rules on the atlas map, per Laurie:**
  - **"Event Venue" tag** — a place with no standing hours that exists to host events (Locust Grove, Blackthorne Resort). Now fades like closed whenever nothing is actually booked there today, and glows only while a matching event's own window is live. Matched to its events by near-exact shared coordinates.
  - **"Fade When Closed" tag** — applied to all 12 Post Office rows. A place with real but narrow hours (e.g. 9am-12:30pm; 2pm-4:30pm) now fades the instant it's outside that window, instead of staying lit all day just because today isn't marked fully Closed. Extend to other narrow-hours businesses by adding the same tag.

- **v793-794 (2026-09-21): first "far-flung" pins, per Laurie** — places outside the Hilltowns region she plans to add occasionally for fun, no special tagging (Laurie declined the "Easter Egg" tag in v794 — plain regional tags only, same as everywhere else). This round: Veselka + Ippudo NY (East Village, NYC), Zelda's Original Gourmet Pizza (Sacramento), London Bridge Pub (Monterey), Trish's Mini Donuts (Pier 39, SF).

- **v791 (2026-09-21), Laurie: no victim names on the site.** Anonymized the three Irene fatality rows in `data/climate_events.xlsx` (Events 265-267) — kept as hazard records (age, mechanism, location, date) with names stripped from the title and key-measurement fields; also stripped a name that had leaked into the Onesquethaw Cave Geology-layer tag. Same three names redacted from the research staging notes (`hilltowns_extractions_all.md`) for consistency. Non-fatality-tagged historical names (e.g. Murderer's Creek's 1813 Sally Hamilton, a 200-year-old named legend) were left alone — different in kind from a modern person's death record.
- **Thompsons Lake State Campground and Phoenicia Black Bear Campground fully excluded from Explore Nearby** (moved from demote-only to `NEARBY_EXCLUDE` in `calendar.html`), per Laurie.

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

Latest drop-in: **events_73**. Schema carries 4 recurrence columns after `Agenda`:
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

Version at handoff: **v868**. Next chat continues from v869.

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
