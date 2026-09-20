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
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

# Line-buffered stdout so progress shows up live in GitHub Actions logs instead
# of all at once when the script exits (Python block-buffers when not a TTY).
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

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
# ---- Preview-image cache + parallel fetch ----------------------------------
# Every POI/event with a Website but no explicit Image gets an Open Graph
# thumbnail scraped from that site. ~2,200 serial fetches with an 8 s timeout is
# what made builds take 10–15 min (and far longer on a bad day). Now:
#   * results are cached in site/preview-cache.json, which GitHub Pages serves
#     along with the site, so the NEXT build seeds itself from the live copy
#     (PREVIEW_CACHE_URL) and only fetches sites it hasn't seen recently —
#     no workflow change needed for persistence;
#   * misses are fetched in parallel (PREVIEW_WORKERS threads, 6 s timeout);
#   * successes are re-checked every 30 days, failures every 7.
PREVIEW_CACHE_FILE = "preview-cache.json"
PREVIEW_CACHE_URL = "https://nyhilltowners.com/" + PREVIEW_CACHE_FILE
PREVIEW_WORKERS = 12
PREVIEW_TIMEOUT = 6
PREVIEW_TTL_OK_DAYS = 30
PREVIEW_TTL_FAIL_DAYS = 7
_PENDING = "\x00preview-pending:"        # placeholder written into records until resolve_previews() runs
_preview_cache: dict = {}
_preview_pending: dict = {}              # url -> first `where` that asked (for warnings)


# Hosts whose Open Graph preview is a generic platform/portal image rather than
# a picture of the place — never auto-fetch a thumbnail from these (Laurie,
# 2026-08-30). An explicit Image column value still wins as usual.
NO_PREVIEW_HOSTS = ("instagram.com", "greatnortherncatskills.com")


def preview_blocked(url):
    try:
        host = urlparse(url if re.match(r"^https?://", url, re.I) else "https://" + url).hostname or ""
    except Exception:
        return False
    host = host.lower()
    return any(host == h or host.endswith("." + h) for h in NO_PREVIEW_HOSTS)


def _cache_fresh(entry):
    try:
        age = (datetime.datetime.utcnow() - datetime.datetime.strptime(entry["t"], "%Y-%m-%d")).days
    except Exception:
        return False
    return age <= (PREVIEW_TTL_OK_DAYS if entry.get("img") else PREVIEW_TTL_FAIL_DAYS)


