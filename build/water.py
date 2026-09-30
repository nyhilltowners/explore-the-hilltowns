"""
water.py — v982 (2026-09-29, Laurie): the Helderberg–Hudson water-quality emitter.

Reads data/water/helderberg_hudson_water_quality.xlsx (the 52-sheet master from the
water-quality research chat) plus data/water/geo/*.geojson and writes site/data_water.js
(`window.WATER = {...}`), loaded only by waterwip.html.

Provenance is carried, not trusted. The workbook's convention is:
    blue font (FF0000FF)  = verbatim from the named source
    black / no colour     = derived by Claude (distances, tags, roll-ups)
    yellow fill (FFFFFF00) = an assumption meant to be edited
Every emitted row carries `_p`: a dict of column → 'd' (derived) or 'a' (assumption) for
the cells that are NOT verbatim. Absent = verbatim. The page uses this to mark numbers,
and the standing rule (brief, "Provenance rule") is: a number that cannot be traced to
a blue cell does not get a headline.

Heavy tables are pre-aggregated here so data_water.js stays small:
    dec_results (17k rows)   → per site × parameter × year medians (chemistry)
                             → per station × year biology scores (BAP, HBI, EPT, NBI-P…)
    dmr_annual (45k rows)    → effluent-gross rows for individual permits ≤ 30 km
    usgs_wells_raw           → not shipped (usgs_wells pivot is enough)
    dmr_results / dmr_limits / loading_tool_* → not shipped (dmr_annual carries them)

Never edits the workbook. Read-only.
"""
from __future__ import annotations

import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
WDIR = ROOT / "data" / "water"
WB = WDIR / "helderberg_hudson_water_quality.xlsx"
GEO = WDIR / "geo"

BLUE = {"FF0000FF", "000000FF", "0000FF"}
YELLOW = {"FFFFFF00", "00FFFF00", "FFFF00"}

WARNS: list[str] = []


def _colour(cell):
    """'v' verbatim, 'a' assumption, 'd' derived."""
    try:
        if cell.fill is not None and cell.fill.fill_type == "solid":
            rgb = cell.fill.fgColor.rgb if cell.fill.fgColor is not None else None
            if isinstance(rgb, str) and rgb.upper() in YELLOW:
                return "a"
        f = cell.font
        if f is not None and f.color is not None and f.color.type == "rgb":
            rgb = f.color.rgb
            if isinstance(rgb, str) and rgb.upper() in BLUE:
                return "v"
    except Exception:  # style access can fail on odd cells
        pass
    return "d"


def _clean(v):
    if v is None:
        return None
    if isinstance(v, float):
        if v != v:  # NaN
            return None
        if v.is_integer() and abs(v) < 1e15:
            return int(v)
        return round(v, 6)
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    if isinstance(v, str):
        s = v.strip()
        return s if s else None
    return v


def read_sheet(wb, name, with_prov=True, limit=None, keep=None):
    """Sheet → list of dict rows (header row 1). `keep` = column whitelist."""
    if name not in wb.sheetnames:
        WARNS.append(f"water: sheet {name!r} missing")
        return []
    ws = wb[name]
    rows = ws.iter_rows(min_row=1, max_row=limit)
    header = [(_clean(c.value) or f"col{i}") for i, c in enumerate(next(rows))]
    keep_idx = None
    if keep:
        keep_idx = [i for i, h in enumerate(header) if h in keep]
    out = []
    for r in rows:
        rec = {}
        prov = {}
        empty = True
        for i, c in enumerate(r):
            if keep_idx is not None and i not in keep_idx:
                continue
            if i >= len(header):
                break
            v = _clean(c.value)
            if v is None:
                continue
            empty = False
            h = header[i]
            rec[h] = v
            if with_prov:
                p = _colour(c)
                if p != "v":
                    prov[h] = p
        if empty:
            continue
        if with_prov and prov:
            rec["_p"] = prov
        out.append(rec)
    return out


def a1_comment(wb, name):
    try:
        c = wb[name]["A1"].comment
        return c.text.strip() if c else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------------
CHEM_PARAMS = {
    "phosphorus", "chlorophyll-a", "secchi_disk_depth", "dissolved_oxygen", "specific_conductance",
    "ph", "chloride", "nitrate_nitrite", "ammonia", "nitrogen", "true_color", "temperature",
    "calcium", "sodium", "alkalinity", "phycocyanin", "hab_percent", "microcystin",
    "dissolved_oxygen_saturation", "total_dissolved_solids", "sulfate", "iron", "manganese",
    "epilimnion_temperature", "hypoliminion_temperature", "hypolimnion_temperature",
}
BIO_PARAMS = {
    "bap_biological_assessment_profile": "bap",
    "hilsenhoff_biotic_index": "hbi",
    "ept_richness": "ept",
    "richness": "rich",
    "nutrient_biotic_index_phosphorus": "nbip",
    "nutrient_biotic_index_nitrogen": "nbin",
    "percent_model_affinity": "pma",
    "habitat_assessment_score": "habitat",
    "habitat_model_affinity_score": "hma",
}


