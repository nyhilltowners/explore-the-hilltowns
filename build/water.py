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
        if r.get("loading_tool_kg_yr") is not None:
            rec["kg"] = r.get("loading_tool_kg_yr")
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
    print(f"  Water: DMR unit fingerprinting filled {filled} of {sum(1 for d in out if d['src']=='DMR' and (d['u']=='' or d.get('ui')))} unit-less rows")
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
               if (p.get("tier") or "").startswith("individual") and _fnum(p.get("km_from_ref")) is not None and _fnum(p.get("km_from_ref")) <= 30]
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
                                "n_values", "median_reported", "max_reported", "limit_max", "n_E90", "source",
                                "loading_tool_kg_yr"})
    dmr = aggregate_dmr(dmr_rows, keep_ids)

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
        "geo": geo,
    }
    js = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    site_dir.mkdir(exist_ok=True)
    (site_dir / "data_water.js").write_text("window.WATER = " + js + ";\n", encoding="utf-8")
    print(f"  Water: {len(sites)} nodes, {len(measurements)} measurements, {len(dec_series)} DEC series rows, "
          f"{len(biology)} biology station-years, {len(dmr)} DMR rows, {len(permits)} permits, {len(dams)} dams, "
          f"{len(wells)} wells → data_water.js ({len(js)//1024} KB)")
    if warns is not None:
        warns.extend(WARNS)
    return len(sites)


if __name__ == "__main__":
    import sys
    n = emit_water(ROOT / "site")
    for w in WARNS:
        print("WARNING:", w)
    sys.exit(0 if n else 1)