def load_preview_cache():
    """Local site/preview-cache.json if present (local rebuilds), else the live
    copy published with the last deploy, else start empty."""
    global _preview_cache
    local = SITE / PREVIEW_CACHE_FILE
    src = None
    try:
        if local.exists():
            _preview_cache = json.loads(local.read_text(encoding="utf-8"))
            src = "local"
        else:
            req = urllib.request.Request(PREVIEW_CACHE_URL,
                                         headers={"User-Agent": "Mozilla/5.0 (compatible; AtlasBuild/1.0)"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                _preview_cache = json.loads(resp.read().decode("utf-8"))
            src = "live site"
    except Exception as e:
        _preview_cache = {}
        print(f"  preview cache: none available ({e.__class__.__name__}) — fetching everything this build")
        return
    if not isinstance(_preview_cache, dict):
        _preview_cache = {}
    # Self-heal a poisoned cache: drop empty-image entries so those sites are
    # re-fetched. Empty entries were historically written for BOTH real "no image"
    # and transport failures; a no-network build could fill the cache with false
    # negatives that the fail-TTL then locked in. Re-fetching a genuinely-imageless
    # site is cheap; keeping a false negative hides a real photo. (2026-09-12)
    _dropped = [u for u, e in _preview_cache.items()
                if not (isinstance(e, dict) and e.get("img"))]
    for u in _dropped:
        del _preview_cache[u]
    if _dropped:
        print(f"  preview cache: dropped {len(_dropped)} empty entries to re-fetch")
    print(f"  preview cache: {len(_preview_cache)} entries loaded from {src}")


def fetch_site_image(url, where):
    """Return a cached preview image URL, or a placeholder that
    resolve_previews() fills in after all workbooks are parsed."""
    if preview_blocked(url):
        return ""
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    ent = _preview_cache.get(url)
    if ent and _cache_fresh(ent):
        return ent.get("img", "")
    _preview_pending.setdefault(url, where)
    return _PENDING + url


def _fetch_one(url):
    img, err = "", ""
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; AtlasBuild/1.0)"})
        with urllib.request.urlopen(req, timeout=PREVIEW_TIMEOUT) as resp:
            page = resp.read(300_000).decode("utf-8", errors="ignore")
            final_url = resp.geturl()
        for rx in OG_RXS:
            m = rx.search(page)
            if m:
                img = urljoin(final_url, html_mod.unescape(m.group(1).strip()))
                break
    except Exception as e:
        err = e.__class__.__name__
    return url, img, err


def resolve_previews(all_records):
    """Fetch every pending preview in parallel, fill the placeholders, and
    write the refreshed cache into site/ so the next build can reuse it."""
    urls = list(_preview_pending)
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    if urls:
        print(f"  previews: {len(urls)} site(s) to fetch ({PREVIEW_WORKERS} at a time, {PREVIEW_TIMEOUT}s timeout)")
        done = 0
        with ThreadPoolExecutor(max_workers=PREVIEW_WORKERS) as pool:
            for fut in as_completed([pool.submit(_fetch_one, u) for u in urls]):
                url, img, err = fut.result()
                where = _preview_pending[url]
                if err:
                    warn(f"{where}: couldn't reach {url} for a preview image ({err}) — no photo this build; retried next build")
                    # A transport failure (timeout/DNS/connection) is NOT evidence the
                    # site lacks an image — caching it would suppress re-fetching. Leave
                    # the URL uncached so the next build (with network) retries it.
                    # (2026-09-12: fixes a cache poisoned by a no-network build — every
                    # entry had img="" and the 7-day fail-TTL blocked all re-fetching.)
                    done += 1
                    if done % 100 == 0 or done == len(urls):
                        print(f"  previews: {done}/{len(urls)}")
                    continue
                elif not img:
                    warn(f"{where}: no preview image published by {url} — no photo (you can set one explicitly in the Image column)")
                _preview_cache[url] = {"img": img, "t": today}
                done += 1
                if done % 100 == 0 or done == len(urls):
                    print(f"  previews: {done}/{len(urls)}")
    for r in all_records:
        img = r.get("img")
        if isinstance(img, str) and img.startswith(_PENDING):
            r["img"] = _preview_cache.get(img[len(_PENDING):], {}).get("img", "")
    # prune entries for sites no longer referenced anywhere, then persist
    referenced = set(urls) | {u for u, e in _preview_cache.items() if _cache_fresh(e)}
    SITE.mkdir(exist_ok=True)
    (SITE / PREVIEW_CACHE_FILE).write_text(
        json.dumps({u: _preview_cache[u] for u in sorted(referenced) if u in _preview_cache},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


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
    ("fr", r"^feature\s*rank$", False),
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
    ("tags", r"tags?|keywords?|themes?", False),
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



# ---- "wonder score" for the sidebar sort (2026-09-04, Laurie) ----
# Surface the weird, supernatural and sci-fi tales, then inspiring history,
# ahead of whatever merely sits near the map centre. Scored from the text
# (Tags are too sparse to rank on). Emitted as rec["w"] so it is inspectable.
_WEIRD = re.compile(r"ghost|haunt|witch|devil|spirit|spectre|specter|phantom|curse|omen|giant|dragon|serpent|monster|little people|pukwudgie|fair(y|ies)|treasure|buried gold|vanish|apparition|headless|weird|myster|\bufo\b|flying saucer|alien|sci-?fi|science fiction|vonnegut|star trek|time travel|enchant|demon|goblin|\bimp\b|sorcer|magic|prophec|drowned|bewitch|supernatural|strange|ghoul|underworld|manitou|thunderbird|horned|shape-?shift|portal|premonition|banshee|werewolf|vampire|sea monster|lake monster|will-o|jack-o|lantern man|hellhound|black dog|wild hunt|skeleton|skull|flying head|rip van winkle|slept for|sleeps for|sighting|dwarf|djogeon|cannibal|transform|turned into|talking (animal|bird|tree|stone)|oracle|dream|vision|charm|medicine|shaman|conjur|\bspell\b|sacred|taboo|thunder|whirlwind|underwater|were-|rose from the|returned from the dead|back from the dead|immortal|stone-thrower|stone thrower|thrown by no one|invisible|wizard|witchcraft|hex|fortune|prophet|miracle|glow|light in the|mysterious light|bottomless|vanished|disappear|never (been )?found|ghost town|lost (mine|village|city)|legend|petrif|origin of|land of souls|fable|lake-lion|lion|creation|first (man|woman|people)|great turtle|sky woman|trickster|mother life|talking|speaking|animal people|duel|feast|omen", re.I)
_INSPIRE = re.compile(r"uprising|rebellion|anti-rent|freedom|abolition|underground railroad|suffrag|first woman|first black|invent|hero|rescue|escaped|liberat|resist|\bstrike\b|protest|pioneer|revolution|emancipat|courage|defied|defiance|refused|stood up|organiz|peacemaker|elope|treaty|founder|queen|chief|sachem|prophet", re.I)
def wonder_score(rec) -> int:
    text = " ".join([rec.get("t",""), rec.get("b",""), rec.get("s",""), " ".join(rec.get("tags",[]))])
    weird = len(set(m.group(0).lower() for m in _WEIRD.finditer(text)))
    insp = len(set(m.group(0).lower() for m in _INSPIRE.finditer(text)))
    tagboost = 3 if any(re.search(r"sci-?fi|science fiction|supernatural|haunted|witch|ghost|star trek", t, re.I) for t in rec.get("tags", [])) else 0
    return 3 * min(weird, 4) + 2 * min(insp, 3) + tagboost

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
            "tags": [x.strip() for x in re.split(r"[;,]", s(cell(row, idx, "tags"))) if x.strip()],
        }
        # column-drift dedupe, mirrored from the interactive versions
        if rec["b"] and rec["b"] == rec["s"]:
            rec["b"] = ""
        if rec["s"] and rec["s"] == rec["tf"] and rec["b"]:
            rec["s"], rec["b"] = rec["b"], ""
        rec["tier"] = tier_of(rec["c"], lat is not None and lng is not None)
        rec["w"] = wonder_score(rec)
        _fr = s(cell(row, idx, "fr"))
        rec["fr"] = int(float(_fr)) if re.match(r"^\d+(\.0+)?$", _fr) else None   # Laurie's curated lead order (2026-09-05)
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
    ("anchor", r"^anchor", False),
    ("ss", r"season\s*start", False),
    ("se", r"season\s*end", False),
    # Structured recurrence (2026-09-10): "Recur Weeks/Days/Except/Time".
    ("rw", r"^recur\s*weeks?$", False),
    ("rd", r"^recur\s*days?$", False),
    ("rx", r"^recur\s*except", False),
    ("rt", r"^recur\s*time", False),
]


def norm_mmdd(v, rw, label):
    """Season bound → 'MM-DD' string ('' when blank). Accepts MM-DD, M/D, or a date cell."""
    if v is None or str(v).strip() == "":
        return ""
    if hasattr(v, "month") and hasattr(v, "day"):
        return f"{v.month:02d}-{v.day:02d}"
    m = re.match(r"^\s*(\d{1,2})[-/](\d{1,2})\s*$", str(v))
    if not m or not (1 <= int(m.group(1)) <= 12 and 1 <= int(m.group(2)) <= 31):
        warn(f"{rw}: {label} '{v}' not understood (want MM-DD) — ignored")
        return ""
    return f"{int(m.group(1)):02d}-{int(m.group(2)):02d}"


def name_v_or_title(t):
    return t or "(unnamed)"


def parse_poi(path: Path, label: str, sheet=None):
    where = path.name + (f" [{sheet}]" if sheet else "")
    hdr, rows = read_rows(path, where, sheet)
    idx = map_headers(hdr, POI_SPEC, where)
    out = []
    for n, row in enumerate(rows, start=2):
        title = html_mod.unescape(s(cell(row, idx, "t")))
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
        # Anchor Type contract (2026-08-29): pin iff numeric Latitude AND Longitude;
        # never geocode Address. 'none' = directory-only by design, so a missing
        # coordinate there is intended, not a data gap — no warning.
        anchor = s(cell(row, idx, "anchor")).lower()
        if (lat is None or lng is None) and anchor != "none":
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
        # Structured recurrence (2026-09-10): a POI with a standing meeting
        # (e.g. a Legion post's "2nd Tue 7:30 PM") gets a nextOcc so the
        # calendar lists it. If it has NO regular hours, it is also
        # recurrence-gated: the map shows it only during the meeting window
        # (client-side, from rw/rd/rx/rt) and hides it entirely otherwise.
        rw_, rd_, rx_, rt_ = (s(cell(row, idx, k)) for k in ("rw", "rd", "rx", "rt"))
        nocc = next_occurrence_structured(rw_, rd_, rx_, "", "", datetime.date.today().isoformat()) if rw_ else None
        if rw_ and not nocc:
            warn(f"{rw}: {title} has Recur Weeks '{rw_}' but no computable next occurrence — check Recur Days/Except")
        has_hours = any((v or "").strip() for v in hrs.values())
        # Hours-gated (2026-09-12, Laurie): a POI tagged "Hours-Gated" that HAS
        # posted hours appears on the map only while open (client-side isClosedNow),
        # and is hidden — not merely dimmed — when closed. Independent of the
        # recurrence gate above: this is for premise POIs with daily hours (e.g. a
        # Legion post with a posted bar/canteen schedule) rather than a standing
        # meeting. No effect without hours (nothing to gate on).
        hours_gated = 1 if (has_hours and any(t.strip().lower() == "hours-gated" for t in tags)) else 0
        rec = {
            "ty": "poi", "cat": label, "id": rid, "t": title or "(unnamed)",
            "tags": tags, "addr": s(cell(row, idx, "addr")),
            "lat": lat, "lng": lng, "s": s(cell(row, idx, "stry")),
            "hrs": hrs, "web": web, "ph": s(cell(row, idx, "ph")),
            "g": s(cell(row, idx, "g")),
            "tier": "exact" if (lat is not None and lng is not None) else "none",
            "img": norm_image(cell(row, idx, "img"), rw),
            "cred": s(cell(row, idx, "cred")),
            "ss": norm_mmdd(cell(row, idx, "ss"), rw, "Season Start"),
            "se": norm_mmdd(cell(row, idx, "se"), rw, "Season End"),
        }
        if hours_gated:
            rec["hgate"] = 1
        if nocc:
            rec.update({"nextOcc": nocc, "rw": rw_, "rd": rd_, "rx": rx_, "rt": rt_,
                        # calendar compatibility: it renders ven/tm like an event
                        "ven": title or "", "tm": rt_,
                        "rgate": 0 if has_hours else 1})
        out.append(rec)
        if not out[-1]["img"] and web and label != "Points of Interest":
            out[-1]["img"] = fetch_site_image(web, rw)
    check_dupe_ids(out, where)
    return out


# ---------------- events ----------------

_WD = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
_ORD = {"1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "last": 0}

_ORDWORD = {"first": "1st", "second": "2nd", "third": "3rd",
            "fourth": "4th", "fifth": "5th", "last": "last"}


def _normalize_ordinal_recurrence(text):
    """Turn natural standing-schedule phrasing into the 'Recurring — …' grammar
    that next_occurrence() understands. Recognizes forms like:
        '1st & 3rd Tuesdays, 6:00 PM'
        '2nd Wednesdays'
        'first and third Tuesday of the month'
        '2nd & 4th Wednesdays'
    Returns a normalized 'Recurring — 1st week: Tue; 3rd week: Tue' string, or ''
    if no ordinal-weekday pattern is present. This lets schedules be written the
    plain way a person would, while the date math stays in one place."""
    if not text:
        return ""
    t = text.lower()
    # word ordinals -> numeric ('first' -> '1st') so one grammar handles both
    for word, num in _ORDWORD.items():
        t = re.sub(r"\b" + word + r"\b", num, t)
    # find the weekday this clause is about (first weekday token present)
    wdm = re.search(r"\b(mon|tue|wed|thu|fri|sat|sun)", t)
    if not wdm:
        return ""
    wd = wdm.group(1)
    # collect every ordinal that appears before the weekday token
    head = t[:wdm.start()]
    ords = re.findall(r"\b(1st|2nd|3rd|4th|5th|last)\b", head)
    if not ords:
        return ""
    wd_title = wd.capitalize()
    segs = ["{} week: {}".format(o, wd_title) for o in ords]
    return "Recurring — " + "; ".join(segs)


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


def next_occurrence(notes, start, end, today, time_field=""):
    """Given a 'Recurring — …' Notes string, return the soonest date >= today
    that the event actually happens (respecting its start/end bounds), or None
    if the notes carry no parseable recurrence. Handles:
      'every week: Thursday'            (one or many days)
      '2nd week: Tuesday'               (nth weekday of month)
      '1st week of month: Wednesday; 3rd week: Wednesday'  (compound)
    If the Notes carry no explicit 'Recurring —' clause, natural standing-schedule
    phrasing in the Notes or Time field (e.g. '1st & 3rd Tuesdays, 6:00 PM') is
    normalized into the same grammar, so plainly-written schedules still surface.
    Dates are ISO strings; today/start/end are ISO strings or ''.
    """
    m = re.search(r"Recurring\s*[\u2014-]\s*([^|]+)", notes or "")
    if not m:
        # no explicit recurrence clause — try to read natural ordinal phrasing
        # from the Notes, then the Time field ('1st & 3rd Tuesdays, 6:00 PM')
        normalized = (_normalize_ordinal_recurrence(notes)
                      or _normalize_ordinal_recurrence(time_field))
        if not normalized:
            return None
        m = re.search(r"Recurring\s*[\u2014-]\s*([^|]+)", normalized)
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


# ---- Structured recurrence (2026-09-10) ----------------------------------
# Reads the "Recur Weeks / Recur Days / Recur Except / Recur Time" columns that
# replaced the free-text 'Recurring — …' Notes grammar. Same date math as
# next_occurrence(), plus month exclusions ("Jul;Aug"). The legacy Notes parser
# is kept as a fallback for rows that haven't been migrated yet.
_MON3 = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def parse_recur_cols(rw, rd, rx):
    """-> (weeks, days, except_months) or None if rw is blank.
    weeks: 'all' or sorted list of ints (0 = last). days: list of weekday ints.
    except_months: set of month ints to skip."""
    rw = (rw or "").strip().lower()
    if not rw:
        return None
    if rw == "all":
        weeks = "all"
    else:
        weeks = []
        for tok in re.split(r"[;,\s]+", rw):
            if tok == "last":
                weeks.append(0)
            elif tok.isdigit() and 1 <= int(tok) <= 5:
                weeks.append(int(tok))
        if not weeks:
            return None
    days = [_WD[t[:3]] for t in re.split(r"[;,\s]+", (rd or "").lower()) if t[:3] in _WD]
    if not days:
        return None
    exc = {_MON3[t[:3]] for t in re.split(r"[;,\s]+", (rx or "").lower()) if t[:3] in _MON3}
    return weeks, days, exc


def next_occurrence_structured(rw, rd, rx, start, end, today):
    """Soonest date >= max(today, start) (and <= end, if given) matching the
    structured recurrence, skipping excluded months. ISO string or None."""
    parsed = parse_recur_cols(rw, rd, rx)
    if not parsed:
        return None
    weeks, days, exc = parsed

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
        return d is not None and d >= lo and (en is None or d <= en) and d.month not in exc
    cands = []
    if weeks == "all":
        for wd in days:
            d = _next_weekday(lo, wd)
            for _ in range(60):            # step past excluded months
                if within(d):
                    cands.append(d)
                    break
                if en and d > en:
                    break
                d += datetime.timedelta(days=7)
    else:
        for wd in days:
            for nth in weeks:
                probe = datetime.date(lo.year, lo.month, 1)
                for _ in range(15):        # up to ~14 months ahead
                    d = _nth_weekday_of_month(probe.year, probe.month, wd, nth)
                    if within(d):
                        cands.append(d)
                        break
                    if en and probe > en:
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
    ("tags", r"tags?|keywords?|themes?", False),
    ("d1", r"start\s*date|^date$", True),
    ("d2", r"end\s*date", False),
    ("tm", r"^time", False),
    ("web", r"website|^url$", False),
    ("g", r"glyph|icon|symbol", False),
    ("img", r"^image(\s*url)?$|^photo", False),
    ("cred", r"image\s*credit|^credit$|attribution", False),
    ("notes", r"^notes?$", False),
    ("disp", r"^display$|^show$|^visible$", False),
    ("ag", r"^agenda", False),     # Agenda view only: No hides from the calendar's agenda list (Laurie, 2026-08-31)
    # Structured recurrence (2026-09-10): preferred over the legacy 'Recurring — …' Notes grammar.
    ("rw", r"^recur\s*weeks?$", False),
    ("rd", r"^recur\s*days?$", False),
    ("rx", r"^recur\s*except", False),
    ("rt", r"^recur\s*time", False),
]



# Rows that are scraped web-page furniture rather than events. The workbook keeps
# them (never delete); the build just refuses to publish and warns. Add patterns
# as new junk shapes appear. (Laurie, 2026-09-01: newsletter signup forms,
# "SPOTLIGHT:" grant-list headers.)
JUNK_TITLE_RX = re.compile(r"^\s*(sign up for our newsletter|subscribe to our|spotlight:\s*create grant)|\(required\)", re.I)
JUNK_VENUE_RX = re.compile(r"\(required\)\s*\*|^email \(required\)", re.I)


# ---- Event glyph auto-fill -------------------------------------------------
# Applied at build time whenever an event's Glyph cell is blank, so newly
# scraped events get sensible emojis without manual passes. Ordered: the
# first matching rule wins; titles are consulted before venues so an event's
# own subject beats its host's identity. Hand-set cells are never overridden
# (except the lossless 🎬→🍿 normalization below).
GLYPH_NORMALIZE = {"🎬": "🍿"}
GLYPH_RULES = [
 (r"\bfood truck(s)?\b", "\U0001F69A"),
 (r"\bkids?\b|\bchild(ren)?(\'s)?\b|\btoddlers?\b|\byouth\b|\bteens?\b|\bstory ?time\b|\bfor ages? \d|\blittle ones\b|\bknee high\b", "🐤"),
 (r"\bmovies?\b|\bfilm(s|ing)?\b|\bscreening\b|\bdrive[- ]?in\b|\bcinema\b", "🍿"),
 (r"\bart gallery\b|\bgallery (opening|show|night|tour)\b|\bexhibit(ion)?\b|\bopening reception\b|\bcurator tour\b", "🖼️"),
 (r"\btheat(re|er)\b|\bstage play\b|\ba play\b|\bmusical\b|\bcabaret\b|\bimprov\b|\bcomedy (show|night|festival)\b", "🎟️"),
 (r"\bchoir\b", "👯"),
 (r"\bjazz\b", "🎶"),
 (r"\bopen[- ]?mics?\b|\bkaraoke\b", "🎤"),
 (r"\bconcert\b|\bsymphony\b|\bquartet\b|\bchamber music\b|\brecital\b|\bsingalong\b|\bbluegrass\b|\blive music\b", "🎵"),
 (r"\bperformances?\b|\bintermission\b|\bplayers present\b|\bshakespeare\b", "🎭"),
 (r"\bbutterfl(y|ies)\b|\blupine fest\b|\bmonarch\b(?! hill)", "🦋"),
 (r"\bturtles?\b", "🐢"),
 (r"\btennis\b", "🎾"),
 (r"\bhorse(s|back)?\b|\bequestrian\b|\bpon(y|ies)\b|\btrail(s)? ?rides?\b|\bmustang\b|\bunbridled\b", "🐴"),
 (r"\bbird(s|ing| watch| banding| walk)?\b|\beagle walk\b|\baudubon\b", "🐦"),
 (r"\bdye(s|ing)? workshop\b|\b(plant|natural) dyes?\b|\bdyeing\b", "🎨"),
 (r"\bacupuncture\b", "😌"),
 (r"\bpostpartum\b|\bnew parents?\b|\bbabywearing\b|\bla leche\b", "🍼"),
 (r"\bforest (walk|bath(e|ing)|stewardship|tour|school)\b", "🌲"),
 (r"\bnature bus\b", "🚌"),
 (r"\bastrolog(y|ical|er)\b|\bhoroscopes?\b|\btarot\b|\breikk?i\b|\bpsychics?\b", "🔮"),
 (r"\bbee ?keep(er|ers|ing)?\b|\bbeekep\w*\b", "🍯"),
 (r"\bnative trees?\b", "🌲"),
 (r"\bnative plants?\b", "🌿"),
 (r"\bzba\b|\btown (hall|board) meeting\b|\bbudget town hall\b", "🇺🇸"),
 (r"(?<!baseball )\bbats?\b(?! mitzvah)(?!man)|\bbat (walk|night|watch|count)\b", "🦇"),
 (r"\bhik(e|es|ing)\b|\btrail (run|walk|preview|day)\b|\btrail ?blaz(e|ing|er|ers)\b|\bramble\b|\bmeander\b|\bnature walk\b|\bwalks?\b|\bwalking\b", "🥾"),
 (r"\bart(s)?\b|\bpaint(ing)?\b|\bdraw(ing)?\b|\bsketch\b|\bwatercolor\b|\bprintmaking\b|\bscreenprint(ing)?\b|\bpottery\b|\bceramics\b|\bsculpture\b|\bcreative circles?\b", "🎨"),
 (r"\bwrit(ing|ers?)\b|\bscreenwrit\w*\b|\bmemoir\b|\bjournaling\b", "🖋️"),
 (r"\bbook (club|fair|launch|sale|signing)\b|\blibrary\b|\bauthor\b|\bpoetry\b|\bpoem\b|\breading\b", "📚"),
 (r"\btrivia\b|\bquiz\b", "🧠"),
 (r"\bpuzzles?\b|\bjigsaw\b|\bcrossword\b", "🧩"),
 (r"\bmah ?jongg?\b", "🀄"),
 (r"\bboard games?\b|\bgame night\b|\bgames? meetup\b|\btabletop\b|\bwarmachine\b|\bwargam(e|es|ing)\b|\bmagic:? the gathering\b|\borganized play\b|\bcasual play\b|\bclocktower\b|\bcrokinole\b|\bdart(s| league)\b|\bbingo\b|\bchess\b", "🎲"),
 (r"\bbrewery\b|\bbrewing\b|\bbeer\b|\bcask\b|\btap ?takeover\b|\bcider\b|\bmeadworks\b|\bmead\b", "🍺"),
 (r"\bcocktail\b|\bhappy hour\b|\bwine (tasting|dinner|pairing)\b|\bsip\b", "🍸"),
 (r"\bsound ?bath\b|\bsound healing\b|\bsound(s)? for healing\b", "🎐"),
 (r"\byoga\b|\bmeditat(ion|e)\b|\bbreath ?work\b", "🧘"),
 (r"\bcoworking\b|\btech meetup\b|\bcod(e|ing)\b", "💼"),
 (r"\bfarmers market\b|\bfarm stand\b|\bplant (sale|swap|exchange)\b|\bseed (swap|sowing|library)\b|\bgarden(ing)?\b", "🌱"),
 (r"\bforag(e|ing)\b|\bmushrooms?\b|\bfungi\b|\bmycelium\b|\bmycolog(y|ical|ist)\b", "🍄"),
 (r"\bstitch(ing|ery)?\b|\bup-?stitch\b|\bquilt(s|ing)?\b|\bcross-?stitch\b", "🧵"),
 (r"\bknit(ting)?\b|\bpurl\b|\bcrochet\b|\bsew(ing)?\b|\bcraft\b|\bweav(e|ing)\b|\bembroidery\b|\bmending\b", "🧶"),
 (r"\b5k\b|\brun club\b|\btrot\b|\bfun run\b", "🏃"),
 (r"\bkayak\b|\bpaddle\b|\bcanoe\b|\bsail\b", "🛶"),
 (r"\bgala\b|\bpotluck\b|\bpart(y|ies)\b|\bcelebration\b|\banniversary\b|\bbirthday\b", "🎉"),
 (r"\bvolunteer\b|\bclean ?up\b|\btrash crawl\b|\bfood pantry\b|\bfood drive\b|\bdonation\b|\bfundraiser\b|\bbenefit\b", "🤝"),
 (r"\bfestival\b|\bfair\b|\bfest\b|\bcarnival\b", "🎪"),
 (r"\bhistor(y|ic|ical)\b|\bmuseum\b|\bheritage\b|\brevolution\b|\bcivil war\b", "🏛️"),
]
def auto_glyph(title, venue, cell_glyph, is_online=False):
    # Food trucks always show the truck, overriding any celled food glyph
    # (🍕/🍔/etc.) so the category reads consistently at a glance on the map.
    if re.search(r"\bfood truck(s)?\b", (title or "").lower()):
        return "\U0001F69A"  # 🚚
    g = (cell_glyph or "").strip()
    if g:
        # 💻 changed meaning: it now marks online events. A celled 💻 on an
        # in-person event predates that change and meant coworking → 💼.
        if g == "💻" and not is_online:
            return "💼"
        return GLYPH_NORMALIZE.get(g, g)
    t = (title or "").lower()
    for pat, gg in GLYPH_RULES:          # pass 1: the event's own title
        if re.search(pat, t):
            return gg
    tv = t + " " + (venue or "").lower() # pass 2: fall back to venue context
    for pat, gg in GLYPH_RULES:
        if re.search(pat, tv):
            return gg
    return "💻" if is_online else ""

# ---------------------------------------------------------------------------
# Agenda-quiet list (2026-09-18, Laurie). events.xlsx is replaced wholesale by each
# ingestor drop-in, so an Agenda=No cell edited by hand is lost next time. This file
# is the durable version: one pattern per line (case-insensitive substring, or a
# regex if the line starts with "re:"), matched against the event title AND venue.
# Matching events keep their map pin and stay searchable but are hidden from the
# calendar list/month views — exactly what Agenda=No does. Lines starting with # are
# comments.
# ---------------------------------------------------------------------------
_AGENDA_QUIET = None
def _load_agenda_quiet():
    global _AGENDA_QUIET
    if _AGENDA_QUIET is not None:
        return _AGENDA_QUIET
    rules = []
    f = ROOT / "data" / "agenda_quiet.txt"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.lower().startswith("re:"):
                try: rules.append(re.compile(line[3:].strip(), re.I))
                except re.error as e: WARNS.append(f"agenda_quiet.txt: bad regex {line!r}: {e}")
            else:
                rules.append(line.lower())
    _AGENDA_QUIET = rules
    return rules

def agenda_quiet_match(title, venue):
    hay = f"{title} {venue}".lower()
    for r in _load_agenda_quiet():
        if (r.search(hay) if hasattr(r, "search") else r in hay):
            return True
    return False

def strip_redundant_recurrence(rows):
    """Model A drop-ins emit one DATED row per occurrence but still carry the recurrence
    rule (Recur Weeks/Days) on every instance. The calendar rolls any recurring row whose
    date has passed forward to its next occurrence — which lands on top of the explicit
    row for that date, so every weekly series showed twice (2026-09-18, Laurie). Rule:
    when two or more rows share a title AND a recurrence rule, the dated rows are the
    truth and the rule is dropped from all of them. A lone recurring row (legacy
    "meets 2nd Tuesday" entries with no dated siblings) keeps its rule."""
    groups = {}
    for r in rows:
        if r.get("rw"):
            key = (re.sub(r"\s+", " ", str(r.get("t") or "")).strip().lower(), str(r.get("rw")), str(r.get("rd") or ""))
            groups.setdefault(key, []).append(r)
    n = 0
    for g in groups.values():
        if len(g) < 2:
            continue
        for r in g:
            for k in ("rw", "rd", "rx", "rt"):
                r.pop(k, None)
            n += 1
    if n:
        print(f"    (recurrence rule dropped from {n} dated series rows — dated instances are authoritative)")

def parse_events(path: Path, label: str, sheet=None):
    where = path.name + (f" [{sheet}]" if sheet else "")
    hdr, rows = read_rows(path, where, sheet)
    idx = map_headers(hdr, EVT_SPEC, where)
    today = datetime.date.today().isoformat()
    out = []
    skipped_past = [0]
    for n, row in enumerate(rows, start=2):
        title = html_mod.unescape(s(cell(row, idx, "t")))
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
        is_online = bool(re.search(r"\bonline\b|\bvirtual\b|\bzoom\b(?!\s*flume)|\blivestream\b",
                                   ven_txt + " " + addr_txt))
        lat = coord(cell(row, idx, "lat"), -90, 90, "Latitude", rw,
                    required=False)
        lng = coord(cell(row, idx, "lng"), -180, 180, "Longitude", rw,
                    required=False)
        # Food trucks are roaming vendors. When their location is only a town
        # (or blank) — no street address — they have no fixed spot to pin, so we
        # keep them in the listings/search but off the map. A real street address
        # (e.g. hosted at a brewery) keeps them mapped as normal.
        _addr_raw = s(cell(row, idx, "addr")).strip()
        _has_street = bool(re.match(r"^\d+\s+\S", _addr_raw))
        if re.search(r"\bfood truck(s)?\b", (title or "").lower()) and not _has_street:
            if lat is not None or lng is not None:
                warn(f"{rw}: {title} is a roaming food truck with no street address — listed/searchable but not mapped")
            lat = None
            lng = None
        if not is_online and (lat is None or lng is None):
            # upcoming but not yet locatable: keep it in the listings, off the map
            warn(f"{rw}: {title} has no coordinates yet — listed but not mapped")
        d1 = parse_date(cell(row, idx, "d1"), "Start Date", rw, required=True)
        d2 = parse_date(cell(row, idx, "d2"), "End Date", rw, required=False)
        if d1 and d2 and d2 < d1:
            fail(f"{rw}: End Date {d2} is before Start Date {d1}")
        notes = s(cell(row, idx, "notes"))
        rw_, rd_, rx_, rt_ = (s(cell(row, idx, k)) for k in ("rw", "rd", "rx", "rt"))
        # Structured columns win; the legacy 'Recurring — …' Notes grammar is the fallback.
        nocc = (next_occurrence_structured(rw_, rd_, rx_, d1, d2, today) if rw_ else
                next_occurrence(notes, d1, d2, today, time_field=s(cell(row, idx, "tm"))))  # ISO string or None
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
            "ven": html_mod.unescape(s(cell(row, idx, "ven"))), "addr": s(cell(row, idx, "addr")),
            "tags": [x.strip() for x in re.split(r"[;,]", s(cell(row, idx, "tags"))) if x.strip()],
            "lat": lat, "lng": lng, "s": html_mod.unescape(s(cell(row, idx, "stry"))),
            "d1": d1, "d2": d2 or "", "tm": s(cell(row, idx, "tm")),
            "web": s(cell(row, idx, "web")), "g": auto_glyph(title, s(cell(row, idx, "ven")), s(cell(row, idx, "g")), is_online),
            "online": is_online, "nextOcc": nocc or "",
            "rw": rw_, "rd": rd_, "rx": rx_, "rt": rt_,
            "tier": "exact" if (lat is not None and lng is not None) else "none",
            "img": norm_image(cell(row, idx, "img"), rw),
            "cred": s(cell(row, idx, "cred")),
        })
        if JUNK_TITLE_RX.search(out[-1]["t"]) or JUNK_VENUE_RX.search(out[-1].get("ven") or ""):
            warn(f"{where}: skipped scraped-form/junk row \"{out[-1]['t'][:60]}\" (matches JUNK_TITLE_RX/JUNK_VENUE_RX) — hide it in the sheet or fix the source")
            out.pop(); continue
        if s(cell(row, idx, "ag")).lower() in ("no", "n", "false", "0", "hide", "hidden"):
            out[-1]["ag"] = 0        # only emitted when hidden; absent means "show on agenda"
        elif agenda_quiet_match(out[-1]["t"], out[-1].get("ven") or ""):
            out[-1]["ag"] = 0        # atlas-side rule (data/agenda_quiet.txt) — survives ingestor drop-ins
        ev_web = s(cell(row, idx, "web"))
        if not out[-1]["img"] and ev_web:
            out[-1]["img"] = fetch_site_image(ev_web, rw)
    strip_redundant_recurrence(out)
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


