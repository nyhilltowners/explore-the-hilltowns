/* water.js — v982 (2026-09-29, Laurie): the Helderberg–Hudson water-quality dashboard (waterwip.html).
   Reads window.WATER (site/data_water.js, built by build/water.py from data/water/helderberg_hudson_water_quality.xlsx).
   Idiom: Signs + Signals — white on ink, gold for headings and the live pill, one validated chain colour per transect.
   Every panel is plain SVG built from strings; hover tooltips everywhere; a table view where a chart carries numbers.
   Provenance: rows carry _p = {column: 'd'|'a'} for cells that are not verbatim; pv() renders the superscript. */
(function () {
  'use strict';
  var W = window.WATER;
  var $ = function (id) { return document.getElementById(id); };
  var status = function (m) { var s = $('wq-status'); if (s) s.textContent = m || ''; };
  if (!W) { status('data_water.js did not load — run the build (python3 build/build.py) so site/data_water.js exists.'); return; }

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt = function (v, d) { if (v == null || v === '' || isNaN(v)) return '—'; var n = +v; if (d == null) d = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : Math.abs(n) >= 1 ? 2 : 3; return n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }); };
  var pv = function (row, col) { var p = row && row._p && row._p[col]; if (!p) return ''; return '<span class="pv ' + p + '" title="' + (p === 'a' ? 'assumption in the workbook, meant to be edited' : 'derived in the workbook, not copied from a source') + '">' + (p === 'a' ? '~' : 'd') + '</span>'; };
  var by = function (arr, k) { var o = {}; (arr || []).forEach(function (r) { (o[r[k]] = o[r[k]] || []).push(r); }); return o; };
  var uniq = function (arr) { return arr.filter(function (v, i, a) { return a.indexOf(v) === i; }); };
  var mix = function (hex, t) { /* t: 0 = colour, 1 = white */ var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); var f = function (c) { return Math.round(c + (255 - c) * t); }; return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; };

  /* ---------- palette (validated: scripts/validate_palette.js, dark surface #00004d) ---------- */
  var COL = { north: '#3987e5', south: '#d95926', potic: '#199e70', other: '#c98500', divide: '#ffffff', compare: '#b9bde6' };
  var TXNAME = { north: 'North · Basic Creek → Alcove → Hannacroix → Hudson at Coeymans', south: 'South · Myosotis → Ten Mile → Catskill Creek → Hudson at Catskill', potic: 'Potic → Hudson at Coxsackie', divide: 'The divide (shared headwater)', other: 'Off-transect lakes (control series)', compare: 'Comparison system, off-transect (drawn beside, never on, the strips)' };
  var ZONECOL = { 'plateau (Hilltowns)': '#199e70', 'Catskill Creek valley / Greene': '#c98500', 'Albany lowland / Hudson': '#d55181' };
  var GOLD = '#fca315', RED = '#ff8a8a', AMBER = '#f5c04a', GREEN = '#5fd39a', GREY = '#b9bde6';

  /* ---------- tooltips ---------- */
  function tipper(id) {
    var el = $(id);
    return {
      show: function (evt, html) { if (!el) return; el.innerHTML = html; el.style.display = 'block'; this.move(evt); },
      move: function (evt) { if (!el) return; var host = el.parentNode; var r = host.getBoundingClientRect(); var x = evt.clientX - r.left + 14, y = evt.clientY - r.top + 14; if (x + el.offsetWidth > r.width - 4) x = evt.clientX - r.left - el.offsetWidth - 14; if (y + el.offsetHeight > r.height + 40) y = evt.clientY - r.top - el.offsetHeight - 10; el.style.left = Math.max(0, x) + 'px'; el.style.top = Math.max(0, y) + 'px'; },
      hide: function () { if (el) el.style.display = 'none'; }
    };
  }
  function bindTips(container, tip, dataAttr) {
    if (!container) return;
    container.addEventListener('mousemove', function (e) { var t = e.target.closest ? e.target.closest('[' + dataAttr + ']') : null; if (t) tip.show(e, t.getAttribute(dataAttr)); else tip.hide(); });
    container.addEventListener('mouseleave', function () { tip.hide(); });
  }

  /* ---------- node model ---------- */
  var SITES = W.sites.slice();
  var S = {}; SITES.forEach(function (s) { S[s.site_id] = s; });
  function txOf(s) { if (/comparison/i.test(s.symbol_hint || '') || s.site_id === 'NYC_DEP_PWS') return 'compare'; var w = s.watershed || ''; if (/^Divide/.test(w)) return 'divide'; if (/Hannacroix\/Coxsackie/.test(w)) return 'potic'; if (/Hannacroix Creek/.test(w)) return 'north'; if (/Catskill Creek/.test(w)) return 'south'; return 'other'; }
  function elevApprox(s) { var src = s.elev_source || ''; return !/3DEP[^|]*exact coords/i.test(src); } /* the sites sheet's yellow fill was not cleared when 3DEP values replaced estimates — the elev_source text is the honest flag */
  function statusOf(s) { var d = (s.data_status || '').toLowerCase(); if (/rich/.test(d)) return 'rich'; if (/moderate/.test(d)) return 'mod'; if (/thin|via awqr/.test(d)) return 'thin'; return 'none'; }
  function shapeOf(s) { var t = s.node_type || '', src = s.source_type || ''; if (t === 'public_water_system') return { shape: 'diamond', nest: /reservoir|lake|stream/.test(src) ? 'circle' : 'tri', hatch: /GWUDI/.test(src) }; if (t === 'point_source') return { shape: 'cross' }; if (/well/.test(t)) return { shape: 'tri' }; if (t === 'stream') return { shape: 'line' }; return { shape: 'circle' }; }
  var MEAS = by(W.measurements, 'site_id'), ASSESS = by(W.assessments, 'site_id'), HABS25 = by(W.habs_2025, 'site_id'), LAKESUM = by(W.lake_summary, 'site_id'), SERIES = by(W.dec_series, 'site'), PARAMS = {};
  W.parameters.forEach(function (p) { PARAMS[p.parameter] = p; });
  var PERMIT = {}; W.permits.forEach(function (p) { PERMIT[p.npdes_id] = p; });
  var SITE_PERMIT = { GREENVILLE_WWTP: 'NY0094854', CAMP_MALKA_WWTP: 'NY0269093' };
  var SITE_DAM = { BASIC_CREEK_RES: 'Basic Creek Dam', ALCOVE_RES: 'Alcove Dam', MYOSOTIS_LAKE: 'Myosotis Lake Dam', ONDERDONK_LAKE: 'Onderdonk Lake Dam', POTIC_RES: 'Potic Reservoir Dam', WARNERS_LAKE: 'Warners Lake Dam', THOMPSONS_LAKE: 'Thompsons Lake Dam', LAWSON_LAKE: 'Nancy Lawson Dam' };
  var DAM = {}; W.dams.forEach(function (d) { DAM[d.dam_name] = d; });
  var HABHIST = {}; W.habs_hist.forEach(function (h) { (HABHIST[h['Waterbody Name']] = HABHIST[h['Waterbody Name']] || []).push(h); });
  var LAKEREP = {}; W.lake_reports.forEach(function (r) { LAKEREP[r.site_name] = r; });
  function lakeName(s) { return (s.name || '').replace(/\s*\(.*$/, ''); }

  function headline(s) {
    /* One number, its standard, and whether it is verbatim. Candidates: every measurement row with a value, plus the
       DEC summer-lake rows (TP against the 20 µg/L guidance). A violation wins; otherwise the newest year's value that
       sits closest to its standard. HAB-report counts and permit facts are fallbacks, never the headline when a real
       measurement exists. "Finished water" is only ever a public-water-system node; everything else is raw ambient. */
    var finished = s.node_type === 'public_water_system';
    var rows = (MEAS[s.site_id] || []).filter(function (m) { return m.value != null && !isNaN(m.value) && !/HAB reports/i.test(m.parameter); }).map(function (m) {
      return { kind: finished ? 'finished' : 'ambient', label: m.parameter, value: m.value, unit: m.unit, pct: m.standard_value ? m.value / m.standard_value : null, std: m.standard_value, stdType: m.standard_type, year: +m.sample_year || 0, date: m.sample_date, row: m, stat: m.statistic, viol: /^YES/i.test(m.violation || '') };
    });
    (LAKESUM[s.site_id] || []).forEach(function (l) { if (l.tp_summer_mean_ugL != null) rows.push({ kind: 'ambient', label: 'Summer total phosphorus (DEC)', value: l.tp_summer_mean_ugL, unit: 'µg/L', pct: l.tp_summer_mean_ugL / 20, std: 20, stdType: 'guidance', year: +l.yr, row: l, stat: 'summer mean, n=' + (l.tp_n || '?'), viol: false, pcol: 'tp_summer_mean_ugL' }); });
    var viol = rows.filter(function (r) { return r.viol; });
    if (viol.length) return viol.sort(function (a, b) { return b.year - a.year; })[0];
    if (rows.length) {
      var yr = Math.max.apply(null, rows.map(function (r) { return r.year; }));
      var recent = rows.filter(function (r) { return r.year >= yr - 1 && r.pct != null; });
      if (!recent.length) recent = rows.filter(function (r) { return r.pct != null; });
      if (!recent.length) recent = rows.filter(function (r) { return r.year >= yr - 1; });
      return recent.sort(function (a, b) { return (b.pct || 0) - (a.pct || 0) || b.year - a.year; })[0];
    }
    var p = PERMIT[SITE_PERMIT[s.site_id]];
    if (p) return { kind: 'permit', label: 'Effluent exceedances, last 3 yr (EPA ECHO)', value: p.effluent_violations_3yr, unit: '', pct: null, year: null, row: p, stat: p.design_flow_mgd != null ? 'design flow ' + p.design_flow_mgd + ' MGD' : '' };
    var h = (HABS25[s.site_id] || [])[0];
    if (h) return { kind: 'hab', label: 'HAB reports, 2025 (DEC)', value: h.n_reports, unit: '', pct: null, year: 2025, row: h, stat: h.first_report + ' → ' + h.last_report };
    var hm = (MEAS[s.site_id] || []).filter(function (m) { return /HAB reports/i.test(m.parameter); })[0];
    if (hm) return { kind: 'hab', label: 'HAB reports (DEC)', value: hm.value, unit: 'per year', pct: null, year: +hm.sample_year, row: hm, stat: hm.sample_date || '' };
    return null;
  }
  function badge(s, hl) {
    var a = (ASSESS[s.site_id] || []).filter(function (r) { return /impaired/i.test(r.use_assessment || ''); });
    if (a.length) return { cls: 'bad', txt: '⚠ Impaired (DEC)' };
    var rows = MEAS[s.site_id] || [];
    if (rows.some(function (m) { return /^YES/i.test(m.violation || ''); })) return { cls: 'bad', txt: '⚠ MCL violation' };
    if (rows.some(function (m) { return /AL exceeded|exceeds EPA/i.test(m.violation || ''); })) return { cls: 'warn', txt: '◐ Action level / EPA limit exceeded' };
    if (hl && hl.pct != null && hl.pct >= 1) return { cls: 'bad', txt: '⚠ Above guidance' };
    if (hl && hl.pct != null && hl.pct >= 0.8) return { cls: 'warn', txt: '◐ Near standard' };
    if (hl && hl.kind === 'permit') return hl.value > 0 ? { cls: 'warn', txt: '◐ ' + hl.value + ' effluent exceedances' } : { cls: 'ok', txt: '✓ No exceedances' };
    if (hl && hl.kind === 'hab') return { cls: 'warn', txt: '◐ Blooms reported' };
    if (rows.length || hl) return { cls: 'ok', txt: '✓ Within standards' };
    return { cls: 'none', txt: '○ No public data' };
  }
  function latestYear(s) { var ys = []; (MEAS[s.site_id] || []).forEach(function (m) { if (m.sample_year) ys.push(+m.sample_year); }); (LAKESUM[s.site_id] || []).forEach(function (l) { ys.push(+l.yr); }); (SERIES[s.site_id] || []).forEach(function (r) { ys.push(+r.yr); }); if (s.latest_data_year) ys.push(+s.latest_data_year); return ys.length ? Math.max.apply(null, ys) : null; }

  /* ---------- glyphs ---------- */
  function glyph(s, x, y, r, col, forCard) {
    var sh = shapeOf(s), st = statusOf(s);
    var fill = st === 'rich' ? col : st === 'mod' ? col : 'none', fo = st === 'mod' ? .45 : 1, sw = st === 'none' ? 1.4 : st === 'thin' ? 2.6 : 2, dash = st === 'none' ? ' stroke-dasharray="3 2"' : '';
    var g = '';
    var base = 'stroke="' + col + '" stroke-width="' + sw + '" fill="' + fill + '" fill-opacity="' + fo + '"' + dash;
    if (sh.shape === 'circle') g += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" ' + base + '/>';
    else if (sh.shape === 'tri') g += '<path d="M' + x + ' ' + (y - r * 1.1) + ' L' + (x + r * 1.1) + ' ' + (y + r * .8) + ' L' + (x - r * 1.1) + ' ' + (y + r * .8) + ' Z" ' + base + '/>';
    else if (sh.shape === 'line') g += '<path d="M' + (x - r * 1.4) + ' ' + y + ' q ' + (r * .7) + ' -' + (r * .6) + ' ' + (r * 1.4) + ' 0 t ' + (r * 1.4) + ' 0" stroke="' + col + '" stroke-width="' + (sw + 1) + '" fill="none" stroke-linecap="round"' + dash + '/>';
    else if (sh.shape === 'cross') g += '<path d="M' + (x - r * .8) + ' ' + (y - r * .8) + ' L' + (x + r * .8) + ' ' + (y + r * .8) + ' M' + (x + r * .8) + ' ' + (y - r * .8) + ' L' + (x - r * .8) + ' ' + (y + r * .8) + '" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/>';
    else if (sh.shape === 'diamond') {
      if (sh.nest === 'circle') g += '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 1.35) + '" stroke="' + col + '" stroke-width="1.4" fill="none" stroke-opacity=".8"/>';
      if (sh.nest === 'tri') { if (sh.hatch) g += '<defs><pattern id="hatch' + (forCard ? 'c' : '') + s.site_id + '" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="' + col + '" stroke-width="1.2"/></pattern></defs>'; g += '<path d="M' + x + ' ' + (y - r * 1.6) + ' L' + (x + r * 1.6) + ' ' + (y + r * 1.1) + ' L' + (x - r * 1.6) + ' ' + (y + r * 1.1) + ' Z" stroke="' + col + '" stroke-width="1.4" fill="' + (sh.hatch ? 'url(#hatch' + (forCard ? 'c' : '') + s.site_id + ')' : 'none') + '" stroke-opacity=".8"/>'; }
      g += '<path d="M' + x + ' ' + (y - r * .85) + ' L' + (x + r * .85) + ' ' + y + ' L' + x + ' ' + (y + r * .85) + ' L' + (x - r * .85) + ' ' + y + ' Z" ' + base + '/>';
    }
    return g;
  }

  /* ---------- 0 · contaminant profiles (v986) ---------- */
  var GROUP_ORDER = ['metal', 'geogenic', 'geogenic/human', 'human', 'synthetic', 'disinfection byproduct', 'nutrient', 'biological', 'physical'];
  var GROUP_LABEL = { metal: 'Metals', geogenic: 'Geogenic', 'geogenic/human': 'Geogenic + human', human: 'Human', synthetic: 'Man-made', 'disinfection byproduct': 'Disinfection byproducts', nutrient: 'Nutrients', biological: 'Biological', physical: 'Physical' };
  var LB2KG = 0.45359237;
  function cresRow(r) { var D = W.cres_dict; return { k: r.k, sh: r.sh != null ? D.sh[r.sh] : '', d: r.d || '', pl: r.pl != null ? D.pl[r.pl] : '', s: r.s, m: r.m != null ? D.m[r.m] : '', st: r.st != null ? String(D.st[r.st]).replace(/\s*depth nan m\s*/i, '').trim() : '', v: r.v, u: r.u || '', q: r.q || '', dl: r.dl, std: r.std != null ? D.std[r.std] : '', url: r.url != null ? D.url[r.url] : '', href: r.href != null ? D.href[r.href] : '', n: String(r.n || '').replace(/^aquifer nan$/, ''), lat: r.lat, lon: r.lon, km: r.km }; }
  var SRC_LABEL = { usgs_wells_raw: 'USGS station', dec_results: 'DEC portal', dec_hab_toxins: 'DEC portal', ny_mercury_raw: 'NY Hg synthesis', measurements: 'report' };
  function normU(u) { return String(u || '').toLowerCase().replace('ug', 'µg').replace(/\s*(ww|dw|fw)$/, '').replace('ppm', 'mg/kg').replace('µg/g', 'mg/kg').replace('mg/l', 'mg/L').trim(); }
  function stdNumber(std) { var m = /([\d.,]+)\s*(ng\/L|µg\/L|ug\/L|mg\/L|mg\/kg|pCi\/L|ppm|µg\/g|\/100 ?mL)/i.exec(std || ''); return m ? { v: parseFloat(m[1].replace(/,/g, '')), u: m[2] } : null; }

  /* v991: world standards — the strictest numbers on earth for this substance (data/water/standards_world.csv, normalised
     in water.py to one unit per key; DO is a floor so the highest wins). Headline per scope: strictest enforceable limit,
     strictest goal/guideline (and the lowest non-zero one when the strictest is a zero MCLG); full table under <details>. */
  var SCOPE_ORDER = ['drinking water', 'recreational water', 'lake water', 'stream (aquatic life)', 'groundwater', 'fish tissue', 'indoor air'];
  var KIND_LABEL = { 'enforceable': 'enforceable', 'guideline': 'guideline', 'health goal': 'health goal', 'notification/action level': 'action level', 'proposed': 'proposed' };
  function fmtStd(r) { return (r.lvn != null ? fmt(r.lvn) + ' ' + r.un : (r.lv != null ? fmt(r.lv) + ' ' + esc(r.u) : 'none set')); }
  function worldHTML(key, isFloor) {
    var rows = (W.world_std || {})[key]; if (!rows || !rows.length) return null;
    var link = function (r, txt) { return r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + txt + '</a>' : txt; };
    var who = function (r) { return esc(r.j) + (r.y ? ' ' + esc(r.y) : ''); };
    var scopes = SCOPE_ORDER.filter(function (sc) { return rows.some(function (r) { return r.sc === sc && r.strict; }); });
    var head = scopes.map(function (sc) {
      var E = rows.filter(function (r) { return r.sc === sc && /e/.test(r.strict || ''); });
      var G = rows.filter(function (r) { return r.sc === sc && /g/.test(r.strict || ''); });
      var Z = rows.filter(function (r) { return r.sc === sc && /z/.test(r.strict || ''); });
      var line = function (list, lbl) { if (!list.length) return ''; var r0 = list[0]; return '<div><b>' + lbl + '</b> <span class="num">' + fmtStd(r0) + '</span> — ' + list.map(function (r) { return link(r, who(r)); }).join(', ') + (r0.n ? ' <small>' + esc(r0.n) + '</small>' : '') + '</div>'; };
      return '<div class="cp-world-scope"><span class="sc">' + esc(sc) + (isFloor ? ' · floor' : '') + '</span>' + line(E, 'Strictest enforceable limit:') + line(G, 'Strictest goal or guideline:') + (Z.length ? line(Z, 'Lowest non-zero goal:') : '') + '</div>';
    }).join('');
    var sorted = rows.slice().sort(function (a, b) { var sa = SCOPE_ORDER.indexOf(a.sc), sb = SCOPE_ORDER.indexOf(b.sc); if (sa !== sb) return sa - sb; if (a.lvn == null) return 1; if (b.lvn == null) return -1; return isFloor ? b.lvn - a.lvn : a.lvn - b.lvn; });
    var tab = '<table class="ddtab"><thead><tr><th>Jurisdiction</th><th>Applies to</th><th>Kind</th><th>Level as written</th><th>Same unit</th><th>Basis</th><th>Note</th></tr></thead><tbody>' + sorted.map(function (r) {
      var cls = /e/.test(r.strict || '') ? ' class="strict"' : '';
      var flag = (r.fl && /f/.test(r.fl) ? '<span class="pv a" title="not yet in force">soon</span>' : '') + (r.fl && /s/.test(r.fl) ? '<span class="pv d" title="a single member of the group, not the sum the local number is">one</span>' : '');
      return '<tr' + cls + '><td class="l">' + link(r, esc(r.j)) + (r.y ? ' <span style="opacity:.7">' + esc(r.y) + '</span>' : '') + '</td><td class="l">' + esc(r.sc) + '</td><td class="l">' + esc(KIND_LABEL[r.k] || r.k) + '</td><td>' + (r.lv != null ? fmt(r.lv) + ' ' + esc(r.u) : '<span class="nd">none set</span>') + flag + '</td><td>' + (r.lvn != null && (r.u !== r.un || r.lvn !== r.lv) ? fmt(r.lvn) + ' ' + esc(r.un) : '') + '</td><td class="l">' + esc(r.b) + '</td><td class="l">' + esc(r.n) + '</td></tr>';
    }).join('') + '</tbody></table>';
    return { head: '<div class="sg-eye" style="margin-top:10px">Strictest on earth</div><div class="cp-world">' + head + '</div>', table: '<div class="cp-world"><details><summary>all ' + rows.length + ' standards on record for ' + esc(key) + ' · source per row</summary>' + tab + '<p class="sg-note">Levels converted to one unit per substance for the ranking; "soon" = adopted but not yet in force; "one" = a limit on a single member of the group (a single trihalomethane, one haloacetic acid), not the sum the local results report. Enforceable = a legal limit with compliance consequences; a goal has none. New York and EPA rows are in the table so the gap is visible.</p></details></div>' };
  }
  function drawContaminants() {
    var C = W.contaminants || []; if (!C.length) { $('cp').innerHTML = '<p class="sg-det">No contaminants sheet in the workbook.</p>'; return; }
    var byKey = {}; C.forEach(function (c) { byKey[c.key] = c; });
    /* three shelves; order within a shelf = workbook order */
    var SHELVES = [
      { id: 'min', label: 'Metals & minerals', groups: ['metal', 'geogenic', 'geogenic/human', 'human'] },
      { id: 'chem', label: 'Man-made chemicals', groups: ['synthetic', 'disinfection byproduct'] },
      { id: 'bio', label: 'Biological & nutrients', groups: ['biological', 'nutrient', 'physical'] }
    ];
    SHELVES.forEach(function (sh) { sh.keys = C.filter(function (c) { return sh.groups.indexOf(c.group) >= 0; }).map(function (c) { return c.key; }); });
    var orphans = C.filter(function (c) { return !SHELVES.some(function (sh) { return sh.keys.indexOf(c.key) >= 0; }); }); if (orphans.length) SHELVES[0].keys = SHELVES[0].keys.concat(orphans.map(function (c) { return c.key; }));
    var shelfOf = function (key) { return SHELVES.filter(function (sh) { return sh.keys.indexOf(key) >= 0; })[0] || SHELVES[0]; };
    $('cp-tabs').innerHTML = SHELVES.map(function (sh) { return '<button type="button" role="tab" data-shelf="' + sh.id + '">' + esc(sh.label) + '<span class="n">' + sh.keys.length + '</span></button>'; }).join('');
    var tip = tipper('cp-tip'); var cur = null, dir = 0;
    function render(key) {
      var c = byKey[key]; if (!c) return;
      var sh = shelfOf(key), idx = sh.keys.indexOf(key); cur = key;
      $('cp-tabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-shelf') === sh.id); });
      $('cp-chips').innerHTML = sh.keys.map(function (k) { var cc = byKey[k]; return '<button type="button" data-key="' + esc(k) + '" class="' + (k === key ? 'on' : '') + '" title="' + esc(cc.summary || '') + '">' + esc(cc.name) + '<span class="n">' + (cc.n_results || 0) + '</span></button>'; }).join('');
      var pr = (W.profiles || {})[key] || {};
      var rows = (W.cres || []).filter(function (r) { return r.k === key; }).map(cresRow);
      var wh = worldHTML(key, key === 'DO');
      var dsrc = 'images/contaminants/' + esc(key.toLowerCase()) + '.svg', dcap = (W.mol_caption || {})[key];
      var o = '<div class="cp-top"><div class="cp-fig"><a class="cp-img" id="cp-img" href="' + dsrc + '" target="_blank" rel="noopener" title="open the diagram full size"><span class="ph">diagram · ' + esc(c.name) + '</span><img alt="' + esc(c.name) + ' diagram" src="' + dsrc + '" onload="this.parentNode.classList.add(\'has-img\')" onerror="this.remove()"></a>' + (dcap ? '<p class="cp-cap"><b>How to read this.</b> ' + esc(dcap) + '</p>' : '') + '</div><div><div class="cp-pos">' + esc(sh.label) + ' · ' + (idx + 1) + ' of ' + sh.keys.length + '</div><div class="cp-head"><h3>' + esc(c.name) + '</h3><span class="kind">' + esc(GROUP_LABEL[c.group] || c.group || '') + (c.cas ? ' · CAS ' + esc(c.cas) : '') + '</span>' + (c.first_date ? '<span class="kind">on record ' + esc(String(c.first_date).slice(0, 4)) + '–' + esc(String(c.last_date).slice(0, 4)) + '</span>' : '') + '</div>';
      o += '<div class="cp-sum">' + esc(c.summary || '') + '</div>' + (c.standards ? '<div class="sg-eye" style="margin-top:8px">Standards it is judged against</div><ul class="cp-std">' + String(c.standards).split(/;\s*/).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + (wh ? wh.head : '') + '</div></div>' + (wh ? wh.table : '');
      /* What it is */
      o += '<h4>What it is</h4>';
      if (pr['What it is']) o += '<div class="prose">' + pr['What it is'] + '</div>';
      else o += '<div class="prose"><p>' + esc(c.natural_occurrence || '') + (c.persistence ? ' ' + esc(c.persistence) + '.' : '') + '</p><p class="todo">Full entry to be written; the summary and standards above are from the workbook.</p></div>';
      /* Who made it (man-made chemicals; v991) */
      if (pr['Who made it, and who still does']) o += '<h4>Who made it, and who still does <span class="sub">discovery · uses · makers then and now</span></h4><div class="prose">' + pr['Who made it, and who still does'] + '</div>';
      /* How / What it does */
      o += '<h4>How it gets here</h4>' + (pr['How it gets here'] ? '<div class="prose">' + pr['How it gets here'] + '</div>' : '<p class="todo">To be written.</p>');
      o += '<h4>What it does <span class="sub">people · plants and animals</span></h4>' + (pr['What it does'] ? '<div class="prose">' + pr['What it does'] + '</div>' : '<p class="todo">To be written.</p>');
      /* Where it has been found */
      var meds = {}; rows.forEach(function (r) { meds[r.m] = (meds[r.m] || 0) + 1; });
      var det = rows.filter(function (r) { return /^detected/.test(r.q); }).length, nd = rows.filter(function (r) { return /not detected/.test(r.q); }).length;
      o += '<h4>Where it has been found <span class="sub">' + rows.length + ' result' + (rows.length == 1 ? '' : 's') + ' on record · ' + det + ' detected · ' + nd + ' not detected · newest first</span></h4>';
      if (!rows.length) o += '<p class="todo">No measurement of this substance within the study area is in the record.</p>';
      else {
        o += '<div class="med-tog" id="cp-med">' + Object.keys(meds).sort(function (a, b) { return meds[b] - meds[a]; }).map(function (m) { return '<label><input type="checkbox" checked data-med="' + esc(m) + '">' + esc(m) + ' <span style="opacity:.7">' + meds[m] + '</span></label>'; }).join('') + '</div>';
        o += '<div id="cp-res"></div>';
      }
      /* Who releases it */
      var tk = (W.tri_keyed || []).filter(function (t) { return t.ck === key; }); var dk = (W.dmr || []).filter(function (d) { return d.ck === key && d.src === 'DMR'; });
      o += '<h4>Who releases it <span class="sub">kg per year · air from EPA TRI (self-reported, within 50 mi) · water from discharge reports (permits within 30 km + the watchlist)</span></h4>';
      if (!tk.length && !dk.length) o += '<p class="todo">' + (pr['Who releases it'] ? '' : 'No reported release of this substance is in the record' + (c.group === 'biological' || c.group === 'physical' ? ' — it is made in the water, not discharged into it; see the phosphorus entry for what feeds it.' : '.')) + '</p>';
      if (tk.length) {
        var fac = by(tk, 'id'); var trows = Object.keys(fac).map(function (id) { var ser = fac[id].sort(function (a, b) { return a.y - b.y; }); var last = ser[ser.length - 1]; var pk = ser.reduce(function (a, r) { return r.on > a.on ? r : a; }, ser[0]); var grams = /gram/i.test(last.unit || ''); var f = function (v) { return grams ? v / 1000 : v * LB2KG; }; return { fac: last.fac, city: last.city, miles: last.miles, last: last, pk: pk, kgAir: f(last.air), kgWater: f(last.water), kgOn: f(last.on), kgPeak: f(pk.on), yrs: ser.length, y0: ser[0].y, id: id }; }).sort(function (a, b) { return b.kgOn - a.kgOn || b.kgPeak - a.kgPeak; });
        var zeros = trows.filter(function (r) { return !r.kgPeak; }); trows = trows.filter(function (r) { return r.kgPeak; });
        o += '<table class="ddtab"><thead><tr><th>To air &amp; land — facility</th><th>mi</th><th>latest year</th><th>to air, kg</th><th>to water, kg</th><th>on-site total, kg</th><th>peak on-site, kg (year)</th><th>years filed</th></tr></thead><tbody>' + trows.map(function (r) { return '<tr><td class="l"><a href="https://enviro.epa.gov/facts/tri/ef-facilities/#/Facility/' + esc(r.id) + '" target="_blank" rel="noopener">' + esc(r.fac) + '</a><small style="display:block;opacity:.75">' + esc(r.city) + '</small></td><td>' + r.miles + '</td><td>' + r.last.y + '</td><td>' + fmt(r.kgAir, 2) + '</td><td>' + fmt(r.kgWater, 2) + '</td><td>' + fmt(r.kgOn, 2) + '</td><td>' + fmt(r.kgPeak, 1) + ' <span style="opacity:.7">(' + r.pk.y + ')</span></td><td>' + r.yrs + ' <span style="opacity:.7">since ' + r.y0 + '</span></td></tr>'; }).join('') + '</tbody></table>' + (zeros.length ? '<p class="sg-note">' + zeros.length + ' more facilit' + (zeros.length == 1 ? 'y' : 'ies') + ' filed this substance with zero release in every year: ' + zeros.map(function (r) { return esc(r.fac) + ' (' + esc(r.city) + ')'; }).join(', ') + '.</p>' : '');
      }
      if (dk.length) {
        var per = {}; dk.forEach(function (d) { var k = d.permit + '|' + d.out; var p = per[k] = per[k] || { permit: d.permit, fac: d.fac, out: d.out, conc: [], mass: [] }; if (/lb\/d/i.test(d.u)) p.mass.push(d); else if (/g\/d/i.test(d.u)) p.mass.push(d); else p.conc.push(d); });
        var drows = Object.keys(per).map(function (k) { var p = per[k]; var lastM = p.mass.sort(function (a, b) { return a.fy - b.fy; }).slice(-1)[0]; var lastC = p.conc.sort(function (a, b) { return a.fy - b.fy; }).slice(-1)[0]; var kg = null; if (lastM && lastM.med != null) kg = /^g\/d/i.test(lastM.u) ? lastM.med * 365 / 1000 : lastM.med * 365 * LB2KG; var peakM = p.mass.reduce(function (a, r) { return (r.med || 0) > (a ? a.med || 0 : -1) ? r : a; }, null); var kgPeak = peakM ? (/^g\/d/i.test(peakM.u) ? peakM.med * 365 / 1000 : peakM.med * 365 * LB2KG) : null; var over = lastC && lastC.lim != null && (key === 'DO' ? lastC.med < lastC.lim : lastC.med > lastC.lim); var pm = PERMIT[p.permit]; return { p: p, lastM: lastM, lastC: lastC, kg: kg, kgPeak: kgPeak, peakM: peakM, over: over, km: pm ? pm.km_from_ref : null, recv: pm ? pm.receiving_water : '' }; }).sort(function (a, b) { return (b.kg || 0) - (a.kg || 0) || ((b.lastC ? b.lastC.med : 0) - (a.lastC ? a.lastC.med : 0)); });
        o += '<table class="ddtab"><thead><tr><th>To water — permit · outfall</th><th>receiving water</th><th>km</th><th>latest median (limit)</th><th>latest year max</th><th>kg / yr (from lb/d median)</th><th>peak kg / yr (year)</th></tr></thead><tbody>' + drows.map(function (r) { var lc = r.lastC || r.lastM; return '<tr><td class="l"><a href="https://echo.epa.gov/detailed-facility-report?fid=' + esc(r.p.permit) + '" target="_blank" rel="noopener">' + esc(r.p.fac) + '</a><small style="display:block;opacity:.75">' + esc(r.p.permit) + ' · outfall ' + esc(r.p.out) + '</small></td><td class="l">' + esc(r.recv || '') + '</td><td>' + (r.km != null ? fmt(r.km, 1) : '') + '</td><td>' + (lc ? '<span' + (r.over ? ' class="over"' : '') + '>' + fmt(lc.med) + ' ' + esc(lc.u) + '</span> <span style="opacity:.7">FY' + lc.fy + (lc.lim != null ? (key === 'DO' ? ' · floor ' : ' · limit ') + fmt(lc.lim) : ' · no limit') + '</span>' + (lc.ui ? '<span class="pv d" title="unit inherited from the permit limit">u</span>' : '') : '') + '</td><td>' + (lc && lc.max != null ? fmt(lc.max) + ' ' + esc(lc.u) : '') + '</td><td>' + (r.kg != null ? fmt(r.kg, 3) + ' <span style="opacity:.7">FY' + r.lastM.fy + '</span>' : '<span style="opacity:.6">concentration only</span>') + '</td><td>' + (r.kgPeak != null ? fmt(r.kgPeak, 3) + ' <span style="opacity:.7">(' + r.peakM.fy + ')</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table><p class="sg-note">Water loads are the annual median of monthly mass reports × 365, so a plant that files concentration only shows none; a red median is above its own permit limit. Air and land figures are what the facility filed on EPA Form R; pounds converted to kilograms, dioxin-family grams left in grams ÷ 1,000.</p>';
      }
      /* What is not known */
      o += '<h4>What is not known</h4>' + (pr['What is not known'] ? '<div class="prose">' + pr['What is not known'] + '</div>' : '<p class="todo">To be written.</p>');
      var el = $('cp'); el.className = 'cp' + (dir > 0 ? ' slide-l' : dir < 0 ? ' slide-r' : ''); el.innerHTML = o; dir = 0;
      if (rows.length) { var draw = function () { var on = {}; $('cp-med').querySelectorAll('input').forEach(function (i) { on[i.getAttribute('data-med')] = i.checked; }); var rs = rows.filter(function (r) { return on[r.m]; }).sort(function (a, b) { return (b.d || '0').localeCompare(a.d || '0'); }); var LIM = 60; var body = function (list) { return list.map(function (r) { var sn = stdNumber(r.std); var isND = /not detected/.test(r.q); var val = isND ? '<span class="nd">not detected' + (r.dl != null ? ' (&lt; ' + fmt(r.dl) + ' ' + esc(r.u) + ')' : '') + '</span>' : (r.v != null ? (r.v === 0 && r.dl == null ? '<span class="nd" title="the source reports a zero with no detection limit; read as below detection">0 ' + esc(r.u) + ' (reported as zero)</span>' : '<span' + (sn && r.v > sn.v && normU(sn.u) === normU(r.u) ? ' class="over"' : '') + '>' + fmt(r.v) + ' ' + esc(r.u) + '</span>') : '—') + (r.q && !/^detected$/.test(r.q) && !isND ? ' <span style="opacity:.7;font-size:10.5px">' + esc(r.q) + '</span>' : ''); return '<tr><td class="l">' + esc(r.d || '<i>no date</i>') + '</td><td class="l">' + esc(r.pl) + (r.lat != null ? '<small style="display:block;opacity:.75">' + (r.km != null ? r.km + ' km from Rensselaerville · ' : '') + '<a href="https://www.openstreetmap.org/?mlat=' + r.lat + '&mlon=' + r.lon + '#map=13/' + r.lat + '/' + r.lon + '" target="_blank" rel="noopener">' + r.lat.toFixed(3) + ', ' + r.lon.toFixed(3) + '</a></small>' : '') + '</td><td class="l">' + esc(r.m) + (r.m === 'finished water' ? '<span class="fin">tap</span>' : '') + (r.st && r.st !== r.m ? '<small style="display:block;opacity:.7">' + esc(r.st) + '</small>' : '') + '</td><td>' + val + '</td><td class="l">' + esc(r.std) + '</td><td class="l">' + (r.href ? '<a href="' + esc(r.href) + '" target="_blank" rel="noopener">' + esc(SRC_LABEL[r.sh] || r.sh) + '</a>' : esc(SRC_LABEL[r.sh] || r.sh)) + (r.sh === 'measurements' && r.url && !/^https?:/.test(r.url) ? '<small style="display:block;opacity:.7">' + esc(r.url) + '</small>' : '') + (r.n ? '<small style="display:block;opacity:.7">' + esc(r.n) + '</small>' : '') + '</td></tr>'; }).join(''); }; $('cp-res').innerHTML = '<table class="ddtab"><thead><tr><th>Date</th><th>Place</th><th>Sampled</th><th>Result</th><th>Judged against</th><th>Source</th></tr></thead><tbody>' + body(rs.slice(0, LIM)) + '</tbody></table>' + (rs.length > LIM ? '<button type="button" class="sg-btn ghost" id="cp-more" style="margin-top:8px">show all ' + rs.length + ' rows</button>' : ''); var mb = $('cp-more'); if (mb) mb.addEventListener('click', function () { $('cp-res').querySelector('tbody').innerHTML = body(rs); mb.remove(); }); }; draw(); $('cp-med').addEventListener('change', draw); }
      try { history.replaceState(null, '', '#c=' + key); } catch (e) { /* noop */ }
    }
    function step(n) { var sh = shelfOf(cur), i = sh.keys.indexOf(cur) + n; if (i < 0) { var p = SHELVES[(SHELVES.indexOf(sh) + SHELVES.length - 1) % SHELVES.length]; dir = -1; render(p.keys[p.keys.length - 1]); return; } if (i >= sh.keys.length) { var nx = SHELVES[(SHELVES.indexOf(sh) + 1) % SHELVES.length]; dir = 1; render(nx.keys[0]); return; } dir = n; render(sh.keys[i]); }
    $('cp-chips').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-key]') : null; if (b) { var sh = shelfOf(cur); dir = sh.keys.indexOf(b.getAttribute('data-key')) > sh.keys.indexOf(cur) ? 1 : -1; render(b.getAttribute('data-key')); } });
    $('cp-tabs').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-shelf]') : null; if (!b) return; var sh = SHELVES.filter(function (x) { return x.id === b.getAttribute('data-shelf'); })[0]; if (sh && sh.keys.length) { dir = 1; render(sh.keys[0]); } });
    $('cp-prev').addEventListener('click', function () { step(-1); }); $('cp-next').addEventListener('click', function () { step(1); });
    $('cp').addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); } if (e.key === 'ArrowRight') { step(1); e.preventDefault(); } });
    (function () { var x0 = null, y0 = null; var st = $('cp'); st.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true }); st.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); x0 = y0 = null; }, { passive: true }); })();
    var m = /[#&]c=([A-Z0-9_]+)/.exec(location.hash || ''); render(m && byKey[m[1]] ? m[1] : 'HG');
  }

  /* ---------- 1 · transects ---------- */
  var CHAINS = {
    north: ['PLATEAU_WELLS', 'BASIC_CREEK_STREAM', 'BASIC_CREEK_RES', 'ALCOVE_RES', 'ALBANY_CITY_PWS'],
    south: ['PLATEAU_WELLS', 'MYOSOTIS_LAKE', 'RENSSELAERVILLE_WD', 'GREENVILLE_WD', 'CAIRO_WD', 'CATSKILL_CREEK', 'CATSKILL_VILLAGE_PWS'],
    potic: ['POTIC_RES', 'CATSKILL_VILLAGE_PWS']
  };
  var SIDE = { GREENVILLE_WWTP: 'ALCOVE_RES', CAMP_MALKA_WWTP: 'ALCOVE_RES', LAWSON_LAKE: 'ALCOVE_RES', USGS_A2183: null, BKW_SCHOOL_PWS: null };
  function drawTransects() {
    var Wd = 1000, H = 700, top = 46, bot = 590, ELMAX = 1800;
    var y = function (e) { return top + (1 - Math.min(e, ELMAX) / ELMAX) * (bot - top); };
    var colX = { north: 330, south: 640, potic: 870, divide: 480, other: 110 };
    var pos = {}, out = [];
    SITES.forEach(function (s) { var t = txOf(s); if (t === 'compare') return; /* v998: comparison nodes (NYC) stay off the transect */ var e = s.elev_ft_approx; var unk = (e == null || e === 0) && t !== 'other'; pos[s.site_id] = { s: s, tx: t, x: colX[t], y: unk ? bot + 36 : y(+e || 0), unk: unk, side: SIDE[s.site_id] !== undefined }; });
    /* side nodes nudge off the chain column */
    pos.GREENVILLE_WWTP.x = colX.north + 68; pos.CAMP_MALKA_WWTP.x = colX.north + 68; pos.LAWSON_LAKE.x = colX.north - 66; pos.USGS_A2183.x = colX.divide + 112; pos.BKW_SCHOOL_PWS.x = colX.divide - 112;
    pos.BKW_SCHOOL_PWS.y = pos.PLATEAU_WELLS.y; pos.PLATEAU_WELLS.y = y(1500);
    /* collision avoidance per column (34 px) */
    var cols = {}; Object.keys(pos).forEach(function (k) { var p = pos[k]; (cols[p.x] = cols[p.x] || []).push(p); });
    Object.keys(cols).forEach(function (x) { var arr = cols[x].sort(function (a, b) { return a.y - b.y; }); for (var i = 1; i < arr.length; i++) { if (arr[i].y - arr[i - 1].y < 34) arr[i].y = arr[i - 1].y + 34; } });
    /* elevation grid */
    for (var e = 0; e <= ELMAX; e += 300) out.push('<line class="grid" x1="40" x2="' + (Wd - 10) + '" y1="' + y(e) + '" y2="' + y(e) + '"/><text class="elev" x="36" y="' + (y(e) + 3) + '" text-anchor="end">' + e.toLocaleString() + ' ft</text>');
    /* Hudson baseline */
    out.push('<path class="flow" d="M60 ' + (bot + 36) + ' q 20 -8 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke="' + GREY + '" stroke-opacity=".7"/>');
    out.push('<text class="hud" x="' + (Wd - 12) + '" y="' + (bot + 58) + '" text-anchor="end">Hudson River · tidal, sea level</text>');
    /* column heads */
    [['north', 'North transect'], ['divide', 'Divide'], ['south', 'South transect'], ['potic', 'Potic'], ['other', 'Off-transect lakes']].forEach(function (c) { out.push('<text class="col" fill="' + COL[c[0]] + '" x="' + colX[c[0]] + '" y="' + (top - 22) + '" text-anchor="middle">' + c[1] + '</text>'); });
    /* flow lines */
    Object.keys(CHAINS).forEach(function (t) { var ch = CHAINS[t]; for (var i = 1; i < ch.length; i++) { var a = pos[ch[i - 1]], b = pos[ch[i]]; if (!a || !b) continue; out.push('<path class="flow" stroke="' + COL[t] + '" d="M' + a.x + ' ' + (a.y + 12) + ' C ' + a.x + ' ' + ((a.y + b.y) / 2) + ', ' + b.x + ' ' + ((a.y + b.y) / 2) + ', ' + b.x + ' ' + (b.y - 12) + '"/>'); } });
    Object.keys(SIDE).forEach(function (k) { var to = SIDE[k]; if (!to) return; var a = pos[k], b = pos[to]; out.push('<path class="flow" stroke="' + COL[a.tx] + '" stroke-dasharray="4 4" d="M' + a.x + ' ' + (a.y + 12) + ' C ' + a.x + ' ' + ((a.y + b.y) / 2) + ', ' + b.x + ' ' + ((a.y + b.y) / 2) + ', ' + b.x + ' ' + (b.y - 12) + '" marker-end="url(#arw)"/>'); });
    out.push('<defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="' + GREY + '"/></marker></defs>');
    /* nodes */
    Object.keys(pos).forEach(function (k) { var p = pos[k], s = p.s, col = COL[p.tx], hl = headline(s), yr = latestYear(s); var labelLeft = (p.tx === 'north' && !/WWTP/.test(k)) || k === 'BKW_SCHOOL_PWS'; var lx = labelLeft ? p.x - 20 : p.x + 20, anc = labelLeft ? 'end' : 'start'; var name = lakeName(s).replace('Helderberg plateau private wells', 'Plateau private wells').replace('City of Albany water system', 'City of Albany tap').replace('Village of Catskill water system', 'Village of Catskill tap').replace('Greenville (T) WWTP — SPDES NY0094854', 'Greenville WWTP').replace('Camp Malka wastewater plant — SPDES NY0269093', 'Camp Malka plant').replace('Greenville Water District No. 1', 'Greenville WD').replace('Basic Creek (stream, 6 DEC sites)', 'Basic Creek'); var elevTxt = p.unk ? 'elevation not in record' : (elevApprox(s) ? '~' : '') + (+s.elev_ft_approx).toLocaleString() + ' ft'; var tip = '<b>' + esc(s.name) + '</b><br>' + esc(s.node_type.replace(/_/g, ' ')) + ' · ' + esc((s.source_type || '').replace(/_/g, ' ')) + '<br>' + elevTxt + ' · data: ' + esc(s.data_status || '—') + (hl ? '<br>' + esc(hl.label) + ': ' + fmt(hl.value) + ' ' + esc(hl.unit) + (hl.year ? ' (' + hl.year + ')' : '') : '') + '<br><i>click for the card</i>'; out.push('<g class="nd" data-site="' + k + '" data-tip="' + esc(tip) + '"><g class="g">' + glyph(s, p.x, p.y, 9, col) + '</g><text class="nm" x="' + lx + '" y="' + (p.y + 1) + '" text-anchor="' + anc + '">' + esc(name) + '</text><text class="yr" x="' + lx + '" y="' + (p.y + 12) + '" text-anchor="' + anc + '">' + (yr ? 'newest ' + yr : 'no data') + (p.unk ? '' : ' · ' + elevTxt) + '</text></g>'); });
    SITES.filter(function (s) { return txOf(s) === 'compare'; }).forEach(function (s, i) { var bx = Wd - 232, by = top + 4 + i * 52; out.push('<g class="nd" data-site="' + s.site_id + '" data-tip="' + esc('<b>' + esc(s.name) + '</b><br>' + esc(s.notes || '') + '<br><i>click for the card</i>') + '"><rect x="' + bx + '" y="' + by + '" width="222" height="42" rx="8" fill="rgba(185,189,230,.06)" stroke="' + COL.compare + '" stroke-dasharray="5 4"/><text class="nm" x="' + (bx + 12) + '" y="' + (by + 17) + '">' + esc(s.name.replace(/ \(.*$/, '').replace(/ — comparison node/, '')) + '</text><text class="yr" x="' + (bx + 12) + '" y="' + (by + 32) + '">comparison · 33 km W · not on the transect</text></g>'); });
    $('tx').innerHTML = '<svg class="tx-svg" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Two transects from the Westerlo divide to the Hudson, nodes placed by elevation">' + out.join('') + '</svg>';
    var tip = tipper('tx-tip'); bindTips($('tx'), tip, 'data-tip');
    $('tx').addEventListener('click', function (e) { var g = e.target.closest ? e.target.closest('[data-site]') : null; if (!g) return; openCard(g.getAttribute('data-site')); });
    $('tx-legend').innerHTML = ['north', 'south', 'potic', 'divide', 'other', 'compare'].map(function (t) { return '<span><i style="color:' + COL[t] + '"></i>' + esc(TXNAME[t]) + '</span>'; }).join('') + '<span><i class="hollow" style="color:#fff"></i>no data</span><span><i class="hollow" style="color:#fff;border-width:3px"></i>thin</span><span><i style="color:#fff"></i>rich</span>';
  }

  /* ---------- 2 · cards ---------- */
  var PGROUP = { nutrient: 'Nutrients', disinfection_byproduct: 'Disinfection byproducts', metal_geogenic: 'Geogenic metals', PFAS: 'PFAS', metal_plumbing: 'Plumbing metals', ion: 'Ions', radionuclide: 'Radionuclides', physical: 'Physical', VOC: 'Volatile organics', biological: 'Biological', metal: 'Metals', other: 'Other' };
  function groupOf(name) { var p = PARAMS[name]; if (p && p.parameter_group) return p.parameter_group; if (/PF|dioxane/i.test(name)) return 'PFAS'; if (/TTHM|HAA|trihalo|haloacetic/i.test(name)) return 'disinfection_byproduct'; if (/lead|copper/i.test(name)) return 'metal_plumbing'; if (/phosph|nitr/i.test(name)) return 'nutrient'; if (/radium|alpha|radon|uranium/i.test(name)) return 'radionuclide'; if (/iron|mangan|arsenic|barium|nickel|chrom|antim|selen/i.test(name)) return 'metal_geogenic'; if (/turbid|TOC|organic carbon|colour|color/i.test(name)) return 'physical'; if (/sodium|chloride|fluoride|sulfate/i.test(name)) return 'ion'; if (/xylene|methane|benz|chloro/i.test(name)) return 'VOC'; if (/HAB|microcystin/i.test(name)) return 'biological'; return 'other'; }
  function bloomStrip(s) {
    var h = (HABS25[s.site_id] || [])[0]; var hist = HABHIST[lakeName(s)] || [];
    if (!h && !hist.length) return '';
    var Wd = 300, x0 = 26, x1 = Wd - 4, doy = function (d) { var t = new Date(d); return (Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5; };
    var xs = function (d) { return x0 + (Math.min(Math.max(doy(d), 152), 334) - 152) / (334 - 152) * (x1 - x0); };
    var o = '<svg viewBox="0 0 ' + Wd + ' 34"><text class="m" x="0" y="11">2025</text>';
    ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].forEach(function (m, i) { o += '<text class="m" x="' + (x0 + i / 6 * (x1 - x0)) + '" y="32">' + m + '</text><line x1="' + (x0 + i / 6 * (x1 - x0)) + '" x2="' + (x0 + i / 6 * (x1 - x0)) + '" y1="2" y2="22" stroke="rgba(255,255,255,.15)"/>'; });
    o += '<line x1="' + x0 + '" x2="' + x1 + '" y1="8" y2="8" stroke="rgba(255,255,255,.25)"/>';
    if (h) o += '<rect x="' + xs(h.first_report) + '" y="4" width="' + Math.max(3, xs(h.last_report) - xs(h.first_report)) + '" height="8" rx="2" fill="' + GREY + '"/><text class="m" x="' + Math.min(x1 - 60, xs(h.last_report) + 4) + '" y="11">' + h.n_reports + ' report' + (h.n_reports == 1 ? '' : 's') + '</text>';
    var yrs = uniq(hist.map(function (r) { return +r.Year; })).sort();
    if (yrs.length) o += '<text class="m" x="0" y="22">2012–18</text>' + yrs.map(function (yr) { var r = hist.filter(function (q) { return +q.Year === yr; })[0]; var c = r['Bloom Type'] === 'HT' ? RED : r['Bloom Type'] === 'C' ? AMBER : GREY; var a = xs(new Date(r['Date of First Listing'])), b = xs(new Date(r['Date of Last Listing'])); return '<rect x="' + a + '" y="15" width="' + Math.max(3, b - a) + '" height="5" rx="1.5" fill="' + c + '" fill-opacity=".85"><title>' + yr + ' · ' + esc(r.bloom_type_meaning) + '</title></rect>'; }).join('');
    return '<div class="bloom">' + o + '</svg></div>';
  }
  function cardHTML(s) {
    var t = txOf(s), col = COL[t], hl = headline(s), b = badge(s, hl), yr = latestYear(s), stale = (hl && hl.year && hl.year < 2021) || (!hl && yr && yr < 2021);
    var front = '<div class="top"><div class="gl"><svg viewBox="0 0 40 40">' + glyph(s, 20, 20, 10, col, true) + '</svg></div><div><div class="ttl">' + esc(s.name) + '</div><div class="kind">' + esc(s.node_type.replace(/_/g, ' ')) + ' · ' + esc((s.source_type || '').replace(/_/g, ' ')) + (s.town ? ' · ' + esc(s.town) : '') + '</div></div></div>';
    front += '<div class="row">' + (t === 'compare' ? '<span class="chip na">comparison · 33 km W, across the Schoharie divide</span>' : '') + '<span class="chip ' + b.cls + '">' + b.txt + '</span>' + (stale ? '<span class="chip stale">⏱ headline from ' + (hl && hl.year ? hl.year : yr) + '</span>' : '') + (yr ? '<span class="chip na">newest data ' + yr + '</span>' : '') + '</div>';
    if (hl) {
      var pct = hl.pct != null ? Math.round(hl.pct * 100) + '% of ' + esc(hl.stdType || 'standard') : '';
      front += '<div class="hl"><div class="sg-eye">' + esc(hl.label) + (hl.kind === 'finished' ? ' · finished water (tap)' : hl.kind === 'ambient' ? ' · raw ambient' : '') + '</div><div class="sg-val">' + fmt(hl.value) + pv(hl.row, 'value') + '<span class="c">' + esc(hl.unit) + (pct ? ' · ' + pct + pv(hl.row, 'pct_of_standard') : '') + '</span></div><div class="sg-det">' + esc(hl.stat || '') + (hl.date ? ' · ' + esc(hl.date) : hl.year ? ' · ' + hl.year : '') + (hl.row && hl.row.source_doc ? ' · ' + (hl.row.source_url ? '<a href="' + esc(hl.row.source_url) + '" target="_blank" rel="noopener">' + esc(hl.row.source_doc) + '</a>' : esc(hl.row.source_doc)) : '') + '</div></div>';
    } else front += '<div class="hl"><div class="sg-eye">Headline</div><div class="sg-det">' + esc(s.topline_summary || 'Nothing in the public record for this node.') + '</div></div>';
    front += bloomStrip(s);
    /* back */
    var back = '';
    var rows = MEAS[s.site_id] || [];
    if (rows.length) {
      var groups = by(rows.map(function (m) { m._g = groupOf(m.parameter); return m; }), '_g');
      back += '<div class="grp">Finished water — measurements (' + rows.length + ')</div><table class="ddtab"><thead><tr><th>Parameter</th><th>Value</th><th>Standard</th><th>% of std</th><th>Date</th><th>Source</th></tr></thead><tbody>';
      Object.keys(groups).sort(function (a, c) { return (PGROUP[a] || a).localeCompare(PGROUP[c] || c); }).forEach(function (g) { back += '<tr><td class="l" colspan="6" style="color:' + GOLD + ' !important;font-size:10px;letter-spacing:.12em;text-transform:uppercase">' + esc(PGROUP[g] || g) + '</td></tr>'; groups[g].sort(function (a, c) { return (c.sample_year || 0) - (a.sample_year || 0); }).forEach(function (m) { var pct = m.pct_of_standard != null ? Math.round(m.pct_of_standard * 100) + '%' : '—'; var vio = /^YES/i.test(m.violation || '') ? ' <span class="chip bad">viol.</span>' : /exceed/i.test(m.violation || '') ? ' <span class="chip warn">AL</span>' : ''; var ndp = /NOT DETECTED/i.test(m.note || ''); back += '<tr><td class="l">' + esc(m.parameter) + (m.statistic ? '<br><span style="font-size:10.5px;opacity:.75">' + esc(m.statistic) + '</span>' : '') + (m.note && !ndp ? '<br><span style="font-size:10.5px;opacity:.75">' + esc(m.note) + '</span>' : '') + '</td><td>' + (ndp ? '<span class="nd">not detected</span>' : (m.range_min != null ? fmt(m.range_min) + '–' : '') + fmt(m.value) + pv(m, 'value') + ' ' + esc(m.unit || '')) + vio + '</td><td>' + (m.standard_value != null ? fmt(m.standard_value) + ' <span style="font-size:10px;opacity:.75">' + esc(m.standard_type || '') + '</span>' : '—') + '</td><td>' + pct + pv(m, 'pct_of_standard') + '</td><td>' + esc(m.sample_date || m.sample_year || '') + '</td><td class="l">' + (m.source_url ? '<a href="' + esc(m.source_url) + '" target="_blank" rel="noopener">' + esc(m.source_doc || 'source') + '</a>' : esc(m.source_doc || '')) + '</td></tr>'; }); });
      back += '</tbody></table>';
    }
    var ls = LAKESUM[s.site_id] || [];
    if (ls.length) { back += '<div class="grp">Raw ambient — DEC summer lake summary</div><table class="ddtab"><thead><tr><th>Year</th><th>TP µg/L</th><th>n</th><th>TP max</th><th>Chl-a µg/L</th><th>Secchi m</th><th>DO min mg/L</th><th>% of 20</th></tr></thead><tbody>' + ls.sort(function (a, c) { return a.yr - c.yr; }).map(function (l) { return '<tr><td class="l">' + l.yr + '</td><td>' + fmt(l.tp_summer_mean_ugL, 1) + '</td><td>' + fmt(l.tp_n, 0) + '</td><td>' + fmt(l.tp_max_ugL, 1) + '</td><td>' + fmt(l.chla_summer_mean_ugL, 1) + '</td><td>' + fmt(l.secchi_summer_mean_m, 2) + '</td><td>' + fmt(l.do_min_mgL, 2) + '</td><td>' + (l.tp_pct_of_20_guidance != null ? Math.round(l.tp_pct_of_20_guidance * 100) + '%' + pv(l, 'tp_pct_of_20_guidance') : '—') + '</td></tr>'; }).join('') + '</tbody></table>'; }
    var ser = SERIES[s.site_id] || [];
    if (ser.length) { var yrs = uniq(ser.map(function (r) { return r.yr; })).sort(); var ps = uniq(ser.map(function (r) { return r.p; })); back += '<div class="grp">Raw ambient — DEC portal samples on file</div><div class="wd">' + ser.reduce(function (n, r) { return n + r.n; }, 0).toLocaleString() + ' values · ' + yrs.length + ' year' + (yrs.length == 1 ? '' : 's') + ' (' + yrs[0] + (yrs.length > 1 ? '–' + yrs[yrs.length - 1] : '') + ') · ' + ps.map(function (p) { return p.replace(/_/g, ' '); }).join(', ') + '</div>'; }
    var as = ASSESS[s.site_id] || [];
    if (as.length && as.some(function (r) { return r.pollutant && r.pollutant !== '—'; })) { back += '<div class="grp">DEC assessment (WI/PWL)</div><table class="ddtab"><thead><tr><th>Use</th><th>Assessment</th><th>Pollutant</th><th>Listed</th><th>Category</th></tr></thead><tbody>' + as.map(function (r) { return '<tr><td class="l">' + esc(r.best_use || '') + '</td><td>' + esc(r.use_assessment || '') + '</td><td>' + esc(r.pollutant || '') + '</td><td>' + esc(r.listing_303d_year || '') + '</td><td class="l">' + esc(r.ir_category || '') + ' ' + esc(r.ir_meaning || '') + '</td></tr>'; }).join('') + '</tbody></table>' + (as[0].source_url ? '<div class="wd"><a href="' + esc(as[0].source_url) + '" target="_blank" rel="noopener">DEC factsheet ' + esc(as[0].dec_segment_id || '') + '</a>' + (as[0].factsheet_update ? ' · updated ' + esc(as[0].factsheet_update) : '') + '</div>' : ''); }
    var dm = DAM[SITE_DAM[s.site_id]];
    if (dm) back += '<div class="grp">Impoundment — DEC Inventory of Dams</div><div class="wd">' + esc(dm.dam_name) + ' · ' + esc(dm.hazard_class || '') + ' · <b>' + esc(dm.LastConditionRating || 'not rated') + '</b>' + (dm.LastInspection ? ' (inspected ' + esc(dm.LastInspection) + ')' : '') + (dm.YEARBUILT ? ' · built ' + esc(dm.YEARBUILT) : '') + (dm.normal_storage_acft ? ' · ' + fmt(dm.normal_storage_acft, 0) + ' ac-ft normal storage' : '') + (dm.drainage_area_sqmi ? ' · drains ' + fmt(dm.drainage_area_sqmi, 1) + ' sq mi' : '') + '</div>';
    var pm = PERMIT[SITE_PERMIT[s.site_id]];
    if (pm) back += '<div class="grp">EPA ECHO — Clean Water Act permit ' + esc(pm.npdes_id) + '</div><div class="wd">' + esc(pm.facility) + ' · receiving water ' + esc(pm.receiving_water || '—') + ' · design flow ' + (pm.design_flow_mgd != null ? pm.design_flow_mgd + ' MGD' : '—') + ' · compliance ' + esc(pm.compliance_status || '—') + ' · ' + esc(pm.effluent_violations_3yr) + ' effluent exceedances (3 yr) · ' + esc(pm.qtrs_noncompliance_12) + ' of 12 quarters non-compliant' + (pm.dfr_url ? ' · <a href="' + esc(pm.dfr_url) + '" target="_blank" rel="noopener">detailed facility report</a>' : '') + '<br>See the outfall panel below for the discharge series.</div>';
    var rep = LAKEREP[lakeName(s)] || LAKEREP[s.name];
    if (rep && rep.report_link) back += '<div class="wd" style="margin-top:8px"><a href="' + esc(rep.report_link) + '" target="_blank" rel="noopener">DEC lake monitoring report</a></div>';
    if (s.notes) back += '<div class="grp">Notes</div><div class="wd">' + esc(s.notes) + '</div>';
    back += '<div class="wd" style="margin-top:8px;opacity:.8">' + esc(s.watershed || '') + (s.receiving_water ? ' → ' + esc(s.receiving_water) : '') + ' · ' + esc(s.aquifer_setting || '') + pv(s, 'aquifer_setting') + (s.pws_id ? ' · PWS ' + esc(s.pws_id) : '') + (s.pop_served ? ' · serves ' + fmt(s.pop_served, 0) : '') + ' · ' + (s.lat_approx != null ? (+s.lat_approx).toFixed(4) + ', ' + (+s.lon_approx).toFixed(4) + pv(s, 'lat_approx') : '') + (s.coord_source ? ' (' + esc(s.coord_source) + ')' : '') + '</div>';
    return '<div class="nc' + (t === 'compare' ? ' cmp' : '') + '" id="nc-' + s.site_id + '" style="--tx:' + col + '"><button class="sg-btn ghost flip" type="button" aria-expanded="false">details</button>' + front + '<div class="back">' + back + '</div></div>';
  }
  var ORDER = ['divide', 'north', 'south', 'potic', 'other', 'compare'];
  function drawCards() {
    var sorted = SITES.slice().sort(function (a, b) { var ta = ORDER.indexOf(txOf(a)), tb = ORDER.indexOf(txOf(b)); if (ta !== tb) return ta - tb; if ((a.downstream_rank || 0) !== (b.downstream_rank || 0)) return (a.downstream_rank || 0) - (b.downstream_rank || 0); return (b.elev_ft_approx || 0) - (a.elev_ft_approx || 0); });
    $('ncards').innerHTML = sorted.map(cardHTML).join('');
    $('ncards').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.flip') : null; if (!b) return; var c = b.parentNode; var open = c.classList.toggle('open'); b.textContent = open ? 'close' : 'details'; b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  }
  function openCard(id) { var c = $('nc-' + id); if (!c) return; if (!c.classList.contains('open')) { c.classList.add('open'); var b = c.querySelector('.flip'); b.textContent = 'close'; b.setAttribute('aria-expanded', 'true'); } c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /* ---------- 3 · bugs ---------- */
  var STREAM_TX = { BASIC_CREEK_STREAM: 'north', BASIC_CREEK_TRIB: 'north', HANNACROIX_CREEK: 'north', TEN_MILE_CREEK: 'south', CATSKILL_CREEK: 'south', POTIC_CREEK: 'potic', COEYMANS_CREEK: 'other', ONESQUETHAW_CREEK: 'other', FOX_CREEK: 'other', SWITZ_KILL: 'other' };
  var STREAM_ORDER = ['BASIC_CREEK_STREAM', 'HANNACROIX_CREEK', 'TEN_MILE_CREEK', 'CATSKILL_CREEK', 'POTIC_CREEK', 'COEYMANS_CREEK', 'ONESQUETHAW_CREEK', 'FOX_CREEK', 'SWITZ_KILL', 'BASIC_CREEK_TRIB'];
  var STREAM_NOTE = { BASIC_CREEK_STREAM: 'Basic Creek — north transect; mile 4.7 is below the reservoir, mile 12–16 above it', HANNACROIX_CREEK: 'Hannacroix Creek — below Alcove, to the Hudson at Coeymans', TEN_MILE_CREEK: 'Ten Mile Creek — south transect, Rensselaerville to Catskill Creek', CATSKILL_CREEK: 'Catskill Creek — south transect, Durham to the Hudson at Catskill', POTIC_CREEK: 'Potic Creek — Coxsackie drainage', COEYMANS_CREEK: 'Coeymans Creek — Albany side, on the karst belt', ONESQUETHAW_CREEK: 'Onesquethaw Creek — Albany side, on the karst belt', FOX_CREEK: 'Fox Creek — Berne/Knox, drains to the Schoharie', SWITZ_KILL: 'Switz Kill — Berne, drains to the Schoharie', BASIC_CREEK_TRIB: 'Unnamed tributary to Basic Creek' };
  var BANDS = [[7.5, 10, 'non-impacted', GREEN], [5, 7.5, 'slightly impacted', AMBER], [2.5, 5, 'moderately impacted', '#f08a4b'], [0, 2.5, 'severely impacted', RED]];
  function drawBugs() {
    var st = by(W.stations, 'site'), bio = by(W.biology, 'site');
    var tip = tipper('bug-tip');
    var html = STREAM_ORDER.filter(function (k) { return st[k] && bio[k] && bio[k].some(function (b) { return b.bap != null; }); }).map(function (k) {
      var stations = st[k].filter(function (s) { return s.mile != null; }).sort(function (a, b) { return b.mile - a.mile; });
      var rows = bio[k].filter(function (b) { return b.bap != null; });
      var yrs = uniq(rows.map(function (r) { return r.yr; })).sort(); var y0 = yrs[0], y1 = yrs[yrs.length - 1];
      var col = COL[STREAM_TX[k] || 'other'];
      var Wd = 1000, H = 170, L = 44, R = 16, T = 12, B = 40, maxMile = Math.max.apply(null, stations.map(function (s) { return s.mile; })), minMile = Math.min.apply(null, stations.map(function (s) { return s.mile; }));
      var span = Math.max(1, maxMile - minMile); var pad = span * .04; var xs = function (m) { return L + (maxMile + pad - m) / (span + 2 * pad) * (Wd - L - R); }; var ys = function (v) { return T + (10 - v) / 10 * (H - T - B); };
      var o = '';
      BANDS.forEach(function (b) { o += '<rect x="' + L + '" y="' + ys(b[1]) + '" width="' + (Wd - L - R) + '" height="' + (ys(b[0]) - ys(b[1])) + '" fill="' + b[3] + '" fill-opacity=".07"/><text class="band" x="' + (L + 6) + '" y="' + (ys(b[1]) + 11) + '">' + b[2] + '</text>'; });
      [0, 2.5, 5, 7.5, 10].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + (L - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
      o += '<line class="ax" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(0) + '" y2="' + ys(0) + '"/>';
      stations.forEach(function (s) { o += '<line x1="' + xs(s.mile) + '" x2="' + xs(s.mile) + '" y1="' + ys(0) + '" y2="' + (ys(0) + 6) + '" class="ax"/><text class="lbl dim" x="' + xs(s.mile) + '" y="' + (ys(0) + 19) + '" text-anchor="middle">mi ' + s.mile + '</text>'; });
      o += '<text class="lbl dim" x="' + L + '" y="' + (H - 4) + '">← upstream</text><text class="lbl dim" x="' + (Wd - R) + '" y="' + (H - 4) + '" text-anchor="end">mouth →</text>';
      var latest = {}; rows.forEach(function (r) { if (!latest[r.code] || r.yr > latest[r.code].yr) latest[r.code] = r; });
      rows.sort(function (a, b) { return a.yr - b.yr; }).forEach(function (r) { var s = st[k].filter(function (q) { return q.code === r.code; })[0]; if (!s || s.mile == null) return; var t = y1 > y0 ? (r.yr - y0) / (y1 - y0) : 1; var c = mix(col, .65 * (1 - t)); var isL = latest[r.code] === r; var band = BANDS.filter(function (b) { return r.bap >= b[0] && r.bap <= b[1]; })[0]; var tp = '<b>' + esc(r.code) + '</b> · ' + r.yr + '<br>BAP <b>' + fmt(r.bap, 2) + '</b> — ' + (band ? band[2] : '') + '<br>' + (r.hbi != null ? 'HBI ' + fmt(r.hbi, 2) + ' · ' : '') + (r.ept != null ? 'EPT ' + fmt(r.ept, 0) + ' · ' : '') + (r.rich != null ? 'richness ' + fmt(r.rich, 0) + ' · ' : '') + (r.nbip != null ? 'NBI-P ' + fmt(r.nbip, 2) : '') + (r.pma != null ? ' · PMA ' + fmt(r.pma, 0) + '%' : '') + (r.habitat != null ? '<br>habitat ' + fmt(r.habitat, 0) + '/200' : '') + '<br>' + (s.lat != null ? s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) : ''); o += '<circle cx="' + xs(s.mile) + '" cy="' + ys(r.bap) + '" r="' + (isL ? 6 : 4.5) + '" fill="' + c + '" stroke="' + (isL ? '#fff' : '#00004d') + '" stroke-width="' + (isL ? 2 : 1.5) + '" data-tip="' + esc(tp) + '"/>' + (isL ? '<text class="lbl" x="' + (xs(s.mile) + (xs(s.mile) > Wd - 70 ? -9 : 9)) + '" y="' + (ys(r.bap) + 4) + '"' + (xs(s.mile) > Wd - 70 ? ' text-anchor="end"' : '') + '>' + r.yr + '</text>' : ''); });
      var tableRows = stations.map(function (s) { return '<tr><td class="l">' + esc(s.code) + ' <span style="opacity:.7">mi ' + s.mile + '</span></td>' + yrs.map(function (y) { var r = rows.filter(function (q) { return q.code === s.code && q.yr === y; })[0]; return '<td>' + (r ? fmt(r.bap, 2) : '') + '</td>'; }).join('') + '</tr>'; }).join('');
      return '<div class="bug" style="--tx:' + col + '"><div class="t"><b>' + esc(STREAM_NOTE[k] || k) + '</b><span>' + stations.length + ' stations · ' + rows.length + ' visits · ' + y0 + '–' + y1 + '</span></div><div class="sg-chart" style="border:none;background:none;padding:0"><svg viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="BAP score by river mile">' + o + '</svg></div><details class="sg-more"><summary>as a table</summary><table class="ddtab"><thead><tr><th>Station</th>' + yrs.map(function (y) { return '<th>' + y + '</th>'; }).join('') + '</tr></thead><tbody>' + tableRows + '</tbody></table></details></div>';
    }).join('');
    $('bugs').innerHTML = html; bindTips($('bugs'), tip, 'data-tip');
    $('bug-legend').innerHTML = BANDS.map(function (b) { return '<span><i class="sq" style="color:' + b[3] + '"></i>' + b[2] + ' (' + b[0] + '–' + b[1] + ')</span>'; }).join('') + '<span><i style="color:#fff;border-color:#fff;background:none"></i>ringed = latest visit</span>';
  }

  /* ---------- 4 · reservoir ---------- */
  var LAKE_ORDER = ['BASIC_CREEK_RES', 'ALCOVE_RES', 'LAWSON_LAKE', 'MYOSOTIS_LAKE', 'ONDERDONK_LAKE', 'POTIC_RES', 'THOMPSONS_LAKE', 'WARNERS_LAKE', 'SLEEPY_HOLLOW_LAKE', 'VLY_CREEK_RES', 'HELDERBERG_LAKE'];
  var LAKE_NAME = { VLY_CREEK_RES: 'Vly Creek Reservoir', HELDERBERG_LAKE: 'Helderberg Lake' };
  function drawLakes() {
    var Y0 = 1989, Y1 = 2025, Wd = 300, H = 120, L = 30, R = 8, T = 8, B = 20, lo = 3, hi = 100;
    var xs = function (y) { return L + (y - Y0) / (Y1 - Y0) * (Wd - L - R); }, ys = function (v) { return T + (1 - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (H - T - B); };
    var tip = tipper('gw-tip');
    $('lakes').innerHTML = LAKE_ORDER.filter(function (k) { return LAKESUM[k]; }).map(function (k) {
      var rows = LAKESUM[k].filter(function (l) { return l.tp_summer_mean_ugL != null; }).sort(function (a, b) { return a.yr - b.yr; }); if (!rows.length) return '';
      var s = S[k], col = s ? COL[txOf(s)] : COL.other, name = s ? lakeName(s) : LAKE_NAME[k] || k;
      var o = '';
      [5, 10, 20, 50, 100].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + (L - 4) + '" y="' + (ys(v) + 3) + '" text-anchor="end" font-size="9">' + v + '</text>'; });
      o += '<line class="lim" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(20) + '" y2="' + ys(20) + '"/><text class="lim-lbl" x="' + (L + 3) + '" y="' + (ys(20) - 3) + '">20 guidance</text>';
      [1990, 2000, 2010, 2020].forEach(function (y) { o += '<text class="lbl dim" x="' + xs(y) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9">' + y + '</text>'; });
      if (rows.length > 1) o += '<polyline fill="none" stroke="' + col + '" stroke-width="1.5" stroke-opacity=".45" points="' + rows.map(function (l) { return xs(l.yr) + ',' + ys(l.tp_summer_mean_ugL); }).join(' ') + '"/>';
      rows.forEach(function (l) { o += '<circle cx="' + xs(l.yr) + '" cy="' + ys(l.tp_summer_mean_ugL) + '" r="4.5" fill="' + col + '" stroke="#00004d" stroke-width="1.5" data-tip="' + esc('<b>' + name + '</b> ' + l.yr + '<br>summer TP ' + fmt(l.tp_summer_mean_ugL, 1) + ' µg/L (n=' + (l.tp_n || '?') + ', max ' + fmt(l.tp_max_ugL, 1) + ')' + (l.chla_summer_mean_ugL != null ? '<br>chl-a ' + fmt(l.chla_summer_mean_ugL, 1) + ' µg/L' : '') + (l.secchi_summer_mean_m != null ? ' · Secchi ' + fmt(l.secchi_summer_mean_m, 2) + ' m' : '') + (l.do_min_mgL != null ? '<br>DO min ' + fmt(l.do_min_mgL, 2) + ' mg/L' : '')) + '"/>'; });
      var last = rows[rows.length - 1];
      return '<div class="sg-chart" style="border-left:4px solid ' + col + '"><div class="cap">' + esc(name) + '<span>' + rows.length + ' yr · newest ' + last.yr + ': ' + fmt(last.tp_summer_mean_ugL, 0) + ' µg/L</span></div><svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg></div>';
    }).join('') + nycPanel();
    bindTips($('lakes'), tip, 'data-tip');
    /* v998: the NYC comparison — Schoharie Reservoir, annual mean TP (all seasons, DEP), against DEP's 15 µg/L benchmark; dashed */
    function nycPanel() {
      var B = (W.nyc_bench || []).filter(function (r) { return r.reservoir === 'Schoharie'; }); var tp = B.filter(function (r) { return r.analyte === 'Total phosphorus' && r.annual_mean_num != null; }).sort(function (a, b) { return a.report_year - b.report_year; }); if (!tp.length) return '';
      var tb = {}; B.filter(function (r) { return r.analyte === 'Turbidity'; }).forEach(function (r) { tb[r.report_year] = r; });
      var col = COL.compare, o = '';
      [5, 10, 20, 50, 100].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + (L - 4) + '" y="' + (ys(v) + 3) + '" text-anchor="end" font-size="9">' + v + '</text>'; });
      o += '<line class="lim" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(20) + '" y2="' + ys(20) + '"/><text class="lim-lbl" x="' + (L + 3) + '" y="' + (ys(20) - 3) + '">20 guidance</text>';
      o += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(15) + '" y2="' + ys(15) + '" stroke="' + col + '" stroke-dasharray="2 3" stroke-width="1.2"/><text class="lbl dim" x="' + (L + 3) + '" y="' + (ys(15) + 10) + '" font-size="9">DEP benchmark 15</text>';
      [1990, 2000, 2010, 2020].forEach(function (y) { o += '<text class="lbl dim" x="' + xs(y) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9">' + y + '</text>'; });
      o += '<polyline fill="none" stroke="' + col + '" stroke-width="1.5" stroke-opacity=".5" stroke-dasharray="4 3" points="' + tp.map(function (r) { return xs(r.report_year) + ',' + ys(r.annual_mean_num); }).join(' ') + '"/>';
      tp.forEach(function (r) { var t = tb[r.report_year]; o += '<circle cx="' + xs(r.report_year) + '" cy="' + ys(r.annual_mean_num) + '" r="4.5" fill="none" stroke="' + col + '" stroke-width="2" data-tip="' + esc('<b>Schoharie Reservoir (NYC)</b> ' + r.report_year + '<br>annual mean TP ' + esc(r.annual_mean_reported) + ' µg/L (all seasons, n=' + r.n_samples + ')<br>' + esc(r.pct_exceed_ssm) + '% of samples over the ' + esc(r.single_sample_max) + ' µg/L single-sample benchmark' + (t ? '<br>turbidity: ' + esc(t.pct_exceed_ssm) + '% of samples over ' + esc(t.single_sample_max) + ' NTU' : '') + '<br>' + esc(r.source_doc || '')) + '"/>'; });
      var last = tp[tp.length - 1];
      return '<div class="sg-chart" style="border:1px dashed ' + col + ';border-left:4px dashed ' + col + '"><div class="cap">Schoharie Res. (NYC)<span>comparison · annual mean · ' + last.report_year + ': ' + esc(last.annual_mean_reported) + ' µg/L</span></div><svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg></div>';
    }
  }
  function drawProfiles() {
    var Wd = 480, H = 240, L = 40, R = 14, T = 14, B = 34, dmax = 4.2, xmax = 14;
    var xs = function (v) { return L + v / xmax * (Wd - L - R); }, ys = function (d) { return T + d / dmax * (H - T - B); };
    var dates = uniq(W.bc_profiles.map(function (p) { return p.date; })).sort();
    var o = '';
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(function (v) { o += '<line class="grid" x1="' + xs(v) + '" x2="' + xs(v) + '" y1="' + T + '" y2="' + ys(dmax) + '"/><text class="lbl dim" x="' + xs(v) + '" y="' + (H - 18) + '" text-anchor="middle">' + v + '</text>'; });
    [0, 1, 2, 3, 4].forEach(function (d) { o += '<text class="lbl dim" x="' + (L - 6) + '" y="' + (ys(d) + 4) + '" text-anchor="end">' + d + ' m</text>'; });
    o += '<line class="lim" x1="' + xs(4) + '" x2="' + xs(4) + '" y1="' + T + '" y2="' + ys(dmax) + '"/><text class="lim-lbl" x="' + (xs(4) - 4) + '" y="' + (ys(dmax) - 4) + '" text-anchor="end">4 mg/L minimum</text>';
    o += '<text class="lbl" x="' + (Wd / 2) + '" y="' + (H - 4) + '" text-anchor="middle">dissolved oxygen, mg/L</text>';
    var tip = tipper('gw-tip'), lg = '';
    dates.forEach(function (d, i) { var rows = W.bc_profiles.filter(function (p) { return p.date === d && p.dissolved_oxygen != null; }).sort(function (a, b) { return a.depth_m - b.depth_m; }); if (!rows.length) return; var yr = d.slice(0, 4); var base = yr === '2013' ? COL.north : COL.other; var k = dates.filter(function (q) { return q.slice(0, 4) === yr; }); var t = k.indexOf(d) / Math.max(1, k.length - 1); var c = mix(base, .5 * (1 - t)); o += '<polyline fill="none" stroke="' + c + '" stroke-width="2" points="' + rows.map(function (p) { return xs(p.dissolved_oxygen) + ',' + ys(p.depth_m); }).join(' ') + '"/>'; rows.forEach(function (p) { o += '<circle cx="' + xs(p.dissolved_oxygen) + '" cy="' + ys(p.depth_m) + '" r="3.5" fill="' + c + '" stroke="#00004d" stroke-width="1" data-tip="' + esc('<b>' + d + '</b> · ' + p.depth_m + ' m<br>DO ' + fmt(p.dissolved_oxygen, 2) + ' mg/L · ' + fmt(p.temperature, 1) + ' °C · pH ' + fmt(p.ph, 2) + ' · ' + fmt(p.specific_conductance, 0) + ' µS/cm' + (p.oxidation_reduction_potential != null ? ' · ORP ' + fmt(p.oxidation_reduction_potential, 0) : '')) + '"/>'; }); var mn = rows.reduce(function (a, p) { return p.dissolved_oxygen < a.dissolved_oxygen ? p : a; }, rows[0]); if (mn.dissolved_oxygen < 1) o += '<text class="lbl" x="' + (xs(mn.dissolved_oxygen) + 7) + '" y="' + (ys(mn.depth_m) + (yr === '2013' ? -6 : 12)) + '">' + fmt(mn.dissolved_oxygen, 2) + ' mg/L · ' + d + '</text>'; lg += '<span><i class="line" style="color:' + c + '"></i>' + d + '</span>'; });
    $('prof').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg><div class="lg">' + lg + '</div>';
    bindTips($('prof'), tip, 'data-tip');
  }
  function drawTMDL() {
    var rows = W.tmdl.filter(function (r) { return typeof r.value === 'number' && typeof r.unit === 'number' && r.item !== 'TOTAL'; }); /* LOAD ALLOCATION block: value = current lbs/yr, unit column = allocated */
    var total = W.tmdl.filter(function (r) { return r.item === 'TOTAL'; })[0];
    var Wd = 480, H = 36 + rows.length * 34, L = 130, R = 60, mx = Math.max.apply(null, rows.map(function (r) { return Math.max(r.value, r.unit); }));
    var xs = function (v) { return L + v / mx * (Wd - L - R); };
    var o = '<text class="lbl dim" x="' + L + '" y="12">current (modelled) vs allocated, lbs/yr</text>';
    rows.forEach(function (r, i) { var y = 22 + i * 34; o += '<text class="lbl" x="' + (L - 8) + '" y="' + (y + 12) + '" text-anchor="end">' + esc(r.item) + '</text><rect x="' + L + '" y="' + y + '" width="' + Math.max(0, xs(r.value) - L) + '" height="9" rx="2" fill="' + COL.north + '"/><text class="lbl dim" x="' + (xs(r.value) + 5) + '" y="' + (y + 8) + '">' + fmt(r.value, 0) + pv(r, 'value') + '</text><rect x="' + L + '" y="' + (y + 12) + '" width="' + Math.max(0, xs(r.unit) - L) + '" height="9" rx="2" fill="' + GREY + '"/><text class="lbl dim" x="' + (xs(r.unit) + 5) + '" y="' + (y + 20) + '">' + fmt(r.unit, 0) + '</text>'; });
    $('tmdl').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg><div class="lg"><span><i class="sq" style="color:' + COL.north + '"></i>current, as modelled</span><span><i class="sq" style="color:' + GREY + '"></i>allocated</span></div>';
    var gw = W.tmdl.filter(function (r) { return /Groundwater/.test(r.item); })[0], rt = W.tmdl.filter(function (r) { return /residence/i.test(r.item); })[0];
    $('tmdl-note').innerHTML = (total ? 'Total ' + fmt(total.value, 0) + ' → ' + fmt(total.unit, 0) + ' lbs/yr, a 42% cut. ' : '') + (gw ? fmt(gw.value, 0) + ' lbs/yr (' + Math.round(gw.value / total.value * 100) + '%) is attributed to groundwater transport, two-thirds of it from agriculture. ' : '') + (rt ? 'Hydraulic residence time ' + rt.value + ' yr — the reservoir is a five-week mirror of its watershed. ' : '') + 'Built with no observed phosphorus data; validated afterward on five samples each in 2004 and 2005 (42 and 55 µg/L against a simulated 31). Internal loading from anoxic sediment was set to zero. <a href="https://extapps.dec.ny.gov/docs/water_pdf/tmdlbasicck.pdf" target="_blank" rel="noopener">TMDL, March 2013</a>.';
  }
  var HABYR = by(W.hab_by_year || [], 'WATERBODY_NAME');
  function bloomLakes() { var names = uniq(Object.keys(HABYR).concat(Object.keys(HABHIST), W.habs_2025.map(function (h) { return h.waterbody; }))); return names.filter(function (n) { return SITES.some(function (s) { return lakeName(s) === n; }) || /Coxsackie|Hollister/.test(n); }).sort(function (a, b) { return a === 'Basic Creek Reservoir' ? -1 : b === 'Basic Creek Reservoir' ? 1 : a.localeCompare(b); }); }
  function drawBloom(name) {
    var Wd = 900, L = 60, R = 16, T = 10, rowH = 18, years = []; for (var y = 2012; y <= 2025; y++) years.push(y);
    var H = T + years.length * rowH + 30;
    var xs = function (doy) { return L + (Math.min(Math.max(doy, 152), 334) - 152) / (334 - 152) * (Wd - L - R); };
    var doy = function (d) { var t = new Date(d); return (Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5; };
    var hist = HABHIST[name] || [], h25 = W.habs_2025.filter(function (h) { return h.waterbody === name; })[0];
    var o = '';
    [['Jun', 152], ['Jul', 182], ['Aug', 213], ['Sep', 244], ['Oct', 274], ['Nov', 305]].forEach(function (m) { o += '<line class="grid" x1="' + xs(m[1]) + '" x2="' + xs(m[1]) + '" y1="' + T + '" y2="' + (H - 26) + '"/><text class="lbl dim" x="' + xs(m[1]) + '" y="' + (H - 10) + '">' + m[0] + '</text>'; });
    var hy = (HABYR[name] || []);
    years.forEach(function (y, i) { var yy = T + i * rowH; o += '<text class="lbl dim" x="' + (L - 8) + '" y="' + (yy + 12) + '" text-anchor="end">' + y + '</text>'; var rows = hist.filter(function (r) { return +r.Year === y; }); var hr = hy.filter(function (r) { return +r.year === y; })[0]; if (hr && hr.first && hr.last && hr.worst_status && hr.worst_status !== 'none') { var c = hr.worst_status === 'HT' ? RED : hr.worst_status === 'C' ? AMBER : GREY; var a = xs(doy(String(hr.first).slice(0, 10))), b = xs(doy(String(hr.last).slice(0, 10))); var lbl = (hr.worst_status === 'HT' ? 'confirmed, high toxins' : hr.worst_status === 'C' ? 'confirmed' : 'suspicious') + ' · ' + hr.n_reports + ' report' + (hr.n_reports == 1 ? '' : 's'); o += '<rect x="' + a + '" y="' + (yy + 3) + '" width="' + Math.max(3, b - a) + '" height="10" rx="3" fill="' + c + '" fill-opacity=".85"><title>' + y + ': ' + lbl + '</title></rect><text class="lbl dim" x="' + (b > Wd - 230 ? a - 6 : b + 6) + '" y="' + (yy + 12) + '"' + (b > Wd - 230 ? ' text-anchor="end"' : '') + '>' + lbl + '</text>'; } else if (y === 2025 && h25) { o += '<rect x="' + xs(doy(h25.first_report)) + '" y="' + (yy + 3) + '" width="' + Math.max(3, xs(doy(h25.last_report)) - xs(doy(h25.first_report))) + '" height="10" rx="3" fill="' + GREY + '" fill-opacity=".8"><title>2025: ' + h25.n_reports + ' reports, ' + h25.first_report + ' → ' + h25.last_report + '</title></rect><text class="lbl dim" x="' + (xs(doy(h25.last_report)) > Wd - 300 ? xs(doy(h25.first_report)) - 6 : xs(doy(h25.last_report)) + 6) + '" y="' + (yy + 12) + '"' + (xs(doy(h25.last_report)) > Wd - 300 ? ' text-anchor="end"' : '') + '>' + h25.n_reports + ' report' + (h25.n_reports == 1 ? '' : 's') + ' · season window, weekly detail not in record</text>'; } else if (rows.length) rows.forEach(function (r) { var c = r['Bloom Type'] === 'HT' ? RED : r['Bloom Type'] === 'C' ? AMBER : GREY; var a = xs(doy(new Date(r['Date of First Listing']))), b = xs(doy(new Date(r['Date of Last Listing']))); o += '<rect x="' + a + '" y="' + (yy + 3) + '" width="' + Math.max(3, b - a) + '" height="10" rx="3" fill="' + c + '" fill-opacity=".85"><title>' + y + ': ' + esc(r.bloom_type_meaning) + ', ' + r['Number of Weeks on DEC Notification List'] + ' weeks listed</title></rect><text class="lbl dim" x="' + (b > Wd - 230 ? a - 6 : b + 6) + '" y="' + (yy + 12) + '"' + (b > Wd - 230 ? ' text-anchor="end"' : '') + '>' + esc(r.bloom_type_meaning) + ' · ' + r['Number of Weeks on DEC Notification List'] + ' wk</text>'; }); else o += '<text class="lbl dim" x="' + (L + 4) + '" y="' + (yy + 12) + '" font-style="italic" opacity=".45">no DEC report</text>'; });
    $('bloom').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg>';
  }

  /* v996 (Laurie): phosphorus → bloom → microcystin, with fish mercury, year by year on one timeline, one lake per block.
     Separate rows, separate scales (never a shared axis): each row is its own measure against its own reference line.
     Built only from what is on record; empty years stay empty. Sampling differs by row and the note says so. */
  function drawInteract() {
    var el = $('ix'); if (!el) return;
    var LAKES = [
      { name: 'Sleepy Hollow Lake', pl: /^Sleepy Hollow Lake$/, hg: null },
      { name: 'Basic Creek Reservoir', pl: /^Basic Creek Reservoir$/, hg: /BASIC RESERVOIR/ },
      { name: 'Alcove Reservoir', pl: /^Alcove Reservoir$/, hg: /ALCOVE RES/ },
      { name: 'Lawson Lake', pl: /^Lawson Lake$/, hg: null }
    ];
    var Y0 = 1998, Y1 = 2025, Wd = 900, L = 150, R = 20;
    var xs = function (y) { return L + (y - Y0 + 0.5) / (Y1 - Y0 + 1) * (Wd - L - R); }, colW = (Wd - L - R) / (Y1 - Y0 + 1);
    var rows = (W.cres || []).map(cresRow);
    var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
    var yearOf = function (d) { return +String(d).slice(0, 4); }, monOf = function (d) { return +String(d).slice(5, 7); };
    var logY = function (lo, hi, top, h) { return function (v) { return top + (1 - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * h; }; };
    var tip = tipper('ix-tip'), o = '', y = 8, table = [];
    var ROW = { tp: 72, bl: 14, mc: 72, hg: 56 }, GAP = 12;
    /* shared year axis at the top */
    for (var yr = Y0; yr <= Y1; yr++) if (yr % 5 === 0 || yr === Y1) o += '<text class="lbl dim" x="' + xs(yr) + '" y="' + (y + 10) + '" text-anchor="middle">' + yr + '</text>';
    y += 22;
    var H0 = y;
    LAKES.forEach(function (lk) {
      var tp = rows.filter(function (r) { return r.k === 'TP' && lk.pl.test(r.pl) && r.m === 'raw lake' && r.v != null && r.d && monOf(r.d) >= 6 && monOf(r.d) <= 9; });
      var mc = rows.filter(function (r) { return r.k === 'MICROCYSTIN' && lk.pl.test(r.pl) && (r.m === 'bloom sample' || r.m === 'raw lake') && r.d; });
      var hg = lk.hg ? rows.filter(function (r) { return r.k === 'HG' && lk.hg.test(r.pl) && r.m === 'fish muscle' && r.v != null && r.d; }) : [];
      var hgOld = hg.filter(function (r) { return yearOf(r.d) < Y0; }); hg = hg.filter(function (r) { return yearOf(r.d) >= Y0; });
      var hab = HABYR[lk.name] || [];
      o += '<text class="lbl" x="0" y="' + (y + 12) + '" style="font-size:13px">' + esc(lk.name) + '</text>'; y += 20;
      var top = y;
      /* row 1: summer phosphorus */
      var ug = function (r) { return /mg/i.test(r.u) ? r.v * 1000 : r.v; };
      var byY = {}; tp.forEach(function (r) { var k = yearOf(r.d); (byY[k] = byY[k] || []).push(r); });
      var ty = logY(5, 150, y, ROW.tp);
      o += '<text class="lbl dim" x="' + (L - 10) + '" y="' + (y + ROW.tp / 2 + 4) + '" text-anchor="end">summer phosphorus</text>';
      [5, 10, 50, 150].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ty(v) + '" y2="' + ty(v) + '"/><text class="lbl dim" x="' + (L + 2) + '" y="' + (ty(v) - 2) + '" style="font-size:9px">' + v + (v === 150 ? ' µg/L' : '') + '</text>'; });
      o += '<line class="lim" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ty(20) + '" y2="' + ty(20) + '"/><text class="lim-lbl" x="' + (L + 40) + '" y="' + (ty(20) - 3) + '">20 µg/L guidance</text>';
      var pts = Object.keys(byY).map(Number).filter(function (k) { return k >= Y0; }).sort().map(function (k) { var rs = byY[k], det = rs.filter(function (r) { return !/not detected/.test(r.q); }).map(ug); var nd = rs.length - det.length; return { y: k, m: det.length ? med(det) : null, n: rs.length, nd: nd, lo: det.length ? Math.min.apply(null, det) : null, hi: det.length ? Math.max.apply(null, det) : null }; }).filter(function (p) { return p.m != null; });
      for (var i = 1; i < pts.length; i++) if (pts[i].y === pts[i - 1].y + 1) o += '<line x1="' + xs(pts[i - 1].y) + '" y1="' + ty(Math.min(150, Math.max(5, pts[i - 1].m))) + '" x2="' + xs(pts[i].y) + '" y2="' + ty(Math.min(150, Math.max(5, pts[i].m))) + '" stroke="rgba(255,255,255,.5)" stroke-width="2"/>';
      pts.forEach(function (p) { var v = Math.min(150, Math.max(5, p.m)); o += '<circle cx="' + xs(p.y) + '" cy="' + ty(v) + '" r="4.5" fill="' + (p.m > 20 ? RED : '#fff') + '" stroke="#00004d" stroke-width="2" data-tip="' + esc('<b>' + lk.name + ' · ' + p.y + '</b><br>summer (Jun–Sep) median total phosphorus <b>' + fmt(p.m, 1) + ' µg/L</b><br>' + p.n + ' sample' + (p.n == 1 ? '' : 's') + ', range ' + fmt(p.lo, 1) + '–' + fmt(p.hi, 1) + (p.nd ? '<br>' + p.nd + ' not detected, left out of the median' : '')) + '"/>'; table.push([lk.name, p.y, 'summer phosphorus (median)', fmt(p.m, 1) + ' µg/L', p.n + ' samples']); });
      if (!pts.length) o += '<text class="lbl dim" x="' + (L + 40) + '" y="' + (ty(20) + 16) + '" font-style="italic" opacity=".6">no open-water phosphorus sample since ' + Y0 + '</text>';
      y += ROW.tp + GAP;
      /* row 2: bloom status */
      o += '<text class="lbl dim" x="' + (L - 10) + '" y="' + (y + 11) + '" text-anchor="end">bloom (worst that year)</text>';
      o += '<rect x="' + L + '" y="' + y + '" width="' + (xs(2011.5) - L) + '" height="' + ROW.bl + '" fill="url(#ix-hatch)"><title>DEC bloom reporting begins 2012</title></rect>';
      for (var by2 = 2012; by2 <= Y1; by2++) { var h = hab.filter(function (r) { return +r.year === by2; })[0]; var st = h && h.worst_status && h.worst_status !== 'none' ? h.worst_status : null; var c = st === 'HT' ? RED : st === 'C' ? AMBER : st === 'S' ? GREY : null; var lab = st === 'HT' ? 'confirmed, high toxins' : st === 'C' ? 'confirmed' : st === 'S' ? 'suspicious' : 'no bloom reported'; o += '<rect x="' + (xs(by2) - colW / 2 + 1) + '" y="' + y + '" width="' + (colW - 2) + '" height="' + ROW.bl + '" rx="3" fill="' + (c || 'none') + '" stroke="' + (c ? '#00004d' : 'rgba(255,255,255,.25)') + '" stroke-width="1" data-tip="' + esc('<b>' + lk.name + ' · ' + by2 + '</b><br>' + lab + (h && h.n_reports ? ' · ' + h.n_reports + ' DEC report' + (h.n_reports == 1 ? '' : 's') : '')) + '"/>'; if (st) table.push([lk.name, by2, 'bloom, worst status', lab, (h.n_reports || '') + ' reports']); }
      y += ROW.bl + GAP;
      /* row 3: microcystin, yearly maximum — shoreline bloom samples (circle) vs open water (diamond) */
      var my = logY(0.1, 10000, y, ROW.mc);
      o += '<text class="lbl dim" x="' + (L - 10) + '" y="' + (y + ROW.mc / 2 + 4) + '" text-anchor="end">microcystin (yearly max)</text>';
      [0.1, 1, 10, 100, 1000, 10000].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + my(v) + '" y2="' + my(v) + '"/>' + (v === 1 || v === 100 || v === 10000 ? '<text class="lbl dim" x="' + (L + 2) + '" y="' + (my(v) - 2) + '" style="font-size:9px">' + v.toLocaleString() + (v === 10000 ? ' µg/L' : '') + '</text>' : ''); });
      o += '<line class="lim" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + my(4) + '" y2="' + my(4) + '"/><text class="lim-lbl" x="' + (L + 40) + '" y="' + (my(4) + 11) + '">4 µg/L guidance</text>';
      ['bloom sample', 'raw lake'].forEach(function (med_) {
        var g = {}; mc.filter(function (r) { return r.m === med_; }).forEach(function (r) { var k = yearOf(r.d); (g[k] = g[k] || []).push(r); });
        Object.keys(g).map(Number).filter(function (k) { return k >= Y0; }).forEach(function (k) {
          var rs = g[k], det = rs.filter(function (r) { return !/not detected/.test(r.q) && r.v != null && r.v > 0; }); var mx = det.length ? Math.max.apply(null, det.map(function (r) { return r.v; })) : null;
          var cx = xs(k) + (med_ === 'raw lake' ? 6 : -6), cy = my(mx != null ? Math.min(10000, Math.max(0.1, mx)) : 0.1);
          var fill = mx == null ? 'none' : (mx >= 4 ? RED : GREEN), stroke = mx == null ? GREY : '#00004d';
          var t = esc('<b>' + lk.name + ' · ' + k + '</b><br>' + (med_ === 'raw lake' ? 'open water' : 'shoreline bloom samples') + ': ' + (mx == null ? 'not detected in ' + rs.length + ' sample' + (rs.length == 1 ? '' : 's') : 'highest <b>' + fmt(mx, 1) + ' µg/L</b> of ' + rs.length + ' sample' + (rs.length == 1 ? '' : 's')));
          o += med_ === 'raw lake' ? '<path d="M' + cx + ',' + (cy - 6) + ' l6,6 l-6,6 l-6,-6 z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5" data-tip="' + t + '"/>' : '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5" data-tip="' + t + '"/>';
          table.push([lk.name, k, 'microcystin, ' + (med_ === 'raw lake' ? 'open water' : 'shoreline bloom') + ' (max)', mx == null ? 'not detected' : fmt(mx, 1) + ' µg/L', rs.length + ' samples']);
        });
      });
      if (!mc.length) o += '<text class="lbl dim" x="' + (L + 40) + '" y="' + (my(4) - 8) + '" font-style="italic" opacity=".6">no microcystin sample on record</text>';
      y += ROW.mc + GAP;
      /* row 4: fish mercury (fillet, mg/kg wet weight) */
      var hy = function (v) { return y + (1 - Math.min(v, 0.8) / 0.8) * ROW.hg; };
      o += '<text class="lbl dim" x="' + (L - 10) + '" y="' + (y + ROW.hg / 2 + 4) + '" text-anchor="end">fish mercury (fillet)</text>';
      [0, 0.4, 0.8].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + hy(v) + '" y2="' + hy(v) + '"/>'; });
      o += '<text class="lbl dim" x="' + (L + 2) + '" y="' + (hy(0.8) + 9) + '" style="font-size:9px">0.8 mg/kg</text>';
      o += '<line class="lim" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + hy(0.3) + '" y2="' + hy(0.3) + '"/><text class="lim-lbl" x="' + (Wd - R) + '" y="' + (hy(0.3) - 3) + '" text-anchor="end">0.3 mg/kg EPA fish criterion</text>';
      var hgY = {}; hg.forEach(function (r) { var k = yearOf(r.d); (hgY[k] = hgY[k] || []).push(r); });
      Object.keys(hgY).map(Number).forEach(function (k) { var rs = hgY[k], vs = rs.map(function (r) { return r.v; }); rs.forEach(function (r, j) { var jx = xs(k) + ((j * 37) % 23 - 11); o += '<circle cx="' + jx + '" cy="' + hy(r.v) + '" r="2" fill="rgba(255,255,255,.4)"/>'; }); var m = med(vs); o += '<rect x="' + (xs(k) - 13) + '" y="' + (hy(m) - 1.5) + '" width="26" height="3" rx="1.5" fill="' + (m > 0.3 ? RED : '#fff') + '" data-tip="' + esc('<b>' + lk.name + ' · ' + k + '</b><br>' + rs.length + ' fish fillets, median <b>' + fmt(m, 2) + ' mg/kg</b> (range ' + fmt(Math.min.apply(null, vs), 2) + '–' + fmt(Math.max.apply(null, vs), 2) + ')<br>no methylmercury, water or sediment mercury measured in the lake') + '"/><rect x="' + (xs(k) - 12) + '" y="' + y + '" width="24" height="' + ROW.hg + '" fill="transparent" data-tip="' + esc('<b>' + lk.name + ' · ' + k + '</b><br>' + rs.length + ' fish fillets, median <b>' + fmt(m, 2) + ' mg/kg</b> (range ' + fmt(Math.min.apply(null, vs), 2) + '–' + fmt(Math.max.apply(null, vs), 2) + ')') + '"/>'; table.push([lk.name, k, 'fish mercury, fillet (median)', fmt(m, 2) + ' mg/kg', rs.length + ' fish']); });
      var hgNote = !lk.hg ? 'no fish mercury on record' : (!hg.length ? 'no fish mercury since ' + Y0 : '') + (hgOld.length ? (hg.length ? '' : '') + '← off the chart: ' + hgOld.length + ' fish in ' + uniq(hgOld.map(function (r) { return yearOf(r.d); })).join(', ') : '');
      if (hgNote) o += '<text class="lbl dim" x="' + (hg.length ? xs(2002) : L + 40) + '" y="' + (y + 16) + '" font-style="italic" opacity=".65">' + esc(hgNote.trim()) + '</text>';
      y += ROW.hg + 18;
      o += '<line x1="0" x2="' + Wd + '" y1="' + (y - 8) + '" y2="' + (y - 8) + '" stroke="rgba(255,255,255,.15)"/>';
    });
    /* year gridlines through everything */
    var yg = ''; for (var yr2 = Y0; yr2 <= Y1; yr2++) if (yr2 % 5 === 0) yg += '<line x1="' + xs(yr2) + '" x2="' + xs(yr2) + '" y1="' + H0 + '" y2="' + (y - 10) + '" stroke="rgba(255,255,255,.07)"/>';
    var defs = '<defs><pattern id="ix-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.18)" stroke-width="2"/></pattern></defs>';
    el.innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + (y - 6) + '">' + defs + yg + o + '</svg>';
    bindTips(el, tip, 'data-tip');
    table.sort(function (a, b) { return a[0] === b[0] ? a[1] - b[1] : 0; });
    $('ix-table').innerHTML = '<table class="ddtab"><thead><tr><th>Lake</th><th>Year</th><th>Measure</th><th>Value</th><th>Basis</th></tr></thead><tbody>' + table.map(function (r) { return '<tr><td class="l">' + esc(r[0]) + '</td><td>' + r[1] + '</td><td class="l">' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[4]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function drawToxin(name) {
    var site = SITES.filter(function (s) { return lakeName(s) === name; })[0]; var rows = site ? W.hab_toxins.filter(function (t) { return t.site_id === site.site_id && t.PARAMETER_NAME === 'microcystin'; }) : [];
    if (!rows.length) { $('toxin').innerHTML = '<p class="sg-det" style="padding:6px">No shoreline microcystin results on file for ' + esc(name) + '.</p>'; return; }
    var dates = rows.map(function (r) { return r.dt; }).sort(); var d0 = new Date(dates[0]).getTime(), d1 = new Date(dates[dates.length - 1]).getTime(); if (d1 - d0 < 365 * 864e5) { d0 -= 180 * 864e5; d1 += 180 * 864e5; }
    var Wd = 900, H = 200, L = 50, R = 16, T = 12, B = 30, lo = 0.1, hi = 10000;
    var xs = function (d) { return L + (new Date(d).getTime() - d0) / (d1 - d0) * (Wd - L - R); }, ys = function (v) { return T + (1 - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (H - T - B); };
    var o = '';
    [0.1, 1, 10, 100, 1000, 10000].forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + (L - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end">' + v.toLocaleString() + '</text>'; });
    o += '<line class="lim" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(4) + '" y2="' + ys(4) + '"/><text class="lim-lbl" x="' + (Wd - R) + '" y="' + (ys(4) - 3) + '" text-anchor="end">4 µg/L guidance</text>';
    var yr0 = new Date(d0).getUTCFullYear(), yr1 = new Date(d1).getUTCFullYear(); for (var y = yr0; y <= yr1; y++) { var t = Date.UTC(y, 0, 1); if (t >= d0 && t <= d1) o += '<text class="lbl dim" x="' + xs(t) + '" y="' + (H - 8) + '" text-anchor="middle">' + y + '</text>'; }
    var tip = tipper('gw-tip');
    rows.forEach(function (r) { var nd = r.RESULT_QUALIFIER === 'U' || r.val == null; var v = nd ? lo : Math.max(lo, r.val); o += '<circle cx="' + xs(r.dt) + '" cy="' + ys(v) + '" r="5" fill="' + (nd ? 'none' : (r.val >= 4 ? RED : GREEN)) + '" stroke="' + (nd ? GREY : '#00004d') + '" stroke-width="1.5" data-tip="' + esc('<b>' + r.dt + '</b> · ' + esc(r.SAMPLE_LOCATION || '') + '<br>microcystin ' + (nd ? 'not detected' : fmt(r.val, 1) + ' µg/L')) + '"/>'; if (!nd && r.val >= 50) o += '<text class="lbl" x="' + (xs(r.dt) + 8) + '" y="' + (ys(v) + 4) + '">' + fmt(r.val, 0) + '</text>'; });
    $('toxin').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg><div class="lg"><span><i style="color:' + RED + '"></i>above guidance</span><span><i style="color:' + GREEN + '"></i>below</span><span><i class="hollow" style="color:' + GREY + '"></i>not detected</span></div>';
    bindTips($('toxin'), tip, 'data-tip');
  }

  /* ---------- 5 · groundwater ---------- */
  function drawGroundwater() {
    var wells = W.wells.filter(function (w) { return w.lat != null; });
    var tip = tipper('gw-tip');
    var wtip = function (w) { return '<b>USGS ' + esc(w.sid) + '</b> · ' + esc(w.zone) + '<br>' + (w.yr || '') + ' · ' + fmt(w.km_from_ref, 1) + ' km from the divide' + (w.aquifer ? ' · ' + esc(w.aquifer) : '') + '<br>' + ['sodium_mgL|Na|mg/L', 'chloride_mgL|Cl|mg/L', 'hardness_mgL|hardness|mg/L', 'ph|pH|', 'iron_ugL|Fe|µg/L', 'manganese_ugL|Mn|µg/L', 'arsenic_ugL|As|µg/L', 'lithium_ugL|Li|µg/L', 'boron_ugL|B|µg/L', 'radon_pCiL|radon|pCi/L', 'nitrate_mgL_N|NO₃-N|mg/L', 'methane_mgL|CH₄|mg/L'].map(function (k) { var a = k.split('|'); return w[a[0]] != null ? a[1] + ' ' + fmt(w[a[0]]) + (a[2] ? ' ' + a[2] : '') : null; }).filter(Boolean).join(' · '); };
    /* Na vs Cl */
    var Wd = 480, H = 300, L = 44, R = 12, T = 12, B = 34, lo = 1, hi = 20000;
    var lg = function (v) { return Math.log10(Math.max(lo, v)); };
    var xs = function (v) { return L + (lg(v) - lg(lo)) / (lg(hi) - lg(lo)) * (Wd - L - R); }, ys = function (v) { return T + (1 - (lg(v) - lg(lo)) / (lg(hi) - lg(lo))) * (H - T - B); };
    var o = '';
    [1, 10, 100, 1000, 10000].forEach(function (v) { o += '<line class="grid" x1="' + xs(v) + '" x2="' + xs(v) + '" y1="' + T + '" y2="' + ys(lo) + '"/><line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + xs(v) + '" y="' + (H - 18) + '" text-anchor="middle">' + v.toLocaleString() + '</text><text class="lbl dim" x="' + (L - 5) + '" y="' + (ys(v) + 4) + '" text-anchor="end">' + v.toLocaleString() + '</text>'; });
    o += '<line stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3" x1="' + xs(1) + '" y1="' + ys(1) + '" x2="' + xs(10000) + '" y2="' + ys(10000) + '"/><text class="lbl dim" x="' + (xs(3000) + 4) + '" y="' + (ys(3000) - 6) + '">Na = Cl (salt line)</text>';
    o += '<text class="lbl" x="' + (Wd / 2) + '" y="' + (H - 4) + '" text-anchor="middle">sodium, mg/L</text><text class="lbl" transform="rotate(-90 12 ' + (H / 2) + ')" x="12" y="' + (H / 2) + '" text-anchor="middle">chloride, mg/L</text>';
    o += '<line stroke="' + RED + '" stroke-dasharray="5 4" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(250) + '" y2="' + ys(250) + '"/><text class="lim-lbl" x="' + (Wd - R) + '" y="' + (ys(250) - 3) + '" text-anchor="end">Cl 250 secondary MCL</text>';
    wells.filter(function (w) { return w.sodium_mgL != null && w.chloride_mgL != null; }).forEach(function (w) { var c = ZONECOL[w.zone] || GREY; var pl = /plateau/.test(w.zone); o += '<circle cx="' + xs(w.sodium_mgL) + '" cy="' + ys(w.chloride_mgL) + '" r="' + (pl ? 6 : 4.5) + '" fill="' + c + '" fill-opacity="' + (pl ? 1 : .8) + '" stroke="' + (pl ? '#fff' : '#00004d') + '" stroke-width="1.5" data-tip="' + esc(wtip(w)) + '"/>'; });
    $('gw1').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg>';
    /* radon strip */
    var zones = Object.keys(ZONECOL); var H2 = 40 + zones.length * 46, L2 = 150, lo2 = 50, hi2 = 5000;
    var xr = function (v) { return L2 + (lg(v) - lg(lo2)) / (lg(hi2) - lg(lo2)) * (Wd - L2 - R); };
    var o2 = '';
    [100, 300, 1000, 3000].forEach(function (v) { o2 += '<line class="grid" x1="' + xr(v) + '" x2="' + xr(v) + '" y1="10" y2="' + (H2 - 26) + '"/><text class="lbl dim" x="' + xr(v) + '" y="' + (H2 - 10) + '" text-anchor="middle">' + v.toLocaleString() + '</text>'; });
    o2 += '<line class="lim" x1="' + xr(300) + '" x2="' + xr(300) + '" y1="6" y2="' + (H2 - 26) + '"/><text class="lim-lbl" x="' + (xr(300) + 4) + '" y="14">300 proposed MCL</text>';
    zones.forEach(function (z, i) { var y = 34 + i * 46; var rows = wells.filter(function (w) { return w.zone === z && w.radon_pCiL != null; }); o2 += '<text class="lbl" x="' + (L2 - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(z.replace(' / ', ' · ')) + '</text><text class="lbl dim" x="' + (L2 - 8) + '" y="' + (y + 16) + '" text-anchor="end">' + rows.length + ' well' + (rows.length == 1 ? '' : 's') + '</text>'; rows.forEach(function (w, j) { o2 += '<circle cx="' + xr(Math.max(lo2, Math.min(hi2, w.radon_pCiL))) + '" cy="' + (y + ((j % 3) - 1) * 7) + '" r="5" fill="' + ZONECOL[z] + '" fill-opacity=".9" stroke="#00004d" stroke-width="1.2" data-tip="' + esc(wtip(w)) + '"/>'; }); });
    $('gw2').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H2 + '">' + o2 + '</svg>';
    bindTips($('gw1'), tip, 'data-tip'); bindTips($('gw2'), tip, 'data-tip');
    $('gw-legend').innerHTML = zones.map(function (z) { return '<span><i style="color:' + ZONECOL[z] + '"></i>' + esc(z) + '</span>'; }).join('') + '<span>ringed white = plateau well</span>';
    var pl = wells.filter(function (w) { return /plateau/.test(w.zone); }).sort(function (a, b) { return a.km_from_ref - b.km_from_ref; });
    $('gw-table').innerHTML = '<table class="ddtab"><thead><tr><th>USGS site</th><th>km</th><th>year</th><th>pH</th><th>Na mg/L</th><th>Cl mg/L</th><th>hardness</th><th>Li µg/L</th><th>B µg/L</th><th>As µg/L</th><th>Fe µg/L</th><th>Mn µg/L</th><th>radon pCi/L</th><th>NO₃-N</th></tr></thead><tbody>' + pl.map(function (w) { return '<tr><td class="l"><a href="https://waterdata.usgs.gov/monitoring-location/USGS-' + esc(w.sid) + '/" target="_blank" rel="noopener">' + esc(w.sid) + '</a></td><td>' + fmt(w.km_from_ref, 1) + '</td><td>' + (w.yr || '') + '</td><td>' + fmt(w.ph, 1) + '</td><td>' + fmt(w.sodium_mgL, 0) + '</td><td>' + fmt(w.chloride_mgL, 1) + '</td><td>' + fmt(w.hardness_mgL, 0) + '</td><td>' + fmt(w.lithium_ugL, 0) + '</td><td>' + fmt(w.boron_ugL, 0) + '</td><td>' + fmt(w.arsenic_ugL, 1) + '</td><td>' + fmt(w.iron_ugL, 0) + '</td><td>' + fmt(w.manganese_ugL, 0) + '</td><td>' + fmt(w.radon_pCiL, 0) + '</td><td>' + fmt(w.nitrate_mgL_N, 2) + '</td></tr>'; }).join('') + '</tbody></table><p class="sg-note">One sample per well, most from a single year; the 1992 cluster near Oak Hill with chloride in the thousands is a salt-storage study, not ambient water.</p>';
  }

  /* ---------- 6 · outfalls ---------- */
  function drawOutfalls() {
    var dmr = by(W.dmr, 'permit');
    var perms = W.permits.filter(function (p) { return dmr[p.npdes_id] && +p.km_from_ref <= 24; }).sort(function (a, b) { return a.km_from_ref - b.km_from_ref; });
    var tip = tipper('of-tip');
    var UNIT_PREF = ['mg/L', 'ug/L', 'ng/L', 'MGD', 'gal/d', '#/100mL', 'CFU/100mL', 'SU', 'deg C', 'deg F', 'mL/L', '%', 'lb/d'];
    function famOptions(rows) { var fams = uniq(rows.filter(function (r) { return r.src === 'DMR' && r.u; }).map(function (r) { return r.fam; })); var pref = ['phosphorus', 'ammonia', 'BOD', 'TSS', 'fecal coliform', 'flow', 'DO', 'pH', 'chlorine', 'nitrate/nitrite', 'nitrogen (TKN)']; return fams.sort(function (a, b) { var ia = pref.indexOf(a), ib = pref.indexOf(b); if (ia < 0) ia = 99; if (ib < 0) ib = 99; return ia - ib || a.localeCompare(b); }); }
    function chart(p, fam) {
      var rows = dmr[p.npdes_id].filter(function (r) { return r.fam === fam; });
      var units = uniq(rows.filter(function (r) { return r.src === 'DMR' && r.u; }).map(function (r) { return r.u; })).sort(function (a, b) { var ia = UNIT_PREF.indexOf(a), ib = UNIT_PREF.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
      var unit = units[0]; if (!unit) return '<p class="sg-det">No unit-resolved rows for this parameter.</p>';
      var outs = uniq(rows.map(function (r) { return r.out; })).sort(); var out = outs[0];
      var ser = rows.filter(function (r) { return r.src === 'DMR' && r.u === unit && r.out === out; }).sort(function (a, b) { return a.fy - b.fy; });
      var lt = rows.filter(function (r) { return r.src === 'LT' && r.out === out && /mg\/L/.test(r.u) && /mg\/L/.test(unit); }).sort(function (a, b) { return a.fy - b.fy; });
      var unitless = rows.filter(function (r) { return r.src === 'DMR' && !r.u && r.out === out; }).length;
      var Y0 = 2007, Y1 = 2026, Wd = 900, H = 190, L = 56, R = 16, T = 14, B = 30;
      /* y-scale follows the DATA (medians, maxima, Loading Tool means); the limit is drawn where it falls and, when it is
         far above the data (Haleon's 6.8 mg/L phosphorus limit over a 0.02–0.24 median), it is pinned to the top edge and
         labelled as off scale — otherwise the generous limit flattens the very movement the panel exists to show. */
      var vals = ser.map(function (r) { return r.max; }).concat(ser.map(function (r) { return r.med; }), lt.map(function (r) { return r.med; })).filter(function (v) { return v != null && !isNaN(v); });
      var dmx = Math.max.apply(null, vals.concat([0.001]));
      var limv = ser.filter(function (r) { return r.lim != null; }).map(function (r) { return r.lim; });
      var lmx = limv.length ? Math.max.apply(null, limv) : null;
      var mx = (lmx != null && lmx <= dmx * 2.5 ? Math.max(dmx, lmx) : dmx) * 1.12; var limOff = lmx != null && lmx > mx;
      var xs = function (y) { return L + (y - Y0) / (Y1 - Y0) * (Wd - L - R); }, ys = function (v) { return T + (1 - v / mx) * (H - T - B); };
      var o = '';
      for (var y = Y0; y <= Y1; y++) { if (y % 2) continue; o += '<text class="lbl dim" x="' + xs(y) + '" y="' + (H - 8) + '" text-anchor="middle">' + y + '</text>'; }
      o += '<rect x="' + xs(2017) + '" y="' + T + '" width="' + (xs(2019) - xs(2017)) + '" height="' + (ys(0) - T) + '" fill="rgba(255,255,255,.05)"/><text class="lbl dim" x="' + xs(2018) + '" y="' + (T + 10) + '" text-anchor="middle" font-size="9">EPA FY17–18 gap</text>';
      [0, .25, .5, .75, 1].forEach(function (f) { var v = mx / 1.12 * f; if (limOff && f === 1) return; o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + (L - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end">' + fmt(v) + '</text>'; });
      o += '<text class="lbl" transform="rotate(-90 12 ' + (H / 2) + ')" x="12" y="' + (H / 2) + '" text-anchor="middle">' + esc(unit) + '</text>';
      /* limit as a step line */
      var lims = ser.filter(function (r) { return r.lim != null; }); if (lims.length) { var d = ''; lims.forEach(function (r, i) { var x0 = xs(r.fy) - (xs(1) - xs(0)) / 2, x1 = xs(r.fy) + (xs(1) - xs(0)) / 2; var yl = Math.max(T, ys(r.lim)); d += (i ? ' L' : 'M') + x0 + ' ' + yl + ' L' + x1 + ' ' + yl; }); o += '<path class="lim" fill="none" d="' + d + '"/><text class="lim-lbl" x="' + (Wd - R) + '" y="' + (Math.max(T, ys(lims[lims.length - 1].lim)) - 4) + '" text-anchor="end">limit ' + fmt(lims[lims.length - 1].lim) + (limOff ? ' — off scale, above this chart' : '') + '</text>'; }
      var col = COL[txOf(S[Object.keys(SITE_PERMIT).filter(function (k) { return SITE_PERMIT[k] === p.npdes_id; })[0]] || {}) ] || (/Catskill|Durham/i.test(p.transect || '') ? COL.south : /Hannacroix|Basic/i.test(p.transect || '') ? COL.north : COL.other);
      ser.forEach(function (r) { if (r.max != null) o += '<circle cx="' + xs(r.fy) + '" cy="' + ys(r.max) + '" r="3.5" fill="' + col + '" fill-opacity=".35" data-tip="' + esc('<b>FY' + r.fy + '</b> maximum ' + fmt(r.max) + ' ' + unit + (r.e90 ? ' · ' + r.e90 + ' exceedance' + (r.e90 == 1 ? '' : 's') : '')) + '"/>'; });
      var pts = ser.filter(function (r) { return r.med != null; }); if (pts.length > 1) o += '<polyline fill="none" stroke="' + col + '" stroke-width="2" points="' + pts.map(function (r) { return xs(r.fy) + ',' + ys(r.med); }).join(' ') + '"/>';
      pts.forEach(function (r) { o += '<circle cx="' + xs(r.fy) + '" cy="' + ys(r.med) + '" r="5" fill="' + col + '" stroke="#00004d" stroke-width="1.5"' + (r.ui ? ' stroke-dasharray="2 1.5" stroke="#fff"' : '') + ' data-tip="' + esc('<b>FY' + r.fy + '</b> · ' + esc(r.p) + ' · outfall ' + r.out + '<br>median ' + fmt(r.med) + ' ' + unit + ' · max ' + fmt(r.max) + ' · limit ' + (r.lim != null ? fmt(r.lim) : 'none') + '<br>' + r.n + ' values' + (r.e90 ? ' · ' + r.e90 + ' exceedance' + (r.e90 == 1 ? '' : 's') : '') + (r.ui ? '<br><i>unit inherited from the permit limit (EPA\'s pre-2017 extracts carry none)</i>' : '')) + '"/>'; });
      lt.forEach(function (r) { o += '<path d="M' + xs(r.fy) + ' ' + (ys(r.med) - 6) + ' l6 6 l-6 6 l-6 -6 z" fill="none" stroke="' + col + '" stroke-width="2" data-tip="' + esc('<b>FY' + r.fy + '</b> EPA Loading Tool annual mean ' + fmt(r.med) + ' mg/L' + (r.kg != null ? ' · ' + fmt(r.kg, 1) + ' kg/yr' : '') + '<br><i>a different clock: annual estimate, not monthly reports</i>') + '"/>'; });
      var last = pts[pts.length - 1], first = pts[0];
      var head = last ? '<span class="sg-val" style="font-size:18px">' + fmt(last.med) + '<span class="c">' + esc(unit) + ' median, FY' + last.fy + (last.lim != null ? ' · ' + Math.round(last.med / last.lim * 100) + '% of limit' : lims.length ? ' · limit not carried in this year\'s extract' : ' · no limit in the permit') + '</span></span>' : '';
      return head + '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg><div class="lg"><span><i style="color:' + col + '"></i>annual median of monthly reports</span><span><i style="color:' + col + ';opacity:.4"></i>year maximum</span><span><i class="dia hollow" style="color:' + col + '"></i>EPA Loading Tool annual mean</span><span><i class="line" style="color:' + RED + '"></i>permit limit</span>' + (outs.length > 1 ? '<span>outfall ' + out + ' of ' + outs.join(', ') + '</span>' : '') + (unitless ? '<span style="opacity:.7">' + unitless + ' row' + (unitless == 1 ? '' : 's') + ' without a unit not drawn</span>' : '') + '</div>';
    }
    var near = perms.filter(function (p) { return +p.km_from_ref <= 16; }), far = perms.filter(function (p) { return +p.km_from_ref > 16; });
    perms = W.permits.filter(function (p) { return dmr[p.npdes_id] && (+p.km_from_ref <= 24 || p.watchlist_note); }).sort(function (a, b) { return a.km_from_ref - b.km_from_ref; });
    near = perms.filter(function (p) { return +p.km_from_ref <= 16; }); far = perms.filter(function (p) { return +p.km_from_ref > 16; });
    var render = function (list) { return list.map(function (p) { var fams = famOptions(dmr[p.npdes_id]); if (!fams.length) return ''; var def = fams.indexOf('phosphorus') >= 0 ? 'phosphorus' : fams[0]; return '<div class="of" data-permit="' + esc(p.npdes_id) + '"><div class="h"><div><b>' + esc(p.facility) + '</b> ' + (p.watchlist_note ? '<span class="chip watch" title="' + esc(p.watchlist_note) + '">★ watchlist</span> ' : '') + '<span class="m">' + esc(p.npdes_id) + ' · ' + esc(p.receiving_water || '') + ' · ' + fmt(p.km_from_ref, 1) + ' km · ' + (p.design_flow_mgd != null ? p.design_flow_mgd + ' MGD design · ' : '') + esc(p.effluent_violations_3yr) + ' exceedances (3 yr)' + (p.dfr_url ? ' · <a href="' + esc(p.dfr_url) + '" target="_blank" rel="noopener">ECHO</a>' : '') + '</span></div><select class="sg-sel of-sel">' + fams.map(function (f) { return '<option' + (f === def ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select></div>' + (p.watchlist_note ? '<div class="sg-det" style="margin:2px 0 4px;font-style:italic;opacity:.9">' + esc(p.watchlist_note) + '</div>' : '') + '<div class="of-body">' + chart(p, def) + '</div></div>'; }).join(''); };
    $('outfalls').innerHTML = render(near) + (far.length ? '<details class="sg-more"><summary>' + far.length + ' more permitted outfalls — 16–24 km from the divide, plus the brief\'s watchlist farther out (Selkirk, Ravena, Albany, Cohoes)</summary>' + render(far) + '</details>' : '');
    $('outfalls').addEventListener('change', function (e) { var sel = e.target; if (!sel.classList.contains('of-sel')) return; var box = sel.closest('.of'); var p = PERMIT[box.getAttribute('data-permit')]; box.querySelector('.of-body').innerHTML = chart(p, sel.value); });
    bindTips($('outfalls'), tip, 'data-tip');
  }

  /* ---------- 6b · FY2025 regional loads ---------- */
  function drawLoads() {
    var rows = W.regional_top10 || []; if (!rows.length) { $('loads').innerHTML = '<p class="sg-det" style="padding:6px">No regional load table in the workbook.</p>'; return; }
    var pols = uniq(rows.map(function (r) { return r.pollutant; }));
    var pref = ['Phosphorus, total [as P]', 'Nitrogen, ammonia total [as N]', 'BOD, 5-day, 20 deg. C', 'Solids, total suspended', 'Nitrogen, total [as N]', 'Solids, total dissolved'];
    pols.sort(function (a, b) { var ia = pref.indexOf(a), ib = pref.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
    var sel = $('load-sel'); sel.innerHTML = pols.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
    var tip = tipper('of-tip');
    var draw = function (pol) {
      var rs = rows.filter(function (r) { return r.pollutant === pol; }).sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); });
      var ok = rs.filter(function (r) { return !r.flag; }); var mx = Math.max.apply(null, (ok.length ? ok : rs).map(function (r) { return +r.kg_yr || 0; }).concat([1])) * 1.05;
      var Wd = 900, L = 300, R = 120, rowH = 26, H = 14 + rs.length * rowH;
      var xs = function (v) { return L + Math.min(1, v / mx) * (Wd - L - R); };
      var o = '';
      rs.forEach(function (r, i) { var y = 8 + i * rowH; var flagged = !!r.flag; var v = +r.kg_yr || 0; var w = Math.max(2, xs(v) - L); var tp = '<b>' + esc(r.facility) + '</b> · ' + esc(r.city) + ', ' + esc(r.county) + ' · ' + r.miles + ' mi<br>' + fmt(v, 0) + ' kg/yr · ' + r.n_months + ' months · ' + r.n_outfalls + ' outfall' + (r.n_outfalls == 1 ? '' : 's') + '<br>' + esc(r.method) + (flagged ? '<br><i style="color:' + AMBER + '">⚑ ' + esc(r.flag) + '</i>' : '') + '<br>' + esc(r.facility_type) + ' · ' + esc(r.major || '') + ' · → ' + esc(r.receiving_water || ''); o += '<text class="lbl" x="' + (L - 8) + '" y="' + (y + 12) + '" text-anchor="end">' + esc(String(r.facility).length > 38 ? String(r.facility).slice(0, 36) + '…' : r.facility) + '</text><text class="lbl dim" x="' + (L - 8) + '" y="' + (y + 22) + '" text-anchor="end" font-size="9">' + esc(r.city) + ' · ' + r.miles + ' mi</text><rect x="' + L + '" y="' + (y + 3) + '" width="' + w + '" height="12" rx="3" fill="' + (flagged ? 'none' : COL.north) + '" stroke="' + (flagged ? AMBER : 'none') + '" stroke-width="1.5"' + (flagged ? ' stroke-dasharray="4 3"' : '') + ' data-tip="' + esc(tp) + '"/><text class="lbl dim" x="' + (L + w + 6) + '" y="' + (y + 13) + '">' + fmt(v, 0) + (flagged ? ' ⚑' : '') + (v > mx ? ' (off scale)' : '') + '</text>'; });
      $('loads').innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg><div class="lg"><span><i class="sq" style="color:' + COL.north + '"></i>annual load, kg/yr</span><span><i class="sq hollow" style="color:' + AMBER + '"></i>⚑ flagged (monthly maxima, &lt; 6 months, or an EPA outlier) — hover for the flag</span></div>';
    };
    draw(pols[0]); sel.addEventListener('change', function () { draw(sel.value); }); bindTips($('loads'), tip, 'data-tip');
  }

  /* ---------- 7 · TRI air ---------- */
  var YEARS = []; for (var yy = 1987; yy <= 2024; yy++) YEARS.push(yy);
  function drawTRI() {
    var tip = tipper('tri-tip');
    var trend = (W.tri_trend || []).map(function (r) { var latest = null; for (var i = YEARS.length - 1; i >= 0; i--) { if (r[YEARS[i]] != null) { latest = { y: YEARS[i], v: r[YEARS[i]] }; break; } } return { r: r, latest: latest }; }).filter(function (d) { return d.latest && d.latest.y >= 2022; }).sort(function (a, b) { return b.latest.v - a.latest.v; }).slice(0, 8);
    var short = function (c) { return String(c).replace(/\s*\(.*$/, ''); };
    var Wd = 300, H = 120, L = 34, R = 8, T = 8, B = 20;
    var xs = function (y) { return L + (y - 1987) / (2024 - 1987) * (Wd - L - R); };
    $('tri-trend').innerHTML = trend.map(function (d) {
      var r = d.r; var vals = YEARS.map(function (y) { return r[y] != null ? { y: y, v: +r[y] } : null; }).filter(Boolean);
      var pos = vals.filter(function (p) { return p.v > 0; }); var lo = Math.max(1, Math.min.apply(null, pos.map(function (p) { return p.v; })) / 2), hi = Math.max.apply(null, pos.map(function (p) { return p.v; })) * 1.5;
      var lg = function (v) { return Math.log10(Math.max(lo, v)); }; var ys = function (v) { return T + (1 - (lg(v) - lg(lo)) / (lg(hi) - lg(lo))) * (H - T - B); };
      var o = ''; var ticks = [1, 10, 100, 1000, 1e4, 1e5, 1e6, 1e7].filter(function (v) { return v >= lo && v <= hi; }); ticks.forEach(function (v) { o += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text class="lbl dim" x="' + (L - 3) + '" y="' + (ys(v) + 3) + '" text-anchor="end" font-size="8.5">' + (v >= 1e6 ? (v / 1e6) + 'M' : v >= 1000 ? (v / 1000) + 'k' : v) + '</text>'; });
      [1990, 2000, 2010, 2020].forEach(function (y) { o += '<text class="lbl dim" x="' + xs(y) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9">' + y + '</text>'; });
      o += '<polyline fill="none" stroke="' + COL.other + '" stroke-width="1.8" stroke-opacity=".8" points="' + pos.map(function (p) { return xs(p.y) + ',' + ys(p.v); }).join(' ') + '"/>';
      vals.forEach(function (p) { o += '<circle cx="' + xs(p.y) + '" cy="' + (p.v > 0 ? ys(p.v) : ys(lo)) + '" r="3" fill="' + (p.v > 0 ? COL.other : 'none') + '" stroke="' + (p.v > 0 ? '#00004d' : GREY) + '" stroke-width="1" data-tip="' + esc('<b>' + short(r.chemical) + '</b> ' + p.y + '<br>' + fmt(p.v, 0) + ' lb on-site, all reporters within 50 mi') + '"/>'; });
      var first = pos[0], last = pos[pos.length - 1];
      return '<div class="sg-chart" style="border-left:4px solid ' + COL.other + '"><div class="cap" title="' + esc(r.chemical) + '">' + esc(short(r.chemical)) + '<span>' + fmt(last.v, 0) + ' lb · ' + last.y + ' · ' + fmt(r.n_facilities_latest, 0) + ' reporter' + (r.n_facilities_latest == 1 ? '' : 's') + '</span></div><svg viewBox="0 0 ' + Wd + ' ' + H + '">' + o + '</svg></div>';
    }).join('');
    /* mercury */
    var hg = (W.tri_mercury || []).filter(function (m) { return +m.miles <= 50; }).map(function (m) { var pts = YEARS.map(function (y) { return m[y] != null ? { y: y, v: +m[y] } : null; }).filter(Boolean); return { m: m, pts: pts, peak: Math.max.apply(null, pts.map(function (p) { return p.v; }).concat([0])) }; }).filter(function (d) { return d.pts.length; }).sort(function (a, b) { return b.peak - a.peak; });
    var Wd2 = 480, H2 = 260, L2 = 44, R2 = 12, T2 = 12, B2 = 32, lo2 = 0.5, hi2 = 1000;
    var lg2 = function (v) { return Math.log10(Math.max(lo2, v)); }; var xs2 = function (y) { return L2 + (y - 1987) / (2024 - 1987) * (Wd2 - L2 - R2); }, ys2 = function (v) { return T2 + (1 - (lg2(v) - lg2(lo2)) / (lg2(hi2) - lg2(lo2))) * (H2 - T2 - B2); };
    var o2 = ''; [1, 10, 100, 1000].forEach(function (v) { o2 += '<line class="grid" x1="' + L2 + '" x2="' + (Wd2 - R2) + '" y1="' + ys2(v) + '" y2="' + ys2(v) + '"/><text class="lbl dim" x="' + (L2 - 5) + '" y="' + (ys2(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
    [1990, 2000, 2010, 2020].forEach(function (y) { o2 += '<text class="lbl dim" x="' + xs2(y) + '" y="' + (H2 - 14) + '" text-anchor="middle">' + y + '</text>'; });
    o2 += '<text class="lbl" x="' + (Wd2 / 2) + '" y="' + (H2 - 2) + '" text-anchor="middle">lb/yr to the air, log</text>';
    var HGCOL = [COL.north, COL.south, COL.potic, COL.other]; var lgd = '';
    hg.slice(0, 4).forEach(function (d, i) { var c = HGCOL[i]; if (d.pts.length > 1) o2 += '<polyline fill="none" stroke="' + c + '" stroke-width="2" points="' + d.pts.map(function (p) { return xs2(p.y) + ',' + ys2(p.v); }).join(' ') + '"/>'; d.pts.forEach(function (p) { o2 += '<circle cx="' + xs2(p.y) + '" cy="' + ys2(p.v) + '" r="4" fill="' + c + '" stroke="#00004d" stroke-width="1.2" data-tip="' + esc('<b>' + d.m.facility + '</b> · ' + d.m.city + ' · ' + d.m.miles + ' mi<br>' + p.y + ': ' + fmt(p.v, 1) + ' lb mercury to the air' + (d.m.note ? '<br><i>' + d.m.note + '</i>' : '')) + '"/>'; }); var last = d.pts[d.pts.length - 1]; o2 += '<text class="lbl" x="' + (xs2(last.y) + 6) + '" y="' + (ys2(last.v) + 4) + '"' + (xs2(last.y) > Wd2 - 90 ? ' text-anchor="end" dx="-12"' : '') + '>' + esc(String(d.m.city || '').charAt(0) + String(d.m.city || '').slice(1).toLowerCase()) + '</text>'; lgd += '<span><i class="line" style="color:' + c + '"></i>' + esc(d.m.facility) + ' (' + d.m.miles + ' mi)</span>'; });
    var others = hg.slice(4);
    others.forEach(function (d) { d.pts.forEach(function (p) { o2 += '<circle cx="' + xs2(p.y) + '" cy="' + ys2(p.v) + '" r="3" fill="none" stroke="' + GREY + '" stroke-width="1.2" data-tip="' + esc('<b>' + d.m.facility + '</b> · ' + d.m.city + ' · ' + d.m.miles + ' mi<br>' + p.y + ': ' + fmt(p.v, 1) + ' lb') + '"/>'; }); });
    if (others.length) lgd += '<span><i class="hollow" style="color:' + GREY + '"></i>' + others.length + ' other reporter' + (others.length == 1 ? '' : 's') + ' (hover)</span>';
    $('tri-hg').innerHTML = '<svg viewBox="0 0 ' + Wd2 + ' ' + H2 + '">' + o2 + '</svg><div class="lg">' + lgd + '</div>';
    var rav = hg.filter(function (d) { return /RAVENA CEMENT/.test(d.m.facility); })[0];
    $('tri-hg-note').innerHTML = rav ? 'The Ravena cement plant is the region\'s mercury source: ' + fmt(rav.peak, 0) + ' lb/yr at its peak, ' + fmt(rav.pts[rav.pts.length - 1].v, 1) + ' lb in ' + rav.pts[rav.pts.length - 1].y + (rav.m.note ? ' — ' + esc(rav.m.note) : '') + '. Mercury reporting threshold is 100 lb manufactured or used, so small emitters are absent.' : '';
    /* nearest reporters table */
    var near = (W.tri_facilities || []).filter(function (f) { return +f.miles <= 30; }).sort(function (a, b) { return (+a.miles - +b.miles) || (b.peak_air - a.peak_air); });
    var chem = by(W.tri_chemicals || [], 'id');
    $('tri-near').innerHTML = '<div class="tri-scroll"><table class="ddtab tri-tab"><thead><tr><th>Facility</th><th>mi</th><th>filed</th><th>latest on-site lb</th><th>peak air lb/yr</th></tr></thead><tbody>' + near.map(function (f) { var top = (chem[f.id] || []).slice(0, 3).map(function (c) { return short(c.chem) + (c.carc === 'YES' ? ' ⚠' : '') + (c.pbt === 'YES' ? ' ◆' : '') + (c.pfas === 'YES' ? ' PFAS' : ''); }).join(', '); var tp = '<b>' + esc(f.name) + '</b> · ' + esc(f.city) + ' · ' + esc(f.sector || '') + (f.parent ? ' · ' + esc(f.parent) : '') + '<br>filed ' + f.y0 + '–' + f.y1 + '<br>' + (chem[f.id] || []).slice(0, 6).map(function (c) { return short(c.chem) + ' peak ' + fmt(c.peak, 0) + ' (' + c.peak_y + ')'; }).join('<br>'); return '<tr data-tip="' + esc(tp) + '"><td class="l">' + esc(f.name) + '<small>' + esc(f.city) + ' · ' + esc(f.sector || '') + (top ? ' · ' + esc(top) : '') + '</small></td><td>' + f.miles + '</td><td>' + (f.y0 === f.y1 ? f.y1 : f.y0 + '–' + f.y1) + '</td><td>' + fmt(f.latest.on, 0) + ' <span style="opacity:.7;font-size:10px">' + f.latest.y + '</span></td><td>' + fmt(f.peak_air, 0) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="sg-note">' + near.length + ' reporters within 30 miles, nearest first; the list scrolls. ⚠ carcinogen · ◆ persistent bioaccumulative toxic, per EPA\'s TRI list. Hover a row for the chemical detail. Hannay Reels in Westerlo is the plateau\'s only reporter: xylene to the air 1989–1991, then a zero diisocyanate filing in 2014.</p>';
    bindTips($('tri-trend'), tip, 'data-tip'); bindTips($('tri-hg'), tip, 'data-tip'); bindTips($('tri-near'), tip, 'data-tip');
  }

  /* ---------- 8 · map ---------- */
  function drawMap() {
    if (!window.maplibregl) { $('wq-map').innerHTML = '<p class="sg-det" style="padding:12px">Map library did not load.</p>'; return; }
    var map = new maplibregl.Map({ container: 'wq-map', style: 'https://tiles.openfreemap.org/styles/positron', center: [-73.98, 42.42], zoom: 9.2, attributionControl: true, scrollZoom: false });
    /* v994 (Laurie): no cooperative-gesture overlay. The wheel scrolls the page until you click the map; after a click it zooms the map, and leaving the map hands the wheel back to the page. +/- buttons, double-click and pinch always work. */
    map.getCanvasContainer().addEventListener('mousedown', function () { map.scrollZoom.enable(); });
    map.getContainer().addEventListener('mouseleave', function () { map.scrollZoom.disable(); });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    var pts = function (rows, f) { return { type: 'FeatureCollection', features: rows.filter(function (r) { return r.lat != null && r.lon != null; }).map(function (r) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [+r.lon, +r.lat] }, properties: f(r) }; }) }; };
    var nodes = { type: 'FeatureCollection', features: SITES.filter(function (s) { return s.lat_approx != null; }).map(function (s) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [+s.lon_approx, +s.lat_approx] }, properties: { id: s.site_id, name: s.name, col: COL[txOf(s)], st: statusOf(s), html: '<b>' + esc(s.name) + '</b><div>' + esc(s.node_type.replace(/_/g, ' ')) + ' · ' + esc(s.data_status || '') + '</div>' + (s.topline_summary ? '<div style="margin-top:4px">' + esc(s.topline_summary) + '</div>' : '') } }; }) };
    var condCol = function (c) { return /Unsound/.test(c || '') ? RED : /Deficient/.test(c || '') ? AMBER : /No deficiencies/.test(c || '') ? '#ffffff' : '#9aa0c8'; };
    var dams = pts(W.dams, function (d) { return { name: d.dam_name, col: condCol(d.LastConditionRating), r: /High/.test(d.hazard_class || '') ? 8 : /Intermediate/.test(d.hazard_class || '') ? 6 : 4, dash: /Not Rated/.test(d.LastConditionRating || '') ? 1 : 0, html: '<b>' + esc(d.dam_name) + '</b><div>' + esc(d.hazard_class || '') + ' · <b>' + esc(d.LastConditionRating || 'not rated') + '</b>' + (d.LastInspection ? ' (' + esc(d.LastInspection) + ')' : '') + '</div><div>' + (d.stream ? esc(d.stream) + ' · ' : '') + (d.YEARBUILT ? 'built ' + esc(d.YEARBUILT) + ' · ' : '') + (d.normal_storage_acft ? fmt(d.normal_storage_acft, 0) + ' ac-ft' : '') + (d.in_basic_creek_res_catchment === 'yes' ? ' · <i>inside the Basic Creek catchment</i>' : '') + '</div>' }; });
    var permits = pts(W.permits, function (p) { return { name: p.facility, v: +p.effluent_violations_3yr || 0, watch: p.watchlist_note ? 1 : 0, html: (p.watchlist_note ? '<div style="color:#6a3fb5;font-weight:700">★ watchlist — ' + esc(p.watchlist_note) + '</div>' : '') + '<b>' + esc(p.facility) + '</b><div>' + esc(p.npdes_id) + ' · ' + esc(p.receiving_water || '') + '</div><div>' + (p.design_flow_mgd != null ? p.design_flow_mgd + ' MGD · ' : '') + esc(p.effluent_violations_3yr) + ' effluent exceedances (3 yr) · ' + esc(p.compliance_status || '') + '</div>' + (p.dfr_url ? '<div><a href="' + esc(p.dfr_url) + '" target="_blank" rel="noopener">ECHO report</a></div>' : '') }; });
    var stations = pts(W.stations, function (s) { var rows = W.biology.filter(function (b) { return b.code === s.code && b.bap != null; }).sort(function (a, b) { return b.yr - a.yr; }); var l = rows[0]; return { name: s.code, bap: l ? l.bap : null, html: '<b>' + esc(s.code) + '</b><div>' + esc(s.name || '') + ' · mile ' + s.mile + '</div>' + (l ? '<div>BAP ' + fmt(l.bap, 2) + ' (' + l.yr + ')' + (rows.length > 1 ? ' · ' + rows.length + ' visits' : '') + '</div>' : '') }; });
    var wells = pts(W.wells, function (w) { return { col: ZONECOL[w.zone] || GREY, html: '<b>USGS ' + esc(w.sid) + '</b><div>' + esc(w.zone) + ' · ' + (w.yr || '') + '</div><div>' + ['sodium_mgL|Na', 'chloride_mgL|Cl', 'iron_ugL|Fe µg/L', 'manganese_ugL|Mn µg/L', 'radon_pCiL|radon'].map(function (k) { var a = k.split('|'); return w[a[0]] != null ? a[1] + ' ' + fmt(w[a[0]]) : null; }).filter(Boolean).join(' · ') + '</div>' }; });
    var tri = pts(W.tri_facilities || [], function (f) { return { name: f.name, r: 4 + Math.min(10, Math.log10(Math.max(1, f.peak_air || 1)) * 1.6), html: '<b>' + esc(f.name) + '</b><div>' + esc(f.city) + ' · ' + esc(f.sector || '') + ' · TRI ' + (f.y0 === f.y1 ? f.y1 : f.y0 + '–' + f.y1) + '</div><div>peak air ' + fmt(f.peak_air, 0) + ' lb/yr · latest on-site ' + fmt(f.latest.on, 0) + ' lb (' + f.latest.y + ')' + (f.latest.top ? '<br>' + esc(f.latest.top) : '') + '</div>' }; });
    var karst = { type: 'FeatureCollection', features: [] }; ['karst_albsch', 'karst_schomont'].forEach(function (k) { (W.geo[k] && W.geo[k].features || []).forEach(function (f) { f.properties = { cov: 0, html: '<b>Karst sinkhole</b><div>' + esc(f.properties.feature || '') + ' · ' + esc(f.properties.host_unit || '') + '</div>' }; karst.features.push(f); }); }); ['karst_albsch_cov', 'karst_schomont_cov'].forEach(function (k) { (W.geo[k] && W.geo[k].features || []).forEach(function (f) { f.properties = { cov: 1, html: '<b>Covered-karst candidate</b><div>' + esc(f.properties.feature || '') + '</div>' }; karst.features.push(f); }); });
    map.on('load', function () {
      if (W.geo.aquifers) { map.addSource('aq', { type: 'geojson', data: W.geo.aquifers }); map.addLayer({ id: 'aq', type: 'fill', source: 'aq', paint: { 'fill-color': '#3987e5', 'fill-opacity': .18 } }); map.addLayer({ id: 'aq-l', type: 'line', source: 'aq', paint: { 'line-color': '#3987e5', 'line-width': .6, 'line-opacity': .5 } }); }
      if (W.geo.basin) { map.addSource('basin', { type: 'geojson', data: W.geo.basin }); map.addLayer({ id: 'basin', type: 'line', source: 'basin', paint: { 'line-color': '#1a1d5c', 'line-width': 2.2, 'line-dasharray': [3, 2] } }); }
      map.addSource('karst', { type: 'geojson', data: karst }); map.addLayer({ id: 'karst', type: 'circle', source: 'karst', paint: { 'circle-radius': 3.5, 'circle-color': ['case', ['==', ['get', 'cov'], 1], 'rgba(0,0,0,0)', '#5b4636'], 'circle-stroke-color': '#5b4636', 'circle-stroke-width': 1.2 } });
      map.addSource('dams', { type: 'geojson', data: dams }); map.addLayer({ id: 'dams', type: 'circle', source: 'dams', paint: { 'circle-radius': ['get', 'r'], 'circle-color': 'rgba(26,29,92,.15)', 'circle-stroke-color': ['get', 'col'], 'circle-stroke-width': 2.2 } });
      map.addSource('tri', { type: 'geojson', data: tri }); map.addLayer({ id: 'tri', type: 'circle', source: 'tri', paint: { 'circle-radius': ['get', 'r'], 'circle-color': 'rgba(139,92,246,.25)', 'circle-stroke-color': '#7c3aed', 'circle-stroke-width': 1.5 } });
      map.addSource('permits', { type: 'geojson', data: permits }); map.addLayer({ id: 'permits-w', type: 'circle', source: 'permits', filter: ['==', ['get', 'watch'], 1], paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#8a2be2', 'circle-stroke-width': 2 } }); map.addLayer({ id: 'permits', type: 'symbol', source: 'permits', layout: { 'text-field': '✕', 'text-size': ['interpolate', ['linear'], ['get', 'v'], 0, 13, 20, 22], 'text-allow-overlap': true, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#8a2be2', 'text-halo-color': '#fff', 'text-halo-width': 1.2 } });
      map.addSource('wells', { type: 'geojson', data: wells }); map.addLayer({ id: 'wells', type: 'circle', source: 'wells', paint: { 'circle-radius': 3.5, 'circle-color': ['get', 'col'], 'circle-stroke-color': '#fff', 'circle-stroke-width': .8 }, layout: { visibility: 'none' } });
      map.addSource('stations', { type: 'geojson', data: stations }); map.addLayer({ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-radius': 4.5, 'circle-color': ['case', ['==', ['get', 'bap'], null], '#9aa0c8', ['>=', ['get', 'bap'], 7.5], GREEN, ['>=', ['get', 'bap'], 5], AMBER, ['>=', ['get', 'bap'], 2.5], '#f08a4b', RED], 'circle-stroke-color': '#1a1d5c', 'circle-stroke-width': 1 }, layout: { visibility: 'none' } });
      map.addSource('nodes', { type: 'geojson', data: nodes }); map.addLayer({ id: 'nodes', type: 'circle', source: 'nodes', paint: { 'circle-radius': 8, 'circle-color': ['case', ['==', ['get', 'st'], 'rich'], ['get', 'col'], 'rgba(255,255,255,.15)'], 'circle-stroke-color': ['get', 'col'], 'circle-stroke-width': ['case', ['==', ['get', 'st'], 'none'], 1.2, 2.5] } }); map.addLayer({ id: 'nodes-l', type: 'symbol', source: 'nodes', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'], 'text-max-width': 12 }, paint: { 'text-color': '#1a1d5c', 'text-halo-color': '#fff', 'text-halo-width': 1.2 } });
      ['nodes', 'dams', 'permits', 'wells', 'stations', 'karst', 'tri'].forEach(function (id) { map.on('click', id, function (e) { new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.features[0].geometry.coordinates.slice()).setHTML(e.features[0].properties.html).addTo(map); }); map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; }); });
      var togs = [['nodes', 'Nodes', ['nodes', 'nodes-l'], true], ['basin', 'Basic Creek catchment', ['basin'], true], ['aq', 'Valley-fill aquifers', ['aq', 'aq-l'], true], ['karst', 'Karst sinkholes', ['karst'], true], ['dams', 'Dams (ring = condition)', ['dams'], true], ['permits', 'Outfalls (✕ sized by exceedances; ring = watchlist)', ['permits', 'permits-w'], true], ['tri', 'TRI reporters (sized by peak air release)', ['tri'], true], ['stations', 'Biomonitoring stations (colour = latest BAP)', ['stations'], false], ['wells', 'USGS wells', ['wells'], false]];
      $('mp-tog').innerHTML = togs.map(function (t) { return '<label><input type="checkbox" data-layers="' + t[2].join(',') + '"' + (t[3] ? ' checked' : '') + '>' + t[1] + '</label>'; }).join('');
      $('mp-tog').addEventListener('change', function (e) { var cb = e.target; if (cb.tagName !== 'INPUT') return; cb.getAttribute('data-layers').split(',').forEach(function (l) { if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', cb.checked ? 'visible' : 'none'); }); });
    });
    map.on('error', function (e) { if (e && e.error && /style|tiles/i.test(String(e.error.message || ''))) status('Basemap tiles did not load (OpenFreeMap); the overlays still draw.'); });
  }

  /* ---------- 8 · provenance ---------- */
  function drawProvenance() {
    var tot = 0, ver = 0; W.measurements.forEach(function (m) { tot++; if (!(m._p && m._p.value)) ver++; });
    var lakeV = W.lake_summary.filter(function (l) { return !(l._p && l._p.tp_summer_mean_ugL); }).length;
    $('prov-summary').innerHTML = 'Workbook <code>helderberg_hudson_water_quality.xlsx</code>, built ' + esc(W.generated) + '. ' + ver + ' of ' + tot + ' finished-water values are verbatim from the named report; ' + lakeV + ' of ' + W.lake_summary.length + ' DEC lake-summary rows are verbatim portal values (the % of guidance is a formula). Discharge medians are derived from ' + W.dmr.length.toLocaleString() + ' annualised EPA rows (' + W.dmr.filter(function (d) { return d.ui; }).length + ' with an inferred unit). Distances measure from ' + esc(W.ref.name) + ' (' + W.ref.lat + ', ' + W.ref.lon + '), the Hannacroix–Catskill Creek divide. ' + W.sources.length + ' documents pulled; ' + W.references.length + ' studies logged. TRI: ' + (W.tri_facilities || []).length + ' reporting facilities within 50 miles, 1987–2024 (self-reported to EPA). FY2025 regional loads: ' + (W.regional_top10 || []).length + ' top-ten rows across ' + uniq((W.regional_top10 || []).map(function (r) { return r.pollutant; })).length + ' pollutants, derived by the water chat from statewide bulk DMRs.';
    $('sources').innerHTML = W.sources.map(function (s) { return '<div>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.doc) + '</a>' : esc(s.doc)) + (s.publisher ? ' <span style="opacity:.75">— ' + esc(s.publisher) + (s.doc_date ? ', ' + esc(s.doc_date) : '') + '</span>' : '') + (s.pulled === 'no' ? ' <span class="chip na">not pulled</span>' : '') + '</div>'; }).join('');
    $('wq-foot').innerHTML = '<b>Sources.</b> NYSDEC Waterbody Inventory / Priority Waterbodies List factsheets; NYSDEC Division of Water monitoring data portal (lake and stream chemistry, biomonitoring, HAB toxins; export 2026-09-28); NYSDEC HABs archive and 2025 summary; NYSDEC Basic Creek Reservoir phosphorus TMDL (2013); NYSDEC Inventory of Dams; NYS GIS Clearinghouse (Unconsolidated Aquifers 250K); USGS SIR 2021-5094 lidar karst; USGS ambient groundwater quality (Water Quality Portal export 2026-09-28); municipal Annual Water Quality Reports (Rensselaerville, Greenville, Cairo, Catskill, City of Albany); EPA ECHO Clean Water Act exports, bulk DMR files and Water Pollutant Loading Tool. Basemap © OpenFreeMap / OpenMapTiles / OpenStreetMap contributors. Working theories are labelled as theories in the brief; nothing here is a claim about private-well safety on the divide — there is no data, and the map says so.';
  }

  try {
    drawContaminants(); drawTransects(); drawCards(); drawBugs(); drawLakes(); drawProfiles(); drawTMDL();
    var sel = $('bloom-sel'); var names = bloomLakes(); sel.innerHTML = names.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join(''); var cur = names[0] || 'Basic Creek Reservoir'; drawBloom(cur); drawToxin(cur); drawInteract(); sel.addEventListener('change', function () { drawBloom(sel.value); drawToxin(sel.value); });
    drawGroundwater(); drawOutfalls(); drawLoads(); drawTRI(); drawProvenance(); drawMap();
  } catch (e) { status('Something in the dashboard failed to draw: ' + e.message); if (window.console) console.error(e); }
})();
