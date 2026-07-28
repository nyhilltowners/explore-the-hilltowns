#!/usr/bin/env python3
"""Atlas build: reads manifest.json, parses each category workbook by its schema,
validates rigorously, and writes site/index.html + site/data.js.

Exit code 1 on any validation failure => GitHub Actions keeps the last good site live.
Only the FIRST sheet of each workbook is read; other sheets are yours for notes/examples.
Hidden-by-policy fields (IDs shown never, Notes shipped never) are enforced here.
"""
import datetime
import html as html_mod
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

FAILS: list[str] = []
WARNS: list[str] = []


def fail(msg: str) -> None:
    FAILS.append(msg)


def warn(msg: str) -> None:
    WARNS.append(msg)


def s(v) -> str:
    return "" if v is None else str(v).strip()


def map_headers(header_row, spec, where):
    """spec: list of (key, regex, required). Returns {key: column_index}."""
    idx = {}
    hdrs = [s(h) for h in header_row]
    for key, rx, required in spec:
        for i, h in enumerate(hdrs):
            if h and re.search(rx, h, re.I):
                idx[key] = i
                break
        else:
            if required:
                fail(f"{where}: required column matching /{rx}/ not found "
                     f"(headers seen: {', '.join(h for h in hdrs if h) or 'none'})")
    return idx


def cell(row, idx, key):
    i = idx.get(key)
    if i is None or i >= len(row):
        return ""
    v = row[i]
    return "" if v is None else v


def coord(v, lo, hi, what, where, required):
    if s(v) == "":
        if required:
            fail(f"{where}: {what} is required")
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        fail(f"{where}: {what} '{v}' is not a number")
        return None
    if not (lo <= f <= hi):
        fail(f"{where}: {what} {f} is outside [{lo}, {hi}]")
        return None
    return round(f, 6)


DATE_FMTS = ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y", "%d %B %Y")


def parse_date(v, what, where, required):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    t = s(v)
    if t == "":
        if required:
            fail(f"{where}: {what} is required")
        return None
    for fmt in DATE_FMTS:
        try:
            return datetime.datetime.strptime(t, fmt).date().isoformat()
        except ValueError:
            pass
    fail(f"{where}: {what} '{t}' is not a recognizable date (use YYYY-MM-DD or MM/DD/YYYY)")
    return None


OG_RXS = [
    re.compile(r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]*content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']og:image(?::secure_url)?["\']', re.I),
    re.compile(r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]*content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*name=["\']twitter:image(?::src)?["\']', re.I),
]
_og_cache: dict = {}


def fetch_site_image(url, where):
    """Fetch a site's Open Graph / Twitter preview image. Warnings only."""
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    if url in _og_cache:
        return _og_cache[url]
    img = ""
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; AtlasBuild/1.0)"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            page = resp.read(300_000).decode("utf-8", errors="ignore")
            final_url = resp.geturl()
        for rx in OG_RXS:
            m = rx.search(page)
            if m:
                img = urljoin(final_url, html_mod.unescape(m.group(1).strip()))
                break
        if not img:
            warn(f"{where}: no preview image published by {url} — pin will have no photo "
                 f"(you can set one explicitly in the Image column)")
    except Exception as e:
        warn(f"{where}: couldn't reach {url} for a preview image "
             f"({e.__class__.__name__}) — pin will have no photo this build")
    _og_cache[url] = img
    return img


WIKI_FILE_RX = re.compile(
    r"https?://(?:commons|en|www)\.(?:wikimedia|wikipedia)\.org/wiki/File:(.+)$", re.I)


def norm_image(u, where):
    """Accepts: direct URL, a Commons/Wikipedia File: page URL (auto-converted
    to a stable thumbnail URL), or a repo-relative path like images/foo.jpg."""
    u = s(u)
    if not u:
        return ""
    m = WIKI_FILE_RX.match(u)
    if m:
        return ("https://commons.wikimedia.org/wiki/Special:FilePath/"
                + m.group(1) + "?width=800")
    if re.match(r"^https?://", u, re.I):
        if "googleusercontent.com" in u:
            warn(f"{where}: Image is a googleusercontent.com link — these expire "
                 f"without notice; consider saving the file into images/ instead")
        return u
    # repo-relative path
    rel = u.lstrip("./")
    if not (ROOT / rel).exists():
        warn(f"{where}: Image '{u}' is not a URL and no file exists at {rel} — "
             f"it will render blank")
    return rel