def backfill_event_coords_from_poi(all_records):
    """Fill in coordinates for events that lack them by reusing the verified
    coordinates of a matching Point of Interest. Matching is deliberately strict:
    an event borrows a POI's location only when its venue name equals the POI name,
    or its street address matches the POI's street address. This never invents a
    coordinate — it only reuses one already vetted in the POI sheet — and it never
    overrides coordinates an event already has. Loose/substring matching is avoided
    on purpose so we don't, say, pin a 'Sleepy Hollow' reading to a farm that merely
    shares a word."""
    def norm(v):
        return re.sub(r"[^a-z0-9]+", " ", str(v or "").lower()).strip()

    def street_key(addr):
        m = re.match(r"\s*(\d+)\s+([a-z0-9]+)", str(addr or "").lower())
        return (m.group(1), m.group(2)) if m else None

    pois = [r for r in all_records
            if r.get("ty") == "poi" and r.get("lat") is not None]
    by_name, by_addr = {}, {}
    for p in pois:
        n = norm(p.get("t"))
        if n and n not in by_name:
            by_name[n] = p
        k = street_key(p.get("addr"))
        if k and k not in by_addr:
            by_addr[k] = p

    filled = 0
    for e in all_records:
        if e.get("ty") != "events" or e.get("lat") is not None:
            continue
        if e.get("online"):
            continue
        hit = by_name.get(norm(e.get("ven")))
        if not hit:
            k = street_key(e.get("addr"))
            if k:
                hit = by_addr.get(k)
        if hit:
            e["lat"], e["lng"] = hit["lat"], hit["lng"]
            e["tier"] = "exact"
            filled += 1
    if filled:
        print(f"  event→POI coord backfill: filled {filled} event(s) from matching POIs")


