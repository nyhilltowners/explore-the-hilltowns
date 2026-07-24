# Explore These Hills — Catskill & Beyond

An interactive folklore atlas. The map is built automatically from the
spreadsheets in `data/` every time you push a change — no coding required.

## One-time setup (about 5 minutes)

1. Create a new GitHub repository (public), e.g. `folklore-atlas`.
2. Upload everything in this folder to it (drag-and-drop onto the repo page
   works; keep the folder structure, including the hidden `.github` folder —
   if drag-and-drop skips it, use "Add file → Upload files" inside a
   `.github/workflows` folder you create, and upload `build.yml` there).
3. In the repo: **Settings → Pages → Source → GitHub Actions**.
4. Go to the **Actions** tab, open "Build & deploy atlas", press **Run workflow**.
5. When it finishes green, your site is live at the URL shown in the run
   (typically `https://<your-username>.github.io/<repo-name>/`).

## Updating the atlas (the everyday ritual)

1. Edit your workbook locally (Excel, Numbers, LibreOffice — anything that
   saves `.xlsx`).
2. On GitHub, open the `data/` folder → click the workbook → the pencil/upload
   won't work for binary files, so instead: `data/` folder → **Add file →
   Upload files** → drop the new workbook (same filename) → **Commit changes**.
3. Wait ~1–2 minutes. Done.

The build **validates before publishing**. If a workbook has a problem
(bad coordinate, missing required field, end date before start date), the
run fails with a red ✕, the Actions log tells you exactly which file, row,
and column to fix — and the live site keeps serving the last good version
untouched.

## The three workbooks

Only the **first sheet** of each workbook is read. Use other sheets freely
for notes; each template ships with an EXAMPLE sheet for reference.
`ID` columns are for your reference and are never displayed. `Notes`
columns are never published at all.

**`data/folklore_legends.xlsx`** — your existing catalog, unchanged.
Rows without coordinates appear in the "Unplaced" list.

**`data/points_of_interest.xlsx`** — requires Name, Latitude, Longitude.
Optional: Tags, Address, Description, per-day hours (Monday…Sunday columns),
Website, Phone, Glyph. The Glyph column takes a single character shown as a
white mark on a purple disc (blank = ●).

**`data/events.xlsx`** — requires Event Name, Latitude, Longitude, Start Date.
Optional: End Date, Venue, Address, Description, Time, Website, Glyph
(white on teal; blank = ✦). Dates as `YYYY-MM-DD` or `MM/DD/YYYY`.
**Events disappear from the map automatically the day after they end**
(midnight Eastern) — computed in the visitor's browser, so no re-upload is
needed. Past events stay in your spreadsheet as a record; they're simply
never displayed.

## Images

Every workbook now has **Image** and **Image Credit** columns. The Image
column accepts three forms:

1. **A Wikimedia Commons page URL** — just paste the page you're looking at
   (`https://commons.wikimedia.org/wiki/File:Something.jpg`). The build
   converts it to a stable image URL automatically. This is the best option.
2. **Any direct image URL** (`https://...something.jpg`). Avoid Google
   Business / googleusercontent links — they expire; the build will warn you.
3. **A file in this repo**: drop the image into the `images/` folder and
   write `images/filename.jpg` in the column. Most permanent option.

Images appear as a banner across the top of the map popup (scaled and
cropped to fit) and larger in the full entry, with the Image Credit shown
beneath. Most Commons images are Creative Commons licensed and *require*
attribution — put the author/license in Image Credit (the file page on
Commons shows the exact wording to use). A broken or dead image URL simply
doesn't display; it never breaks the popup.

## Adding a whole new category later

Add a workbook to `data/`, then add an entry to `manifest.json` pointing at
it with one of the existing schemas (`folklore`, `poi`, `events`). A new
checkbox appears automatically. A genuinely new *kind* of data (new columns,
new popup layout) needs a new schema in `build/build.py` and
`index.template.html` — ask your favorite AI assistant to add one.

## Local preview (optional)

With Python installed: `pip install openpyxl`, then `python build/build.py`,
then open `site/index.html` in a browser.