def read_rows(path: Path, where: str, sheet=None):
    wb = load_workbook(path, read_only=True, data_only=True)
    if sheet:
        if sheet not in wb.sheetnames:
            fail(f"{where}: no sheet named '{sheet}' "
                 f"(found: {', '.join(wb.sheetnames)})")
            wb.close()
            return [], []
        ws = wb[sheet]
    else:
        ws = wb[wb.sheetnames[0]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    if not rows:
        fail(f"{where}: first sheet is empty")
        return [], []
    return rows[0], rows[1:]


def check_dupe_ids(recs, where):
    seen = {}
    for r in recs:
        rid = r.get("id", "")
        if rid:
            if rid in seen:
                warn(f"{where}: duplicate ID '{rid}' (rows keep working; consider fixing)")
            seen[rid] = True


# ---------------- folklore ----------------

FOLK_SPEC = [
    ("id", r"locked\s*id|^id$", False),
    ("t", r"short\s*title", True),
    ("b", r"tale.*being", False),
    ("n", r"nation|people", False),
    ("p", r"general\s*location", False),
    ("lat", r"^lat", True),
    ("lng", r"^lon|^lng", True),
    ("c", r"certainty", False),
    ("stry", r"story\s*summary|^summary$", False),
    ("tf", r"timeframe", False),
    ("rb", r"recorded\s*by", False),
    ("yr", r"year\s*recorded", False),
    ("pub", r"original\s*publication|publication", False),
    ("src", r"source\s*book|source\s*file", False),
    ("pg", r"page", False),
    ("img", r"^image(\s*url)?$|^photo", False),
    ("cred", r"image\s*credit|^credit$|attribution", False),
    ("web", r"^website$|^url$|^link$", False),
    ("disp", r"^display$|^show$|^visible$", False),
]


def tier_of(cert: str, has_xy: bool) -> str:
    c = cert.lower().strip()
    if not has_xy:
        return "none"
    if c.startswith("fairly"):
        return "fair"
    if c.startswith("precise"):
        return "precise"
    if c.startswith("approx") or c.startswith("two specific"):
        return "approx"
    return "unver"


def parse_folklore(path: Path, label: str, sheet=None):
    where = path.name + (f" [{sheet}]" if sheet else "")
    hdr, rows = read_rows(path, where, sheet)
    idx = map_headers(hdr, FOLK_SPEC, where)
    out = []
    for n, row in enumerate(rows, start=2):
        rid, title = s(cell(row, idx, "id")), s(cell(row, idx, "t"))
        if not rid and not title:
            continue
        if s(cell(row, idx, "disp")).lower() in ("no", "n", "false", "0", "hide", "hidden"):
            continue  # curated out via the Display column
        rw = f"{where} row {n}"
        lat = coord(cell(row, idx, "lat"), -90, 90, "Latitude", rw, required=False)
        lng = coord(cell(row, idx, "lng"), -180, 180, "Longitude", rw, required=False)
        if (lat is None) != (lng is None):
            fail(f"{rw}: has one coordinate but not the other")
        rec = {
            "ty": "folklore", "cat": label, "id": rid,
            "t": title or "(untitled)",
            "b": s(cell(row, idx, "b")), "n": s(cell(row, idx, "n")),
            "p": s(cell(row, idx, "p")),
            "lat": lat, "lng": lng,
            "c": s(cell(row, idx, "c")), "s": s(cell(row, idx, "stry")),
            "tf": s(cell(row, idx, "tf")), "rb": s(cell(row, idx, "rb")),
            "yr": s(cell(row, idx, "yr")), "pub": s(cell(row, idx, "pub")),
            "src": s(cell(row, idx, "src")), "pg": s(cell(row, idx, "pg")),
            "img": norm_image(cell(row, idx, "img"), rw),
            "cred": s(cell(row, idx, "cred")),
            "web": s(cell(row, idx, "web")),
        }
        # column-drift dedupe, mirrored from the interactive versions
        if rec["b"] and rec["b"] == rec["s"]:
            rec["b"] = ""
        if rec["s"] and rec["s"] == rec["tf"] and rec["b"]:
            rec["s"], rec["b"] = rec["b"], ""
        rec["tier"] = tier_of(rec["c"], lat is not None and lng is not None)
        out.append(rec)
    check_dupe_ids(out, where)
    if not out:
        warn(f"{where}: no data rows found")
    return out


# ---------------- points of interest ----------------

POI_SPEC = [
    ("id", r"^id$|locked\s*id", False),
    ("t", r"^name$", True),
    ("tags", r"tags?|categor|type", False),
    ("addr", r"address", False),
    ("lat", r"^lat", True),
    ("lng", r"^lon|^lng", True),
    ("stry", r"description", False),
    ("mon", r"^mon", False), ("tue", r"^tue", False), ("wed", r"^wed", False),
    ("thu", r"^thu", False), ("fri", r"^fri", False), ("sat", r"^sat", False),
    ("sun", r"^sun", False),
    ("web", r"website|^url$", False),
    ("ph", r"phone", False),
    ("g", r"glyph|icon|symbol", False),
    ("img", r"^image(\s*url)?$|^photo", False),
    ("cred", r"image\s*credit|^credit$|attribution", False),
    ("disp", r"^display$|^show$|^visible$", False),
]


def name_v_or_title(t):
    return t or "(unnamed)"


def parse_poi(path: Path, label: str, sheet=None):
    where = path.name + (f" [{sheet}]" if sheet else "")
    hdr, rows = read_rows(path, where, sheet)
    idx = map_headers(hdr, POI_SPEC, where)
    out = []
    for n, row in enumerate(rows, start=2):
        title = s(cell(row, idx, "t"))
        rid = s(cell(row, idx, "id"))
        if not rid and not title:
            continue
        rw = f"{where} row {n}"
        disp = s(cell(row, idx, "disp")).lower()
        if disp in ("no", "n", "false", "0", "hide", "hidden"):
            continue  # curated out via the Display column
        if not title:
            fail(f"{rw}: Name is required")
        lat = coord(cell(row, idx, "lat"), -90, 90, "Latitude", rw, required=False)
        lng = coord(cell(row, idx, "lng"), -180, 180, "Longitude", rw, required=False)
        if lat is None or lng is None:
            # not yet locatable — keep it in the catalog list, just off the map
            warn(f"{rw}: {name_v_or_title(title)} has no coordinates yet — "
                 f"listed but not mapped")
        web = s(cell(row, idx, "web"))
        if web and not re.match(r"^(https?://)?[\w.-]+\.[a-z]{2,}", web, re.I):
            warn(f"{rw}: Website '{web}' doesn't look like a URL")
        hrs = {d: s(cell(row, idx, d)) for d in
               ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
        # markers (the base "Points of Interest" layer) don't have hours by design
        raw_tags = s(cell(row, idx, "tags"))
        tags = [x.strip() for x in re.split(r"[;,]", raw_tags) if x.strip()]
        out.append({
            "ty": "poi", "cat": label, "id": rid, "t": title or "(unnamed)",
            "tags": tags, "addr": s(cell(row, idx, "addr")),
            "lat": lat, "lng": lng, "s": s(cell(row, idx, "stry")),
            "hrs": hrs, "web": web, "ph": s(cell(row, idx, "ph")),
            "g": s(cell(row, idx, "g")),
            "tier": "exact" if (lat is not None and lng is not None) else "none",
            "img": norm_image(cell(row, idx, "img"), rw),
            "cred": s(cell(row, idx, "cred")),
        })
        if not out[-1]["img"] and web and label != "Points of Interest":
            out[-1]["img"] = fetch_site_image(web, rw)
    check_dupe_ids(out, where)
    return out


# ---------------- events ----------------

_WD = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
_ORD = {"1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "last": 0}


def _next_weekday(frm, wd):
    """First date >= frm falling on weekday wd (0=Mon..6=Sun)."""
    delta = (wd - frm.weekday()) % 7
    return frm + datetime.timedelta(days=delta)


def _nth_weekday_of_month(year, month, wd, nth):
    """The nth (1..5, or 0='last') weekday wd in a given month, or None."""
    first = datetime.date(year, month, 1)
    first_wd = _next_weekday(first, wd)
    if nth == 0:  # last occurrence
        d = first_wd
        while (d + datetime.timedelta(days=7)).month == month:
            d += datetime.timedelta(days=7)
        return d
    d = first_wd + datetime.timedelta(days=7 * (nth - 1))
    return d if d.month == month else None


def next_occurrence(notes, start, end, today):
    """Given a 'Recurring — …' Notes string, return the soonest date >= today
    that the event actually happens (respecting its start/end bounds), or None
    if the notes carry no parseable recurrence. Handles:
      'every week: Thursday'            (one or many days)
      '2nd week: Tuesday'               (nth weekday of month)
      '1st week of month: Wednesday; 3rd week: Wednesday'  (compound)
    Dates are ISO strings; today/start/end are ISO strings or ''.
    """
    m = re.search(r"Recurring\s*[\u2014-]\s*([^|]+)", notes or "")
    if not m:
        return None
    frag = m.group(1).strip()

    def iso2d(x):
        try:
            return datetime.date.fromisoformat(x[:10])
        except Exception:
            return None

    tdy = iso2d(today)
    st = iso2d(start) if start else None
    en = iso2d(end) if end else None
    lo = max(st, tdy) if st else tdy
    if lo is None:
        return None

    def within(d):
        return d is not None and d >= lo and (en is None or d <= en)

    cands = []

    wk = re.search(r"every week\s*:\s*(.+)", frag, re.I)
    if wk:
        for name in re.findall(r"Mon|Tue|Wed|Thu|Fri|Sat|Sun", wk.group(1)):
            d = _next_weekday(lo, _WD[name.lower()])
            if within(d):
                cands.append(d)

    for seg in re.split(r";", frag):
        mm = re.search(r"(1st|2nd|3rd|4th|5th|last)\s*week(?:\s*of\s*month)?\s*:\s*"
                       r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)", seg, re.I)
        if not mm:
            continue
        nth = _ORD[mm.group(1).lower()]
        wd = _WD[mm.group(2).lower()]
        probe = datetime.date(lo.year, lo.month, 1)
        for _ in range(4):
            d = _nth_weekday_of_month(probe.year, probe.month, wd, nth)
            if within(d) and d >= lo:
                cands.append(d)
                break
            probe = (probe.replace(day=28) + datetime.timedelta(days=7)).replace(day=1)

    return min(cands).isoformat() if cands else None


EVT_SPEC = [
    ("id", r"^id$", False),
    ("t", r"event\s*name|^name$|^title", True),
    ("ven", r"venue|location\s*name", False),
    ("addr", r"address", False),
    ("lat", r"^lat", True),
    ("lng", r"^lon|^lng", True),
    ("stry", r"description", False),
    ("d1", r"start\s*date|^date$", True),
    ("d2", r"end\s*date", False),
    ("tm", r"^time", False),
    ("web", r"website|^url$", False),
    ("g", r"glyph|icon|symbol", False),
    ("img", r"^image(\s*url)?$|^photo", False),
    ("cred", r"image\s*credit|^credit$|attribution", False),
    ("notes", r"^notes?$", False),
    ("disp", r"^display$|^show$|^visible$", False),
]


def parse_events(path: Path, label: str, sheet=None):
    where = path.name + (f" [{sheet}]" if sheet else "")
    hdr, rows = read_rows(path, where, sheet)
    idx = map_headers(hdr, EVT_SPEC, where)
    today = datetime.date.today().isoformat()
    out = []
    skipped_past = [0]
    for n, row in enumerate(rows, start=2):
        title = s(cell(row, idx, "t"))
        rid = s(cell(row, idx, "id"))
        if not rid and not title:
            continue
        rw = f"{where} row {n}"
        if s(cell(row, idx, "disp")).lower() in ("no", "n", "false", "0", "hide", "hidden"):
            continue  # curated out via the Display column (blank = shown)
        if not title:
            fail(f"{rw}: Event Name is required")
        ven_txt = s(cell(row, idx, "ven")).lower()
        addr_txt = s(cell(row, idx, "addr")).lower()
        is_online = bool(re.search(r"\bonline\b|\bvirtual\b|\bzoom\b|\blivestream\b",
                                   ven_txt + " " + addr_txt))
        lat = coord(cell(row, idx, "lat"), -90, 90, "Latitude", rw,
                    required=False)
        lng = coord(cell(row, idx, "lng"), -180, 180, "Longitude", rw,
                    required=False)
        if not is_online and (lat is None or lng is None):
            # upcoming but not yet locatable: keep it in the listings, off the map
            warn(f"{rw}: {title} has no coordinates yet — listed but not mapped")
        d1 = parse_date(cell(row, idx, "d1"), "Start Date", rw, required=True)
        d2 = parse_date(cell(row, idx, "d2"), "End Date", rw, required=False)
        if d1 and d2 and d2 < d1:
            fail(f"{rw}: End Date {d2} is before Start Date {d1}")
        notes = s(cell(row, idx, "notes"))
        nocc = next_occurrence(notes, d1, d2, today)  # ISO string or None
        end = d2 or d1
        if end and end < today and not nocc:
            skipped_past[0] += 1
            continue  # non-recurring past events are dropped from the build
        if nocc and end and end < today:
            # a recurring series whose bare End Date is stale but still recurs:
            # its real horizon is the next occurrence, so it stays in.
            pass
        out.append({
            "ty": "events", "cat": label, "id": rid, "t": title or "(unnamed)",
            "ven": s(cell(row, idx, "ven")), "addr": s(cell(row, idx, "addr")),
            "lat": lat, "lng": lng, "s": s(cell(row, idx, "stry")),
            "d1": d1, "d2": d2 or "", "tm": s(cell(row, idx, "tm")),
            "web": s(cell(row, idx, "web")), "g": s(cell(row, idx, "g")),
            "online": is_online, "nextOcc": nocc or "",
            "tier": "exact" if (lat is not None and lng is not None) else "none",
            "img": norm_image(cell(row, idx, "img"), rw),
            "cred": s(cell(row, idx, "cred")),
        })
        ev_web = s(cell(row, idx, "web"))
        if not out[-1]["img"] and ev_web:
            out[-1]["img"] = fetch_site_image(ev_web, rw)
    check_dupe_ids(out, where)
    if skipped_past[0]:
        print(f"    ({skipped_past[0]} past events skipped)")
    return out


PARSERS = {"folklore": parse_folklore, "poi": parse_poi, "events": parse_events}


def resolve_workbook(path: Path, label: str) -> Path:
    """Exact filename wins. Otherwise accept exactly one versioned variant
    (points_of_interest_v2.xlsx, points_of_interest (3).xlsx, etc.).
    Multiple candidates = ambiguous -> loud stop so the wrong data never ships."""
    variants = sorted(p for p in path.parent.glob(path.stem + "*" + path.suffix)
                      if p.name != path.name and not p.name.startswith("~$"))
    if path.exists():
        if variants:
            warn(f"{label}: using {path.name}, but versioned copies also exist "
                 f"({', '.join(v.name for v in variants)}) — delete extras or "
                 f"the wrong data may be published")
        return path
    if len(variants) == 1:
        warn(f"{label}: {path.name} not found; using {variants[0].name} instead")
        return variants[0]
    if len(variants) > 1:
        fail(f"{label}: {path.name} not found and multiple candidates exist "
             f"({', '.join(v.name for v in variants)}) — keep exactly one")
    return path


def main() -> int:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    all_records = []
    categories = []
    for cat in manifest["categories"]:
        label, schema = cat["label"], cat["schema"]
        wb_path = resolve_workbook(ROOT / cat["workbook"], label)
        categories.append({"key": cat["key"], "label": label, "schema": schema,
                           "color": cat.get("color", ""),
                           "default_on": cat.get("default_on", True),
                           "glyph": cat.get("glyph", "")})
        if schema not in PARSERS:
            fail(f"manifest: unknown schema '{schema}' for '{label}'")
            continue
        if not wb_path.exists():
            warn(f"manifest: workbook {cat['workbook']} not found — '{label}' will be empty")
            continue
        recs = PARSERS[schema](wb_path, label, cat.get("sheet"))
        dg = cat.get("glyph", "")
        if dg:
            for r in recs:
                if not r.get("g"):
                    r["g"] = dg
        all_records.extend(recs)
        print(f"  {label}: {len(recs)} records")

    print()
    for w in WARNS:
        print(f"WARNING: {w}")
    if FAILS:
        print()
        for f_ in FAILS:
            print(f"ERROR:   {f_}")
        print(f"\nBUILD FAILED — {len(FAILS)} error(s). "
              f"The live site keeps its last good version until these are fixed.")
        return 1

    SITE.mkdir(exist_ok=True)
    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc)
                     .strftime("%Y-%m-%d %H:%M UTC"),
        "categories": categories,
        "records": all_records,
    }
    js = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    js = js.replace("</", "<\\/")
    (SITE / "data.js").write_text("window.ATLAS_DATA = " + js + ";\n",
                                  encoding="utf-8")
    template = ROOT / "index.template.html"
    if not template.exists() and (ROOT / "index.html").exists():
        template = ROOT / "index.html"  # tolerate the template being renamed
    if not template.exists():
        print("ERROR: no index.template.html (or index.html) found at repo root")
        return 1
    shutil.copyfile(template, SITE / "index.html")
    if (ROOT / "images").exists():
        shutil.copytree(ROOT / "images", SITE / "images", dirs_exist_ok=True)
    if (ROOT / "fonts").exists():
        shutil.copytree(ROOT / "fonts", SITE / "fonts", dirs_exist_ok=True)
    mapped = sum(1 for r in all_records if r.get("lat") is not None)
    print(f"\nBUILD OK — {len(all_records)} records ({mapped} mappable), "
          f"{len(WARNS)} warning(s). Output in site/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