# ---- Slugs + hearts -------------------------------------------------------------
# Every record gets a stable slug (`sl`) — the same algorithm index.template.html
# used to compute client-side, run over the records in data.js order, so existing
# heart counters (keyed by slug) keep their history. Emitting it from the build
# lets the directory page share the exact same identity without re-deriving it.
_SLUG_QUOTES = re.compile("['\u2019\"\u201c\u201d]")
_SLUG_NONALNUM = re.compile(r"[^a-z0-9]+")


def slugify(t):
    x = _SLUG_QUOTES.sub("", (t or "").lower())
    x = _SLUG_NONALNUM.sub("-", x).strip("-")[:60]
    return x or "entry"


def assign_slugs(all_records):
    used = set()
    for r in all_records:
        base = slugify(r.get("t", "")); sl = base; n = 2
        while sl in used:
            sl = f"{base}-{n}"; n += 1
        used.add(sl); r["sl"] = sl


# Hearts live in Abacus (LIKE_API / LIKE_NS in the pages), one counter per slug,
# no bulk read, and a 30-requests-per-10-seconds rate limit — far too slow for a
# browser to fetch ~850 counts on every directory visit. So the build gathers
# them, politely, and ships a snapshot: `h` on each record in data.js (only when
# > 0) and site/hearts.json (also the cache the next build seeds from, via the
# live site, like preview-cache.json). Each build spends at most HEARTS_BUDGET_S
# seconds: it always re-reads every slug that already has hearts, then works
# through the rest of the POI slugs from a rotating cursor, so every card is
# re-checked within a handful of builds. The pages still fetch live counts for
# the few cards that matter (the hearted section, and anything just tapped).
HEARTS_API = "https://abacus.jasoncameron.dev"
HEARTS_NS = "nyhilltowners-explore-hills"
HEARTS_FILE = "hearts.json"
HEARTS_URL = "https://nyhilltowners.com/" + HEARTS_FILE
import os as _os
HEARTS_BUDGET_S = int(_os.environ.get("HEARTS_BUDGET", "75"))   # seconds; e.g. HEARTS_BUDGET=600 python3 build/build.py for a one-off full sweep
HEARTS_INTERVAL_S = 0.4          # 2.5 req/s, under the 30/10 s limit
import time as _time