def _fnum(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def aggregate_dec(rows):
    """dec_results → chemistry series + biology stations."""
    chem = defaultdict(list)          # (site, param, unit, year) → values
    chem_depth = defaultdict(list)    # same, bottom-only (depth ≥ 2 m) for DO
    bio = {}                          # (station, year) → dict
    stations = {}                     # station → meta
    for r in rows:
        p = r.get("PARAMETER_NAME")
        v = _fnum(r.get("value"))
        if p is None or v is None:
            continue
        site = r.get("site_id")
        yr = r.get("year")
        try:
            yr = int(yr)
        except (TypeError, ValueError):
            continue
        unit = r.get("UNIT") or ""
        if p in BIO_PARAMS:
            code = r.get("SITE_CODE") or ""
            if unit == "score_0-10" and p != "bap_biological_assessment_profile":
                continue  # keep raw indices; BAP is itself a 0-10 score
            key = (code, yr)
            d = bio.setdefault(key, {"code": code, "site": site, "yr": yr})
            d[BIO_PARAMS[p]] = v
            if code not in stations:
                m = re.match(r"^(\d+)-([A-Z_0-9]+)-(\d+(?:\.\d+)?)$", code)
                stations[code] = {
                    "code": code, "site": site, "name": r.get("WATERBODY_NAME"),
                    "lat": _fnum(r.get("LATITUDE")), "lon": _fnum(r.get("LONGITUDE")),
                    "mile": float(m.group(3)) if m else None,
                    "basin": m.group(1) if m else None,
                }
            continue
        if p not in CHEM_PARAMS:
            continue
        if r.get("portal_table") not in (None, "chemistry", "other"):
            continue
        chem[(site, p, unit, yr)].append(v)
        dep = _fnum(r.get("depth_m"))
        if dep is not None and dep >= 2:
            chem_depth[(site, p, unit, yr)].append(v)

    series = []
    for (site, p, unit, yr), vals in sorted(chem.items()):
        vals = sorted(vals)
        rec = {"site": site, "p": p, "u": unit, "yr": yr, "n": len(vals),
               "med": round(statistics.median(vals), 4), "min": vals[0], "max": vals[-1]}
        deep = chem_depth.get((site, p, unit, yr))
        if deep and p == "dissolved_oxygen":
            rec["deep_min"] = min(deep)
        series.append(rec)
    biol = sorted(bio.values(), key=lambda d: (d["code"], d["yr"]))
    return series, biol, sorted(stations.values(), key=lambda s: s["code"])


PARAM_FAMILY = [
    (re.compile(r"phosph", re.I), "phosphorus"),
    (re.compile(r"ammonia", re.I), "ammonia"),
    (re.compile(r"nitrate|nitrite", re.I), "nitrate/nitrite"),
    (re.compile(r"kjeldahl|nitrogen, organic|nitrogen, total", re.I), "nitrogen (TKN)"),
    (re.compile(r"^BOD|carbonaceous", re.I), "BOD"),
    (re.compile(r"suspended", re.I), "TSS"),
    (re.compile(r"settleable", re.I), "settleable solids"),
    (re.compile(r"dissolved", re.I), "TDS"),
    (re.compile(r"coliform", re.I), "fecal coliform"),
    (re.compile(r"chlorine", re.I), "chlorine"),
    (re.compile(r"flow", re.I), "flow"),
    (re.compile(r"^pH", re.I), "pH"),
    (re.compile(r"oxygen, dissolved|^DO", re.I), "DO"),
    (re.compile(r"oxygen demand", re.I), "oxygen demand"),
    (re.compile(r"temperature", re.I), "temperature"),
    (re.compile(r"copper", re.I), "copper"),
    (re.compile(r"zinc", re.I), "zinc"),
    (re.compile(r"iron", re.I), "iron"),
    (re.compile(r"aluminum", re.I), "aluminum"),
    (re.compile(r"mercury", re.I), "mercury"),
    (re.compile(r"fluoride", re.I), "fluoride"),
    (re.compile(r"selenium", re.I), "selenium"),
    (re.compile(r"thallium", re.I), "thallium"),
    (re.compile(r"phenol", re.I), "phenols"),
    (re.compile(r"oil", re.I), "oil & grease"),
    (re.compile(r"foaming", re.I), "foaming agents"),
    (re.compile(r"methylene", re.I), "methylene chloride"),
]


def family(param):
    for rx, fam in PARAM_FAMILY:
        if rx.search(param or ""):
            return fam
    return (param or "").lower()


def aggregate_dmr(rows, permits_keep):
    """dmr_annual → effluent-gross rows for the permits we draw, tagged with a parameter family.

    The whole sheet is derived (A1 comment: "Derived by Claude from dmr_results"), so no per-row
    `_p`; the table carries `derived: true` at the top level instead.

    EPA's FY2009–2016 bulk extracts carry no unit column, so those rows arrive with a blank unit.
    Rather than guess, a blank unit is filled ONLY when the same permit × outfall × parameter
    family has a later row with a known unit AND the same numeric limit — the limit is the
    fingerprint (a 5 mg/L BOD limit is not a 3.5 lb/d one). Filled rows carry `ui: true`
    (unit inferred) so the page can say so. Rows that cannot be matched keep `u: ""` and are
    drawn unlabelled, never joined to a labelled series.
    """
    out = []
    for r in rows:
        if r.get("permit") not in permits_keep:
            continue
        if r.get("monitoring_location") != "effluent gross":
            continue
        if r.get("n_values") in (None, 0) and r.get("loading_tool_kg_yr") is None:
            continue
        unit = r.get("unit") or ""
        try:
            fy = int(r.get("fy"))
        except (TypeError, ValueError):
            continue
        rec = {
            "permit": r.get("permit"), "fac": r.get("facility"), "out": r.get("outfall"),
            "p": r.get("parameter"), "fam": family(r.get("parameter")), "u": unit,
            "fy": fy, "n": r.get("n_values"), "med": r.get("median_reported"),
            "max": r.get("max_reported"), "lim": r.get("limit_max"), "e90": r.get("n_E90"),
            "src": "LT" if (r.get("source") or "").startswith("EPA Loading") else "DMR",
        }
        if r.get("contaminant_key"):
            rec["ck"] = r.get("contaminant_key")     # v986: the workbook's contaminant key (profiles join)
        if r.get("min_reported") is not None:
            rec["min"] = r.get("min_reported")
        if r.get("loading_tool_kg_yr") is not None:
            rec["kg"] = r.get("loading_tool_kg_yr")
        # v983: the workbook now fills FY2009–2016 units from the permit-limit unit (A1 note: DMR unit == limit unit in
        # 99.98% of rows where both exist). Those rows keep `ui: true` so the page can still say "unit inherited".
        if unit and rec["src"] == "DMR" and fy <= 2016:
            rec["ui"] = True
        out.append(rec)
    # unit fingerprinting for the unit-less FY2009–2016 monthly rows
    known = {}
    for d in out:
        if d["u"] and d["src"] == "DMR" and d["lim"] is not None:
            known.setdefault((d["permit"], d["out"], d["fam"], d["lim"]), set()).add(d["u"])
    filled = 0
    for d in out:
        if d["u"] or d["src"] != "DMR" or d["lim"] is None:
            continue
        units = known.get((d["permit"], d["out"], d["fam"], d["lim"]))
        if units and len(units) == 1:
            d["u"] = next(iter(units))
            d["ui"] = True
            filled += 1
    blank = sum(1 for d in out if d['src'] == 'DMR' and not d['u'])
    print(f"  Water: DMR units — {sum(1 for d in out if d.get('ui'))} rows carry a limit-inherited unit (FY≤2016), fingerprint fallback filled {filled}, {blank} still blank")
    return out


def load_geo(name):
    p = GEO / name
    if not p.exists():
        WARNS.append(f"water: geo/{name} missing")
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        WARNS.append(f"water: geo/{name} unreadable ({e})")
        return None


def round_geo(gj, nd=5):
    """Trim coordinate precision (5 dp ≈ 1 m) to keep the file small."""
    def rc(c):
        if isinstance(c, (int, float)):
            return round(c, nd)
        return [rc(x) for x in c]
    if not gj:
        return gj
    for f in gj.get("features", []):
        g = f.get("geometry")
        if g and "coordinates" in g:
            g["coordinates"] = rc(g["coordinates"])
    return gj


def slim_props(gj, keep):
    if not gj:
        return gj
    for f in gj.get("features", []):
        f["properties"] = {k: v for k, v in (f.get("properties") or {}).items() if k in keep}
    return gj


# ---------------------------------------------------------------------------
PROFILE_SECTIONS = ["What it is", "Who made it, and who still does", "How it gets here", "What it does", "What is not known"]

# v991: world standards. data/water/standards_world.csv — one row per (contaminant, jurisdiction, scope, kind), the number
# exactly as the source states it (unit as written, `url` = the page that states it). Normalised here to one unit per key
# so the page can rank "strictest": lowest level wins, except DO where the standard is a floor and the highest wins.
STD_CANON = {  # key → (canonical unit, factor from each source unit)
    "ng/L": {"ng/L": 1, "µg/L": 1e3, "mg/L": 1e6},
    "µg/L": {"ng/L": 1e-3, "µg/L": 1, "mg/L": 1e3},
    "mg/L": {"ng/L": 1e-6, "µg/L": 1e-3, "mg/L": 1},
    "pCi/L": {"pCi/L": 1, "Bq/L": 27.027},
    "cfu/100 mL": {"cfu/100 mL": 1},
}
STD_UNIT = {"PFOS": "ng/L", "PFOA": "ng/L", "PFHXS": "ng/L", "RADON": "pCi/L", "RADIUM": "pCi/L", "FECAL": "cfu/100 mL",
            "NA": "mg/L", "CL": "mg/L", "NO3": "mg/L", "DO": "mg/L", "TP": "µg/L"}
STD_FLOOR = {"DO"}


def read_world_standards():
    """→ {KEY: [rows]} each row {j, sc, k, lv, u, lvn, un, b, y, n, url, strict}. `lvn` is the level in the key's
    canonical unit (NO3 rows written 'as nitrate ion' are converted to nitrogen ÷ 4.427 and say so in `n`).
    `strict` marks, per (key, scope), the strictest enforceable row(s) ('e') and strictest non-enforceable row(s) ('g')."""
    import csv
    p = WDIR / "standards_world.csv"
    if not p.exists():
        WARNS.append("water: data/water/standards_world.csv missing — no world standards panel")
        return {}
    out = defaultdict(list)
    with p.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            key = r["key"].strip()
            canon = STD_UNIT.get(key, "µg/L")
            lv = float(r["level"]) if r["level"].strip() else None
            u = r["unit"].strip().replace("ug/L", "µg/L")
            note = r["note"].strip()
            lvn, un = None, canon
            if lv is not None:
                if u == "% saturation":
                    un = u; lvn = None            # not comparable to mg/L floors; shown, not ranked
                elif u in STD_CANON[canon]:
                    lvn = round(lv * STD_CANON[canon][u], 6)
                else:
                    WARNS.append(f"water: standards_world {key} {r['jurisdiction']}: unit '{u}' not convertible to {canon}")
                if key == "NO3" and lvn is not None and re.search(r"as (nitrate|NO3)|nitrate ion|mg-NO3", note, re.I) and not re.search(r"as (N|nitrogen)(?![A-Za-z])|nitrate-N", note):                lvn = round(lvn / 4.427, 2); note = note + " · shown as nitrogen (÷ 4.43)"
            flags = ""
            if re.search(r"(from|until|thereafter|effective|applies|compliance|binding)\D{0,40}\b(20(2[7-9]|[3-9]\d))\b", note) or re.search(r"\b(20(2[7-9]|[3-9]\d))\b\D{0,20}(thereafter|onwards)", note):
                flags += "f"          # not yet in force: shown with its date, not ranked
            if key in ("TTHM", "HAA5") and re.search(r"chloroform|bromoform|BDCM|DBCM|dichlorobromo|bromodichloro|\bMCA\b|\bDCA\b|\bTCA\b|chloroacet|monochloroacet|dichloroacet|trichloroacet", r["basis"], re.I):
                flags += "s"          # a single member of the group, not the sum the local number is
            out[key].append({"j": r["jurisdiction"].strip(), "fl": flags, "sc": r["scope"].strip(), "k": r["kind"].strip(), "lv": lv, "u": u,
                             "lvn": lvn, "un": un, "b": r["basis"].strip(), "y": r["year"].strip(), "n": note, "url": r["url"].strip()})
    for key, rows in out.items():
        for sc in {r["sc"] for r in rows}:
            for kinds, tag in ((("enforceable",), "e"), (("guideline", "health goal", "notification/action level", "proposed"), "g")):
                cand = [r for r in rows if r["sc"] == sc and r["k"] in kinds and r["lvn"] is not None and not r["fl"]]
                if not cand:
                    continue
                best = max(cand, key=lambda r: r["lvn"]) if key in STD_FLOOR else min(cand, key=lambda r: r["lvn"])
                for r in cand:
                    if abs(r["lvn"] - best["lvn"]) < 1e-12:
                        r["strict"] = (r.get("strict", "") + tag)
                if tag == "g" and best["lvn"] == 0:      # a zero MCLG is a goal, not a number to compare; also mark the lowest non-zero goal
                    nz = [r for r in cand if r["lvn"] > 0]
                    if nz:
                        nzb = min(nz, key=lambda r: r["lvn"])
                        for r in nz:
                            if abs(r["lvn"] - nzb["lvn"]) < 1e-12:
                                r["strict"] = (r.get("strict", "") + "z")
    return dict(out)


def read_profiles():
    """data/water/contaminant_profiles.md → {KEY: {section: html}}. `## KEY` opens an entry, `### Section` a
    template section. Markdown → HTML with python-markdown when present, else a minimal converter."""
    p = WDIR / "contaminant_profiles.md"
    if not p.exists():
        WARNS.append("water: data/water/contaminant_profiles.md missing — profiles ship without prose")
        return {}
    text = re.sub(r"<!--.*?-->", "", p.read_text(encoding="utf-8"), flags=re.S)
    try:
        import markdown as _md
        conv = lambda t: _md.markdown(t, extensions=[])  # noqa: E731
    except Exception:  # noqa: BLE001
        def conv(t):
            t = html_escape(t)
            t = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', t)
            t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
            t = re.sub(r"\*(.+?)\*", r"<i>\1</i>", t)
            return "".join("<p>" + para.strip().replace("\n", " ") + "</p>" for para in t.split("\n\n") if para.strip())
    out = {}
    cur_key, cur_sec, buf = None, None, []
    def flush():
        if cur_key and cur_sec and buf:
            body = "\n".join(buf).strip()
            if body:
                out.setdefault(cur_key, {})[cur_sec] = conv(body).replace('<a href', '<a target="_blank" rel="noopener" href')
    for line in text.splitlines():
        m2 = re.match(r"^##\s+([A-Z0-9_]+)\s*$", line)
        m3 = re.match(r"^###\s+(.+?)\s*$", line)
        if m2:
            flush(); cur_key, cur_sec, buf = m2.group(1), None, []
        elif m3:
            flush(); cur_sec, buf = m3.group(1), []
        else:
            buf.append(line)
    flush()
    for k, secs in out.items():
        for sname in secs:
            if sname not in PROFILE_SECTIONS:
                WARNS.append(f"water: contaminant_profiles.md › {k} has a non-template section '{sname}' (shown anyway)")
    return out


def html_escape(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def emit_water(site_dir: Path, warns: list | None = None) -> int:
    """Build site/data_water.js. Returns the number of nodes emitted (0 = nothing written)."""
    if not WB.exists():
        (warns if warns is not None else WARNS).append("water: data/water/helderberg_hudson_water_quality.xlsx missing — data_water.js not written")
        return 0
    wb = load_workbook(WB, data_only=True, read_only=False)

    sites = read_sheet(wb, "sites")
    parameters = read_sheet(wb, "parameters")
    measurements = read_sheet(wb, "measurements")
    assessments = read_sheet(wb, "assessments")
    habs_2025 = read_sheet(wb, "habs_2025")
    habs_hist = read_sheet(wb, "ny_habs_2012_2018")
    tmdl = read_sheet(wb, "tmdl_basic_creek")
    tmdl_detail = read_sheet(wb, "tmdl_basic_creek_detail")
    lake_summary = read_sheet(wb, "dec_lake_summer_summary")
    bc_profiles = read_sheet(wb, "dec_basic_creek_profiles")
    hab_toxins = [r for r in read_sheet(wb, "dec_hab_toxins")
                  if re.search(r"microcystin|anatoxin|cylindro|cyanobacteria|total", str(r.get("PARAMETER_NAME")), re.I)]
    wells = read_sheet(wb, "usgs_wells")
    dams = [r for r in read_sheet(wb, "ny_dams") if _fnum(r.get("km_from_ref")) is not None and _fnum(r.get("km_from_ref")) <= 32]
    for d in dams:
        for k in ("ref_lat", "ref_lon", "url"):
            d.pop(k, None)
    permits_all = read_sheet(wb, "echo_cwa_permits")
    permits = [p for p in permits_all
               if ((p.get("tier") or "").startswith("individual") and _fnum(p.get("km_from_ref")) is not None and _fnum(p.get("km_from_ref")) <= 30)
               or p.get("watchlist_note")]   # v983: the brief's 24 watchlist facilities ride along whatever their tier or distance
    keep_ids = {p["npdes_id"] for p in permits if p.get("npdes_id")}
    cslap = read_sheet(wb, "ny_cslap_lakes")
    withdrawals = [r for r in read_sheet(wb, "ny_withdrawals")
                   if re.search(r"albany", str(r.get("Facility Name")), re.I) and re.search(r"city|water", str(r.get("Facility Name")), re.I)]
    withdrawals_by_user = read_sheet(wb, "ny_withdrawals_by_user")
    land_app = read_sheet(wb, "ny_land_application")
    orphan = read_sheet(wb, "ny_orphan_wells")
    mercury = read_sheet(wb, "ny_mercury_summary")
    sources = read_sheet(wb, "sources", with_prov=False)
    references = read_sheet(wb, "references", with_prov=False)
    karst = read_sheet(wb, "karst_sinkholes")
    estuary = read_sheet(wb, "ny_hudson_estuary_segments")
    lake_reports = read_sheet(wb, "ny_lake_reports")

    dec_rows = read_sheet(wb, "dec_results", with_prov=False,
                          keep={"site_id", "WATERBODY_NAME", "SITE_CODE", "LATITUDE", "LONGITUDE", "year",
                                "depth_m", "PARAMETER_NAME", "value", "UNIT", "portal_table"})
    dec_series, biology, stations = aggregate_dec(dec_rows)
    dmr_rows = read_sheet(wb, "dmr_annual", with_prov=False,
                          keep={"permit", "facility", "outfall", "monitoring_location", "parameter", "unit", "fy",
                                "n_values", "min_reported", "median_reported", "max_reported", "limit_max", "n_E90", "source",
                                "loading_tool_kg_yr", "contaminant_key"})
    dmr = aggregate_dmr(dmr_rows, keep_ids)

    # v983 (2026-09-29): EPA TRI (air/land/water releases 1987–2024) and FY2025 regional discharge loads.
    tri_trend = read_sheet(wb, "tri_trend_50mi", with_prov=False)
    tri_mercury = read_sheet(wb, "tri_mercury", with_prov=False)
    tri_fac_rows = read_sheet(wb, "tri_facilities", with_prov=False)
    tri_rel = read_sheet(wb, "tri_releases", with_prov=False,
                         keep={"tri_id", "facility", "city", "lat", "lon", "miles", "industry_sector", "parent_company", "year", "chemical",
                               "stack_air", "fugitive_air", "water", "onsite_release_total", "carcinogen", "pbt", "pfas", "unit", "contaminant_key"})
    coords = {}
    for r in tri_rel:
        if r.get("tri_id") and r.get("lat") is not None and r["tri_id"] not in coords:
            coords[r["tri_id"]] = {"lat": r["lat"], "lon": r["lon"], "sector": r.get("industry_sector"), "parent": r.get("parent_company")}
    tri_fac = {}
    for r in tri_fac_rows:
        if _fnum(r.get("miles")) is None or _fnum(r.get("miles")) > 50:
            continue
        tid = r.get("tri_id")
        f = tri_fac.setdefault(tid, {"id": tid, "name": r.get("facility"), "city": r.get("city"), "county": r.get("county"),
                                     "km": r.get("km_from_ref"), "miles": r.get("miles"), "sector": r.get("industry_sector"),
                                     "years": [], "series": []})
        yr = r.get("year")
        f["years"].append(yr)
        f["series"].append({"y": yr, "air": r.get("air_lb"), "water": r.get("water_lb"), "on": r.get("onsite_total_lb"),
                            "potw": r.get("potw_lb"), "off": r.get("offsite_lb"), "n": r.get("n_chemicals"), "top": r.get("top_chemicals")})
    tri_facilities = []
    for f in tri_fac.values():
        f["series"].sort(key=lambda d: d["y"])
        f["y0"], f["y1"] = min(f["years"]), max(f["years"])
        f["latest"] = f["series"][-1]
        f["peak_air"] = max((d["air"] or 0) for d in f["series"])
        c = coords.get(f["id"], {})
        f["lat"], f["lon"] = c.get("lat"), c.get("lon")
        f["parent"] = c.get("parent")
        if _fnum(f["miles"]) > 30:
            f["series"] = []     # beyond 30 miles: latest + peak only, no per-year series
        del f["years"]
        tri_facilities.append(f)
    tri_facilities.sort(key=lambda f: (_fnum(f["miles"]) or 999, f["name"] or ""))
    # chemical detail for the nearest reporters (≤ 30 mi): per facility × chemical, latest year and peak on-site
    tri_chem = {}
    for r in tri_rel:
        if _fnum(r.get("miles")) is None or _fnum(r.get("miles")) > 30:
            continue
        k = (r["tri_id"], r.get("chemical"))
        d = tri_chem.setdefault(k, {"id": r["tri_id"], "chem": r.get("chemical"), "unit": r.get("unit"), "carc": r.get("carcinogen"), "pbt": r.get("pbt"), "pfas": r.get("pfas"), "ck": r.get("contaminant_key"), "peak": 0, "peak_y": None, "y1": None, "last": None})
        on = _fnum(r.get("onsite_release_total")) or 0
        if on >= d["peak"]:
            d["peak"], d["peak_y"] = on, r.get("year")
        if d["y1"] is None or r.get("year") > d["y1"]:
            d["y1"], d["last"] = r.get("year"), on
    tri_chemicals = sorted(tri_chem.values(), key=lambda d: (d["id"], -d["peak"]))
    # v986: keyed TRI releases — per facility × contaminant × year (air / water / on-site), ≤ 50 mi, for "who releases it"
    tri_keyed = {}
    for r in tri_rel:
        ck = r.get("contaminant_key")
        if not ck or _fnum(r.get("miles")) is None or _fnum(r.get("miles")) > 50:
            continue
        k = (ck, r["tri_id"], r.get("year"))
        d = tri_keyed.setdefault(k, {"ck": ck, "id": r["tri_id"], "fac": r.get("facility"), "city": r.get("city"), "miles": r.get("miles"),
                                     "y": r.get("year"), "air": 0.0, "water": 0.0, "on": 0.0, "unit": r.get("unit")})
        d["air"] += (_fnum(r.get("stack_air")) or 0) + (_fnum(r.get("fugitive_air")) or 0)
        d["water"] += _fnum(r.get("water")) or 0
        d["on"] += _fnum(r.get("onsite_release_total")) or 0
    tri_keyed = sorted(tri_keyed.values(), key=lambda d: (d["ck"], d["id"], d["y"]))

    # v986: contaminant profiles — the workbook's contaminants sheet + long-format results join + hand-written prose
    contaminants = read_sheet(wb, "contaminants")
    cres_rows = read_sheet(wb, "contaminant_results", with_prov=False,
                           keep={"key", "source_sheet", "source_row", "date", "place", "site_id", "medium", "statistic", "value", "unit",
                                 "qualifier", "detection_limit", "standard_applied", "source_url", "note", "lat", "lon"})
    # dictionary-encode the repetitive strings (place, source url, standard, medium) → indices into `cres_dict`
    # dates: normalise to ISO so the page can sort them as strings; 120 ny_mercury_raw rows arrive with no date
    # although that sheet carries a Year — fill from the source row (source_row = Excel row number).
    hg_years = {}
    try:
        for i, r in enumerate(read_sheet(wb, "ny_mercury_raw", with_prov=False, keep={"Year", "BDate"})):
            hg_years[i + 2] = r.get("BDate") or r.get("Year")
    except Exception:  # noqa: BLE001
        pass
    def iso(d, sheet=None, srow=None):
        if d is None or str(d).strip().lower() in ("", "nan", "none", "nat"):
            d = hg_years.get(srow) if sheet == "ny_mercury_raw" else None
            if d is None:
                return None
        d = str(d).strip()
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", d)
        if m:
            return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", d)
        if m:
            return m.group(0)
        m = re.match(r"^(\d{4})(?:\.0)?$", d)
        if m:
            return m.group(1)
        return d
    # v989: coordinates and a per-row link. The join arrives without lat/lon on almost every row; fill them from the
    # sheets the row came from — USGS site number (in `place`) → usgs_wells; DEC site_id → sites; NY Hg synthesis
    # Site_ID → ny_mercury_summary — and give each row an `href` the page can open: USGS station page, DEC portal,
    # the AWQR PDF, or the data.ny.gov dataset. Distance from Rensselaerville computed here (equirectangular).
    well_ll = {str(w.get("sid")): (w.get("lat"), w.get("lon")) for w in wells if w.get("lat") is not None}
    site_ll = {s_.get("site_id"): (s_.get("lat_approx"), s_.get("lon_approx")) for s_ in sites if s_.get("lat_approx") is not None}
    hg_ll = {}
    for m_ in mercury:
        if m_.get("Site_ID") and m_.get("lat") is not None:
            hg_ll.setdefault(m_["Site_ID"], (m_["lat"], m_["lon"]))
    # DEC portal waterbody coordinates (first row per site_id in dec_results)
    dec_ll = {}
    for r in dec_rows:
        if r.get("site_id") and r.get("LATITUDE") is not None and r["site_id"] not in dec_ll:
            dec_ll[r["site_id"]] = (r["LATITUDE"], r["LONGITUDE"])
    REF = (42.515, -74.145)
    def km_from(lat, lon):
        import math
        dlat = (lat - REF[0]) * 111.32; dlon = (lon - REF[1]) * 111.32 * math.cos(math.radians(REF[0]))
        return round(math.sqrt(dlat * dlat + dlon * dlon), 1)
    HG_DATASET = "https://data.ny.gov/Energy-Environment/Synthesis-of-Environmental-Mercury-Loads-in-New-Yo/2ei4-24ka"
    DEC_PORTAL = "https://experience.arcgis.com/experience/1c4bd9f5ad2b4f0a9e6f1a5f4a8f6d1a"
    def locate(r):
        sheet = r.get("source_sheet") or ""; place = str(r.get("place") or ""); sid = r.get("site_id")
        lat = r.get("lat"); lon = r.get("lon"); href = None
        m = re.search(r"USGS well (\d{15})", place)
        if m:
            href = f"https://waterdata.usgs.gov/monitoring-location/USGS-{m.group(1)}/"
            if lat is None and m.group(1) in well_ll:
                lat, lon = well_ll[m.group(1)]
        elif sheet in ("dec_results", "dec_hab_toxins"):
            href = DEC_PORTAL
            if lat is None and sid in dec_ll:
                lat, lon = dec_ll[sid]
            elif lat is None and sid in site_ll:
                lat, lon = site_ll[sid]
        elif sheet == "ny_mercury_raw":
            href = HG_DATASET
            key = place.replace("NY Hg synthesis site ", "").strip()
            if lat is None and key in hg_ll:
                lat, lon = hg_ll[key]
        elif sheet == "measurements":
            u = str(r.get("source_url") or "")
            mm = re.match(r"(https?://\S+)", u)
            href = mm.group(1) if mm else None
            if lat is None and sid in site_ll:
                lat, lon = site_ll[sid]
        if href is None:
            mm = re.match(r"(https?://\S+)", str(r.get("source_url") or ""))
            href = mm.group(1) if mm else None
        return (_fnum(lat), _fnum(lon), href)
    cres, cdict = [], {"pl": [], "url": [], "std": [], "m": [], "sh": [], "st": [], "href": []}
    cidx = {k: {} for k in cdict}
    def enc(field, val):
        if val is None or val == "":
            return None
        if val not in cidx[field]:
            cidx[field][val] = len(cdict[field]); cdict[field].append(val)
        return cidx[field][val]
    for r in cres_rows:
        v = r.get("value")
        if isinstance(v, float):
            v = round(v, 5)
        rec = {"k": r.get("key"), "sh": enc("sh", r.get("source_sheet")), "d": iso(r.get("date"), r.get("source_sheet"), r.get("source_row")), "pl": enc("pl", r.get("place")),
               "s": r.get("site_id"), "m": enc("m", r.get("medium")), "st": enc("st", r.get("statistic")), "v": v, "u": r.get("unit"),
               "q": r.get("qualifier"), "dl": r.get("detection_limit"), "std": enc("std", r.get("standard_applied")),
               "url": enc("url", r.get("source_url")), "n": r.get("note")}
        lat, lon, href = locate(r)
        if lat is not None and lon is not None:
            rec["lat"], rec["lon"], rec["km"] = round(lat, 4), round(lon, 4), km_from(lat, lon)
        rec["href"] = enc("href", href)
        cres.append({k: v for k, v in rec.items() if v is not None})
    hab_by_year = read_sheet(wb, "dec_hab_by_year", with_prov=False)
    # v998: NYC DEP reservoir benchmarks (comparison node) — Schoharie (nearest, 33 km W) and Kensico (terminal), the three
    # analytes that bear on Basic Creek: total phosphorus, turbidity, chlorophyll a. Verbatim DEP columns only.
    nyc_bench = [r for r in read_sheet(wb, "nyc_reservoir_benchmarks", with_prov=False,
                                       keep=["report_year", "reservoir", "analyte", "unit", "single_sample_max", "n_samples",
                                             "n_exceed_ssm", "pct_exceed_ssm", "annual_mean_standard", "annual_mean_reported",
                                             "annual_mean_num", "censoring_method", "source_doc", "source_url"])
                 if r.get("reservoir") in ("Schoharie", "Kensico") and r.get("analyte") in ("Total phosphorus", "Turbidity", "Chlorophyll a")]
    profiles = read_profiles()
    world_std = read_world_standards()
    # v995: diagram captions ("how to read this") — data/water/molecules.csv; the SVGs themselves are drawn by
    # scripts/draw_molecules.py into images/contaminants/<key>.svg and committed (the build needs no RDKit)
    mol_caption = {}
    mp = WDIR / "molecules.csv"
    if mp.exists():
        import csv as _csv
        with mp.open(newline="", encoding="utf-8") as f:
            for r in _csv.DictReader(f):
                mol_caption[r["key"].strip()] = r["caption"].strip()
                if not (ROOT / "images" / "contaminants" / f"{r['key'].strip().lower()}.svg").exists():
                    WARNS.append(f"water: no diagram images/contaminants/{r['key'].strip().lower()}.svg — run scripts/draw_molecules.py")
    regional_top10 = read_sheet(wb, "regional_top10_fy2025", with_prov=False)

    comments = {n: a1_comment(wb, n) for n in wb.sheetnames}
    comments = {k: v for k, v in comments.items() if v}

    geo = {
        "nodes": round_geo(load_geo("nodes.geojson")),
        "basin": round_geo(load_geo("basic_creek_res_basin.geojson"), 4),
        "aquifers": slim_props(round_geo(load_geo("nys_unconsolidated_aquifers_250k_clip.geojson"), 4), {"GPM", "NAME", "AQUIFER", "gpm", "name"}),
        "karst_albsch": round_geo(load_geo("albsch_karst_sinkholes_centroids.geojson")),
        "karst_albsch_cov": round_geo(load_geo("albsch_covered_karst_candidates_centroids.geojson")),
        "karst_schomont": round_geo(load_geo("schomont_karst_sinkholes_centroids.geojson")),
        "karst_schomont_cov": round_geo(load_geo("schomont_covered_karst_candidates_centroids.geojson")),
    }

    payload = {
        "generated": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "ref": {"name": "Rensselaerville hamlet", "lat": 42.515, "lon": -74.145, "elev_ft": 1500,
                "note": "every km_from_ref column measures from here (Hannacroix / Catskill Creek divide)"},
        "provenance": {"v": "verbatim from the named source (blue cell)", "d": "derived by Claude (black cell)",
                       "a": "assumption meant to be edited (yellow cell)",
                       "rule": "a number that cannot be traced to a verbatim cell does not get a headline"},
        "sheet_notes": comments,
        "sites": sites, "parameters": parameters, "measurements": measurements, "assessments": assessments,
        "habs_2025": habs_2025, "habs_hist": habs_hist, "tmdl": tmdl, "tmdl_detail": tmdl_detail,
        "lake_summary": lake_summary, "bc_profiles": bc_profiles, "hab_toxins": hab_toxins,
        "dec_series": dec_series, "biology": biology, "stations": stations,
        "wells": wells, "dams": dams, "permits": permits, "dmr": dmr, "dmr_derived": True,
        "cslap": cslap, "withdrawals": withdrawals, "withdrawals_by_user": withdrawals_by_user,
        "land_application": land_app, "orphan_wells": orphan, "mercury": mercury,
        "karst": karst, "estuary": estuary, "lake_reports": lake_reports,
        "sources": sources, "references": references,
        "tri_trend": tri_trend, "tri_mercury": tri_mercury, "tri_facilities": tri_facilities, "tri_chemicals": tri_chemicals,
        "tri_keyed": tri_keyed, "contaminants": contaminants, "cres": cres, "cres_dict": cdict, "hab_by_year": hab_by_year, "nyc_bench": nyc_bench, "profiles": profiles, "world_std": world_std, "mol_caption": mol_caption,
        "regional_top10": regional_top10,
        "geo": geo,
    }
    js = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    site_dir.mkdir(exist_ok=True)
    (site_dir / "data_water.js").write_text("window.WATER = " + js + ";\n", encoding="utf-8")
    print(f"  Water: {len(sites)} nodes, {len(measurements)} measurements, {len(dec_series)} DEC series rows, "
          f"{len(biology)} biology station-years, {len(dmr)} DMR rows, {len(permits)} permits, {len(dams)} dams, "
          f"{len(wells)} wells, {len(tri_facilities)} TRI facilities, {len(regional_top10)} regional-load rows, "
          f"{len(contaminants)} contaminants / {len(cres)} keyed results / {len(profiles)} written profiles → data_water.js ({len(js)//1024} KB)")
    if warns is not None:
        warns.extend(WARNS)
    return len(sites)


if __name__ == "__main__":
    import sys
    n = emit_water(ROOT / "site")
    for w in WARNS:
        print("WARNING:", w)
    sys.exit(0 if n else 1)