def _hearts_get(slug):
    req = urllib.request.Request(f"{HEARTS_API}/get/{HEARTS_NS}/{slug}",
                                 headers={"User-Agent": "Mozilla/5.0 (compatible; AtlasBuild/1.0)"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        v = d.get("value") if isinstance(d, dict) else None
        return int(v) if isinstance(v, (int, float)) else 0, None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return 0, None            # counter never created = no hearts
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, e.__class__.__name__


def refresh_hearts(all_records):
    cache = {}
    src = None
    local = SITE / HEARTS_FILE
    try:
        if local.exists():
            cache = json.loads(local.read_text(encoding="utf-8")); src = "local"
        else:
            req = urllib.request.Request(HEARTS_URL, headers={"User-Agent": "Mozilla/5.0 (compatible; AtlasBuild/1.0)"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                cache = json.loads(resp.read().decode("utf-8")); src = "live site"
    except Exception as e:
        cache = {}; print(f"  hearts: no cache available ({e.__class__.__name__})")
    if not isinstance(cache, dict):
        cache = {}
    counts = {k: v for k, v in cache.get("counts", {}).items() if isinstance(v, int)}
    cursor = cache.get("cursor", 0) if isinstance(cache.get("cursor", 0), int) else 0
    if src:
        print(f"  hearts: {sum(1 for v in counts.values() if v > 0)} hearted slug(s) in cache from {src}")

    poi_slugs = [r["sl"] for r in all_records if r.get("ty") == "poi"]
    hearted_first = [sl for sl in poi_slugs if counts.get(sl, 0) > 0]
    rest = [sl for sl in poi_slugs if counts.get(sl, 0) <= 0]
    if rest:
        cursor %= len(rest)
        rest = rest[cursor:] + rest[:cursor]
    queue = hearted_first + rest
    t0 = _time.time(); done = 0; errs = 0
    for sl in queue:
        if _time.time() - t0 > HEARTS_BUDGET_S:
            break
        v, err = _hearts_get(sl)
        if err:
            errs += 1
            if errs >= 5:                      # service down / blocked: stop hammering, keep the cache
                warn(f"hearts: {err} from {HEARTS_API} — stopped after {done} read(s); using cached counts")
                break
        else:
            counts[sl] = v
        done += 1
        _time.sleep(HEARTS_INTERVAL_S)
    advanced = max(0, done - len(hearted_first))
    if rest:
        cursor = (cursor + advanced) % len(rest)
    print(f"  hearts: refreshed {done} slug(s) in {int(_time.time()-t0)}s; "
          f"{sum(1 for v in counts.values() if v > 0)} hearted; cursor {cursor}/{len(rest)}")
    for r in all_records:
        v = counts.get(r["sl"], 0)
        if v > 0:
            r["h"] = v
    SITE.mkdir(exist_ok=True)
    (SITE / HEARTS_FILE).write_text(json.dumps({"updated": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
                                                 "cursor": cursor, "counts": counts},
                                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ---------------------------------------------------------------------------
# Shared header / footer partials. A page marks where they go with
#   <!-- @@header -->   and   <!-- @@footer -->
# and build.py splices partials/header.html / partials/footer.html in, adding
# class="active" to the nav link whose href is this page. Missing marker = page
# is emitted as-is; missing partial = the marker is left in place and a WARNING
# is logged, never a broken page.
# ---------------------------------------------------------------------------
PARTIALS = ROOT / "partials"


def _partial(name: str) -> str:
    p = PARTIALS / name
    if not p.exists():
        WARNS.append(f"partials/{name} missing — marker left in page")
        return ""
    return p.read_text(encoding="utf-8")


def _mark_active(header: str, page: str) -> str:
    """Add class="active" to the nav link pointing at `page` (keeps any existing class)."""
    def repl(m):
        attrs = m.group(1)
        if 'class="' in attrs:
            attrs = attrs.replace('class="', 'class="active ', 1)
        else:
            attrs = attrs + ' class="active"'
        return f'<a href="{page}"{attrs}>'
    return re.sub(r'<a href="' + re.escape(page) + r'"([^>]*)>', repl, header, count=1)


def apply_partials(html: str, page: str) -> str:
    if "<!-- @@header -->" in html:
        h = _partial("header.html")
        if h:
            html = html.replace("<!-- @@header -->", _mark_active(h, page).rstrip("\n"), 1)
    if "<!-- @@footer -->" in html:
        f = _partial("footer.html")
        if f:
            html = html.replace("<!-- @@footer -->", f.rstrip("\n"), 1)
    return html


def emit_page(src, out_name: str) -> None:
    html = Path(src).read_text(encoding="utf-8")
    (SITE / out_name).write_text(apply_partials(html, out_name), encoding="utf-8")


# ---------------------------------------------------------------------------
# Trading Post (2026-09-18, Laurie): data/trading_post.xlsx → site/trading_post.js
# Columns: Category, Business, Town, Product, Price, URL, Image, Notes, Display.
# Image blank → the product page's Open Graph image is fetched via the same
# preview machinery as events/POI (cached in site/preview-cache.json).
# ---------------------------------------------------------------------------
def _og_price(url):
    """Best-effort price from the product page's og:price:amount / product:price:amount meta
    (Shopify, WooCommerce). Blank if the page can't be fetched or has no price tag."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (HilltownsAtlas preview)"})
        html_ = urllib.request.urlopen(req, timeout=PREVIEW_TIMEOUT).read(300000).decode("utf-8", "ignore")
        m = re.search(r'property=["\'](?:og|product):price:amount["\'][^>]*content=["\']([\d.,]+)', html_, re.I) \
            or re.search(r'content=["\']([\d.,]+)["\'][^>]*property=["\'](?:og|product):price:amount', html_, re.I)
        if not m:
            return ""
        v = float(m.group(1).replace(",", ""))
        return f"${v:,.0f}" if v == int(v) else f"${v:,.2f}"
    except Exception:
        return ""

def load_trading_post():
    path = ROOT / "data" / "trading_post.xlsx"
    if not path.exists():
        return []
    ws = load_workbook(path, read_only=True, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    ix = {str(h).strip().lower(): i for i, h in enumerate(rows[0]) if h}
    def g(r, k):
        i = ix.get(k); v = r[i] if i is not None and i < len(r) else None
        return str(v).strip() if v is not None else ""
    out = []
    for n, r in enumerate(rows[1:], start=2):
        if not g(r, "product") or g(r, "display").lower() == "no":
            continue
        url = g(r, "url")
        if not url:
            WARNS.append(f"trading_post.xlsx row {n}: {g(r,'product')} has no URL — skipped"); continue
        img = g(r, "image") or fetch_site_image(url, f"trading_post.xlsx row {n}")
        price = g(r, "price") or _og_price(url)
        out.append({"cat": g(r, "category") or "Other", "biz": g(r, "business"), "town": g(r, "town"),
                    "name": g(r, "product"), "price": price, "url": url, "img": img})
    return out


def emit_trading_post(items):
    for it in items:
        if isinstance(it.get("img"), str) and it["img"].startswith(_PENDING):
            it["img"] = _preview_cache.get(it["img"][len(_PENDING):], {}).get("img", "")
    (SITE / "trading_post.js").write_text("window.TRADING_POST = " + json.dumps(items, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"  Trading Post: {len(items)} items")


# ---------------------------------------------------------------------------
# Station degree days (2026-09-19, Laurie): data/station_albany_daily.csv (xmACIS listing,
# Albany Intl AP, 1938→) → site/station_dd.js. Per year, cumulative HDD/CDD (base 65 on the
# daily mean) and GDD (base 50, Tmax capped 86, Tmin floored 50) by day-of-year, from the
# observed Tmax/Tmin — same formulas the Signals page applies to the reanalysis, so the two
# are comparable. Missing days (M) are skipped, not zeroed.
# ---------------------------------------------------------------------------
DAILY_STATIONS = {"alcove_dam", "albany_ap"}   # continuous records: raw daily highs/lows shipped for the year charts
STATIONS = [   # (slug, display name, elevation ft, active?)  — see data/stations/README.md
    ("alcove_dam",      "Alcove Dam (co-op) · Coeymans",        590,  True),
    ("albany_ap",       "Albany Intl Airport (ALB)",            285,  True),
    ("phoenicia",       "Phoenicia 2SW (co-op) · Ulster Co.",   820,  False),
    ("prattsville",     "Prattsville (co-op) · Greene Co.",    1150,  False),
    ("cobleskill_2ese", "Cobleskill 2 ESE (co-op)",            1200,  False),
    ("cairo_3nw",       "Cairo 3 NW (co-op)",                   600,  False),
    ("windham_3e",      "Windham 3 E (co-op) · Greene Co.",    1600,  False),
    ("conklingville_dam","Conklingville Dam (co-op) · Sacandaga", 780,  True),
]

def _station_years(path, keep_daily=False):
    """Per year: cumulative HDD/CDD/GDD, precipitation and snowfall by day-of-year (rounded),
    plus annual extremes. T = trace counts as 0.0. Missing days are skipped, not zeroed."""
    import csv as _csv
    def num(v):
        if v is None: return None
        v = v.strip()
        if v in ("", "M"): return None
        if v == "T": return 0.0
        try: return float(v)
        except ValueError: return None
    years = {}
    with path.open(encoding="utf-8") as f:
        for row in _csv.DictReader(f):
            y, m, d = row["Date"].split("-")
            doy = datetime.date(int(y), int(m), int(d)).timetuple().tm_yday
            Y = years.setdefault(int(y), {"h":[0.0]*367,"c":[0.0]*367,"g":[0.0]*367,"p":[0.0]*367,"s":[0.0]*367,
                                          "n":0,"np":0,"hi":None,"lo":None,"d90":0,"d0":0,"depth":0.0,"wet":0})
            mx, mn = num(row.get("MaxT")), num(row.get("MinT"))
            if mx is not None and mn is not None:
                Y.setdefault("dhi", [None]*367)[doy] = mx; Y.setdefault("dlo", [None]*367)[doy] = mn
                mean = (mx + mn) / 2
                Y["h"][doy] += max(0.0, 65 - mean); Y["c"][doy] += max(0.0, mean - 65)
                gm = (min(86.0, mx) + max(50.0, mn)) / 2; Y["g"][doy] += max(0.0, gm - 50); Y["n"] += 1
                Y["hi"] = mx if Y["hi"] is None else max(Y["hi"], mx); Y["lo"] = mn if Y["lo"] is None else min(Y["lo"], mn)
                if mx >= 90: Y["d90"] += 1
                if mn <= 0: Y["d0"] += 1
            p, s, dep = num(row.get("Precip")), num(row.get("Snow")), num(row.get("SnowDepth"))
            if p is not None: Y["p"][doy] += p; Y["np"] += 1; Y["wet"] += (1 if p >= 0.01 else 0)
            if s is not None: Y["s"][doy] += s
            if dep is not None: Y["depth"] = max(Y["depth"], dep)
    out = {}
    for y, Y in years.items():
        rec = {"n": Y["n"], "np": Y["np"], "hi": Y["hi"], "lo": Y["lo"], "d90": Y["d90"], "d0": Y["d0"], "depth": Y["depth"], "wet": Y["wet"]}
        if keep_daily and "dhi" in Y:
            rec["dhi"] = Y["dhi"][1:]; rec["dlo"] = Y["dlo"][1:]   # raw daily highs/lows, index = day-of-year - 1
        for k, dp in (("h",0),("c",0),("g",0),("p",2),("s",1)):
            s_, cum = 0.0, []
            for i in range(1, 367):
                s_ += Y[k][i]; cum.append(round(s_, dp) if dp else round(s_))
            rec[k] = cum                # daily cumulative for every year — the record-wide average needs day-of-year lookups
            rec["t" + k] = cum[-1]      # full-year total, every year — keeps the file at ~1/3 the size
        out[y] = rec
    return out


def emit_station_dd():
    """data/stations/*.csv → site/station_dd.js: per station, per year, cumulative HDD/CDD (base 65)
    and GDD (base 50, 86 cap), precipitation and snowfall by day-of-year, plus annual extremes —
    everything the xmACIS listings carry that the Signals page can show. The raw CSVs stay in
    data/stations/ untouched as the archive of record."""
    out = {}
    for slug, name, elev, active in STATIONS:
        p = ROOT / "data" / "stations" / f"{slug}.csv"
        if not p.exists():
            WARNS.append(f"stations/{slug}.csv missing — skipped"); continue
        yrs = _station_years(p, keep_daily=(slug in DAILY_STATIONS))
        ys = sorted(yrs)
        out[slug] = {"name": name, "elev": elev, "active": active, "first": ys[0], "last": ys[-1], "daily": slug in DAILY_STATIONS, "years": yrs}
    if out:
        (SITE / "station_dd.js").write_text("window.STATION_DD = " + json.dumps({"source": "NOAA GHCN-Daily via xmACIS2 (NRCC)", "stations": out}) + ";\n", encoding="utf-8")
        print(f"  Station degree days: {len(out)} stations → station_dd.js")

# ---------------------------------------------------------------------------
# Historical Phenology (2026-09-20, Laurie): data/climate_events.xlsx (the Regional Climate &
# Weather Event Register) → site/phenology_history.js. Sheets "Events" (anchored by the
# "Timeline anchor (ISO)" column) and "Wind & Tornadoes" (by Date). Each record carries a
# month-day so the page can slot it into a two-week window regardless of year. Formula cells
# are not evaluated (openpyxl reads the formula text), so only literal columns are used.
# ---------------------------------------------------------------------------
def emit_phenology_history():
    p = ROOT / "data" / "climate_events.xlsx"
    if not p.exists():
        return
    wb = load_workbook(p, read_only=True, data_only=True)
    def sheet_rows(name):
        if name not in wb.sheetnames:
            return [], {}
        ws = wb[name]; rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return [], {}
        ix = {str(h).strip().lower(): i for i, h in enumerate(rows[0]) if h}
        return rows[1:], ix
    def g(r, ix, k):
        i = ix.get(k); v = r[i] if i is not None and i < len(r) else None
        if v is None: return ""
        if hasattr(v, "isoformat"): return v.isoformat()[:10]
        return str(v).strip()
    out = []
    rows, ix = sheet_rows("Events")
    for r in rows:
        iso = g(r, ix, "timeline anchor (iso)") or g(r, ix, "start date")
        if not re.match(r"^-?\d{3,4}-\d{2}-\d{2}", iso):
            continue
        y, m, d = iso.split("-")[:3]
        out.append({"src": "events", "id": g(r, ix, "id"), "y": int(y), "m": int(m), "d": int(d),
                    "start": g(r, ix, "start date"), "end": g(r, ix, "end date"), "prec": g(r, ix, "date precision"),
                    "cat": g(r, ix, "category"), "t": g(r, ix, "event name"), "area": g(r, ix, "area affected"),
                    "meas": g(r, ix, "key measurement"), "station": g(r, ix, "station / gauge"), "impact": g(r, ix, "impact summary"),
                    "source": g(r, ix, "primary source"), "url": g(r, ix, "source url"), "conf": g(r, ix, "confidence"), "basis": g(r, ix, "anchor basis")})
    rows, ix = sheet_rows("Wind & Tornadoes")
    for r in rows:
        iso = g(r, ix, "date")
        if not re.match(r"^\d{4}-\d{2}-\d{2}", iso):
            continue
        y, m, d = iso.split("-")[:3]
        deaths, inj = g(r, ix, "deaths"), g(r, ix, "injuries")
        meas = " · ".join(x for x in [g(r, ix, "rating / peak wind"), (g(r, ix, "path length (mi)") + " mi path") if g(r, ix, "path length (mi)") else "", (deaths + " deaths") if deaths not in ("", "0") else "", (inj + " injured") if inj not in ("", "0") else ""] if x)
        out.append({"src": "wind", "id": "W-" + iso, "y": int(y), "m": int(m), "d": int(d), "start": iso, "end": iso, "prec": "day",
                    "cat": g(r, ix, "type") or "Wind", "t": (g(r, ix, "type") or "Wind event") + " — " + (g(r, ix, "place / path") or g(r, ix, "county") + " Co."),
                    "area": (g(r, ix, "county") + " County") if g(r, ix, "county") else "", "meas": meas, "station": "", "impact": g(r, ix, "notes"),
                    "source": g(r, ix, "source"), "url": "", "conf": g(r, ix, "confidence"), "basis": g(r, ix, "time (local)")})
    out.sort(key=lambda e: (e["m"], e["d"], e["y"]))
    (SITE / "phenology_history.js").write_text("window.PHENOLOGY_HISTORY = " + json.dumps(out, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"  Historical Phenology: {len(out)} events → phenology_history.js")

def main() -> int:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    load_preview_cache()
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

    backfill_event_coords_from_poi(all_records)
    tp_items = load_trading_post()          # registers its preview fetches before resolve
    resolve_previews(all_records)
    emit_trading_post(tp_items)
    assign_slugs(all_records)
    refresh_hearts(all_records)

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
    # Remove stale generated HTML so renamed/removed pages don't linger locally.
    for old in SITE.glob("*.html"):
        old.unlink()
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
    emit_page(template, "atlas.html")      # 2026-09-18 (Laurie): the map now lives at atlas.html
    # Standalone pages (hand-authored). Each carries <!-- @@header --> / <!-- @@footer -->
    # markers that emit_page() fills from partials/, so the nav + skyline + footer are
    # written once and stamped everywhere (2026-09-16, per Laurie).
    for name in ("about.html", "calendar.html", "directory.html", "instagram.html", "bulletin.html", "tradingpost.html", "signals.html"):
        if (ROOT / name).exists():
            emit_page(ROOT / name, "index.html" if name == "calendar.html" else name)   # calendar (list view) is the landing page
    # keep calendar.html answering too, for old links
    if (ROOT / "calendar.html").exists():
        emit_page(ROOT / "calendar.html", "calendar.html")
    if (ROOT / "skyline.js").exists():
        shutil.copyfile(ROOT / "skyline.js", SITE / "skyline.js")
    if (ROOT / "signals.js").exists():
        shutil.copyfile(ROOT / "signals.js", SITE / "signals.js")
    emit_station_dd()
    emit_phenology_history()
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
