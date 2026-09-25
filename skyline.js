/* NY Hilltowners — shared Skyline widget (weather + sunrise/sunset + moon).
   Self-contained: include on any page that has a <div id="skyline">…</div> in its
   nav. No-ops if that element is absent. Duplicates a few astronomical helpers so
   the module stands alone; the atlas keeps its own copies for the day/night toggle. */
(function(){
  if(!document.getElementById('skyline')) return;   // page has no skyline; nothing to do

  var BERNE = (typeof window.BERNE !== 'undefined') ? window.BERNE : {lat:42.624848, lng:-74.135036};
  var sunTimes = window.sunTimes || function(isoDate, lat, lng){
    var p = isoDate.split('-').map(Number);
    var jd0 = Date.UTC(p[0], p[1]-1, p[2]) / 86400000 + 2440587.5;
    var n = Math.round(jd0) - 2451545 + 0.0008;
    var rad = Math.PI/180;
    var Js = n - lng/360;
    var M = ((357.5291 + 0.98560028*Js) % 360 + 360) % 360;
    var C = 1.9148*Math.sin(M*rad) + 0.02*Math.sin(2*M*rad) + 0.0003*Math.sin(3*M*rad);
    var L = ((M + C + 180 + 102.9372) % 360 + 360) % 360;
    var Jt = 2451545 + Js + 0.0053*Math.sin(M*rad) - 0.0069*Math.sin(2*L*rad);
    var sinD = Math.sin(L*rad)*Math.sin(23.4397*rad), D = Math.asin(sinD);
    var cosW = (Math.sin(-0.833*rad) - Math.sin(lat*rad)*sinD) / (Math.cos(lat*rad)*Math.cos(D));
    if(cosW >= 1) return {rise:null, set:null, polar:'night'};
    if(cosW <= -1) return {rise:null, set:null, polar:'day'};
    var w = Math.acos(cosW)/rad;
    var toMs = function(j){ return (j - 2440587.5) * 86400000; };
    return {rise:toMs(Jt - w/360), set:toMs(Jt + w/360), polar:null};
  };
  var berneDateISO = window.berneDateISO || function(){
    try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()); }
    catch(e){ return new Date().toISOString().slice(0,10); }
  };

/* ============ SKYLINE: Hilltowns weather + today's sun ============
   Weather is Open-Meteo's modeled current conditions, sampled at the Huyck
   Preserve's coordinates (a central Hilltowns point; the Preserve isn't named
   in the UI and isn't affiliated). No key, no build step; refreshed every 15
   min; hidden (never faked) if the fetch fails. Sunrise/sunset reuse the
   night-mode clock. */
var HUYCK = {lat:42.5155081667906, lng:-74.1401693189751};
var SKY_ICONS = {   /* simple stroke icons matching the header's search/menu glyphs */
  sun:   '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="7" y2="17"/><line x1="17" y1="7" x2="18.7" y2="5.3"/>',
  moon:  '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  psun:  '<circle cx="8" cy="8" r="3.2"/><line x1="8" y1="1.5" x2="8" y2="3"/><line x1="1.5" y1="8" x2="3" y2="8"/><line x1="3.4" y1="3.4" x2="4.5" y2="4.5"/><line x1="11.5" y1="4.5" x2="12.6" y2="3.4"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A4.2 4.2 0 0 0 8.5 19.5z"/>',
  pmoon: '<path d="M11 6.5A4.5 4.5 0 0 1 6.5 2a4.5 4.5 0 1 0 4.5 4.5z"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A4.2 4.2 0 0 0 8.5 19.5z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.5A4.8 4.8 0 0 0 7 18.5z"/>',
  fog:   '<path d="M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.5A4.8 4.8 0 0 0 7 14z"/><line x1="5" y1="17.5" x2="19" y2="17.5"/><line x1="7" y1="21" x2="17" y2="21"/>',
  rain:  '<path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.5A4.8 4.8 0 0 0 7 15z"/><line x1="8.5" y1="18" x2="7.5" y2="21"/><line x1="12.5" y1="18" x2="11.5" y2="21"/><line x1="16.5" y1="18" x2="15.5" y2="21"/>',
  snow:  '<path d="M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.5A4.8 4.8 0 0 0 7 14z"/><circle cx="8" cy="18.5" r=".9"/><circle cx="12" cy="20.5" r=".9"/><circle cx="16" cy="18.5" r=".9"/>',
  storm: '<path d="M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.5A4.8 4.8 0 0 0 7 14z"/><polyline points="12.5,14 10,18.5 13,18.5 11,22.5"/>'
};
/* WMO weather-interpretation codes → icon key + plain label */
function skyKind(code, isDay){
  var d = isDay !== 0;
  if(code===0)                 return [d?'sun':'moon', d?'Clear':'Clear night'];
  if(code===1||code===2)       return [d?'psun':'pmoon', 'Partly cloudy'];
  if(code===3)                 return ['cloud','Overcast'];
  if(code===45||code===48)     return ['fog','Fog'];
  if(code>=51&&code<=57)       return ['rain','Drizzle'];
  if(code>=61&&code<=67)       return ['rain','Rain'];
  if(code>=71&&code<=77)       return ['snow','Snow'];
  if(code>=80&&code<=82)       return ['rain','Showers'];
  if(code===85||code===86)     return ['snow','Snow showers'];
  if(code>=95)                 return ['storm','Thunderstorm'];
  return ['cloud','Cloudy'];
}
function fmtClock(ms){
  try{ return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(ms)).toLowerCase(); }
  catch(e){ var d=new Date(ms); return d.getHours()+':'+('0'+d.getMinutes()).slice(-2); }
}
function renderSkySun(){
  var el = document.getElementById('skySun'); if(!el) return;
  var st = sunTimes(berneDateISO(), BERNE.lat, BERNE.lng);
  if(st.polar){ el.textContent = ''; return; }
  el.innerHTML = fmtClock(st.rise)+'<span class="sep">&middot;</span>'+fmtClock(st.set);
}
function renderSkyWx(cur){
  var box = document.getElementById('skyline'), ico = document.getElementById('skyIco'), t = document.getElementById('skyTemp');
  if(!box || !cur || typeof cur.temperature_2m !== 'number'){ if(box) box.classList.remove('has-wx'); return; }
  var f = Math.round(cur.temperature_2m), c = Math.round((cur.temperature_2m-32)*5/9);
  var kind = skyKind(cur.weather_code, cur.is_day);
  ico.innerHTML = SKY_ICONS[kind[0]] || SKY_ICONS.cloud;
  ico.setAttribute('aria-label', kind[1]);
  document.getElementById('skyCond').textContent = kind[1];
  t.innerHTML = f+'&deg;F<span class="c">'+c+'&deg;C</span>';
  /* Open-Meteo stamps the reading with its model time (local, 15-minute grid) — surface it so a
     reading that looks stale can be checked at a glance. */
  var asOf = '';
  if(cur.time){ var mt = /T(\d{2}):(\d{2})/.exec(cur.time); if(mt){ var hh = +mt[1]; asOf = ' \u00b7 as of '+((hh%12)||12)+':'+mt[2]+(hh<12?' am':' pm'); } }
  var fetchedAt = new Date().toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).toLowerCase();
  document.getElementById('skyWx').title = kind[1]+asOf+' \u2014 modeled current conditions for the Hilltowns (data: Open-Meteo.com). Fetched '+fetchedAt+'; refreshes every 15 min and whenever this tab comes back into focus.';
  box.classList.add('has-wx');
}
/* ---- Stratospheric wind at 10 hPa over Berne (Laurie, 2026-09-16). ~26-31 km up, the
   level people watch for the polar vortex. Open-Meteo serves it from the Canadian GEM
   Global model (3-hourly, interpolated); GFS is the fallback. Shown only when a value
   arrives; the arrow points where the wind is blowing TO (Windy convention), the text
   says where it blows FROM (meteorological convention). ---- */
var COMPASS16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function compass(deg){ return COMPASS16[Math.round((((deg%360)+360)%360)/22.5)%16]; }
function renderStrat(h){
  var box = document.getElementById('skyline'), el = document.getElementById('stratVal'), sub = document.getElementById('stratSub'), arrow = document.getElementById('stratArrow');
  if(!box || !el) return;
  if(!h){ box.classList.remove('has-strat'); return; }
  el.innerHTML = Math.round(h.kt)+' kt<span class="c">from '+compass(h.dir)+'<span class="deg"> \u00b7 '+Math.round(h.dir)+'&deg;</span></span>';
  var km = (typeof h.gph === 'number') ? (h.gph/1000).toFixed(1)+' km up' : '';
  if(sub) sub.textContent = '';   /* 2026-09-16 (Laurie): no sub-line; height + model live in the tooltip */
  if(arrow) arrow.style.transform = 'rotate('+(((h.dir+180)%360))+'deg)';
  document.getElementById('skyStrat').title = 'Wind at the 10 hPa pressure level over Berne, NY \u2014 the stratosphere, '+(km||'roughly 26\u201331 km up')+'. '+Math.round(h.kt)+' knots blowing from the '+compass(h.dir)+' ('+Math.round(h.dir)+'\u00b0); the arrow points downwind. Model: '+h.model+' via Open-Meteo.com, valid '+h.when+' (nearest model hour). Refreshes with the surface weather.';
  box.classList.add('has-strat');
}
function nearestHour(j, key, dirKey, gphKey){
  if(!j || !j.hourly || !j.hourly.time) return null;
  var t = j.hourly.time, sp = j.hourly[key] || [], dr = j.hourly[dirKey] || [], gp = j.hourly[gphKey] || [];
  var now = Date.now(), best = -1, bd = 1e18;
  for(var i=0;i<t.length;i++){
    if(typeof sp[i] !== 'number' || typeof dr[i] !== 'number') continue;
    var ms = new Date(t[i]+(j.utc_offset_seconds ? '' : 'Z')).getTime() - (j.utc_offset_seconds||0)*1000;
    var d = Math.abs(ms - now); if(d < bd){ bd = d; best = i; }
  }
  if(best < 0 || bd > 4*3600*1000) return null;   /* nothing within 4 h of now → don't fake it */
  var mt = /T(\d{2}):(\d{2})/.exec(t[best]) || []; var hh = +mt[1];
  return {kt:sp[best], dir:dr[best], gph:gp[best], when: mt.length ? (((hh%12)||12)+':'+mt[2]+(hh<12?' am':' pm')) : t[best]};
}
function fetchStrat(){
  if(!window.fetch || !document.getElementById('skyStrat')) return;
  var q = 'latitude='+BERNE.lat.toFixed(4)+'&longitude='+BERNE.lng.toFixed(4)
        + '&hourly=wind_speed_10hPa,wind_direction_10hPa,geopotential_height_10hPa&wind_speed_unit=kn'
        + '&past_hours=3&forecast_hours=6&timezone=America%2FNew_York';
  var tries = [
    ['https://api.open-meteo.com/v1/gem?'+q+'&models=cmc_gem_global', 'GEM Global'],
    ['https://api.open-meteo.com/v1/gfs?'+q+'&models=gfs_global',      'GFS']
  ];
  (function attempt(i){
    if(i >= tries.length){ renderStrat(null); return; }
    fetch(tries[i][0], {cache:'no-store'}).then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        var h = nearestHour(j, 'wind_speed_10hPa', 'wind_direction_10hPa', 'geopotential_height_10hPa');
        if(h){ h.model = tries[i][1]; renderStrat(h); } else attempt(i+1);
      })
      .catch(function(){ attempt(i+1); });
  })(0);
}
var skyLastFetch = 0;
function fetchSkyWx(){
  if(!window.fetch || !document.getElementById('skyline')) return;
  var url = 'https://api.open-meteo.com/v1/forecast?latitude='+HUYCK.lat.toFixed(4)+'&longitude='+HUYCK.lng.toFixed(4)
          + '&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=America%2FNew_York';
  skyLastFetch = Date.now();
  fetch(url, {cache:'no-store'}).then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ renderSkyWx(j && j.current); })
    .catch(function(){ renderSkyWx(null); });
}
/* ---- Moon. Phase from the mean synodic month against a reference new moon
   (2000-01-06 18:14 UTC); good to within roughly half a day.
   Names are the Onondaga Nation's thirteen moons, as published with their
   translations at onondaganation.org/culture/ceremonies (Laurie's choice, Aug 30
   2026, over the Farmers' Almanac names). The Nation does not tie them to
   calendar months — the Faith Keepers reckon a 13-moon year beginning at
   Midwinter — so the anchor used here is the documented Midwinter rule: the
   lunar year begins at the first new moon after the December solstice, and the
   names are taken in the order the Nation lists them. Some Longhouses now count
   from the first new moon after January 1 instead; that reading would shift
   names by one moon in years like 2026. This is a reckoning, not the Nation's
   own calendar, and the tooltip says so. ---- */
var SYNODIC = 29.530588853, NEW_MOON_REF = Date.UTC(2000,0,6,18,14);
var ONONDAGA_MOONS = [
  ['Hisatuh',       'Treacherous little winter'],
  ['Ganahdoha',     'Leaf buds are on the leaves'],
  ['Ganahdogo:nah', 'Moon of many leaves'],
  ['Ohiaihah',      'Little ripening of the berries'],
  ['Ohiaihgo:nah',  'Great ripening of the berries'],
  ['Saskeh hah',    'Long daylight'],
  ['Saskego:nah',   'Big, long daylight'],
  ['Kendenhah',     'Deer has a short tail'],
  ['Kendenhgo:nah', 'Deer has a long tail'],
  ['Jotowehhah',    'Return of the little cold'],
  ['Jotowego:nah',  'Return of the big cold'],
  ['Disuh',         'Long nights, short days'],
  ['Disgo:nah',     'Longer nights, shorter days']
];
function moonAge(ms){ var d = (ms - NEW_MOON_REF)/86400000; return ((d % SYNODIC) + SYNODIC) % SYNODIC; }
function newMoonBefore(ms){ return ms - moonAge(ms)*86400000; }           /* start of the current lunation */
function decSolstice(year){                                                 /* Meeus, Astronomical Algorithms ch. 27 (mean) — minutes-level, ample here */
  var Y = (year-2000)/1000;
  var jde = 2451900.05952 + 365242.74049*Y - 0.06223*Y*Y - 0.00823*Y*Y*Y + 0.00032*Y*Y*Y*Y;
  return (jde - 2440587.5)*86400000;
}
function lunarYearStart(ms){                                                /* first new moon after the most recent December solstice */
  var y = new Date(ms).getUTCFullYear(), sol = decSolstice(y);
  if(ms < sol) sol = decSolstice(y-1);
  var nm = newMoonBefore(sol);
  if(nm <= sol) nm += SYNODIC*86400000;
  return nm;
}
function lunationInfo(ms){
  var cur = newMoonBefore(ms), start = lunarYearStart(cur);                 /* the lunation belongs to the year whose start precedes ITS new moon */
  var n = Math.round((cur - start)/(SYNODIC*86400000));                     /* 0-based lunation of the Haudenosaunee year */
  if(n < 0) n = 0; if(n > 12) n = 12;
  return {index:n, word:ONONDAGA_MOONS[n][0], english:ONONDAGA_MOONS[n][1], newMoon:cur, yearStart:start};
}
function drawMoon(age){
  var p = age/SYNODIC, k = (1-Math.cos(2*Math.PI*p))/2;         /* illuminated fraction */
  var r = 10, cx = 12, cy = 12, waxing = p < 0.5;
  var rx = Math.abs(Math.cos(2*Math.PI*p))*r;                    /* terminator half-width */
  var lit, dark = 'rgba(26,29,92,.22)', light = '#fca315';   /* lit side gold, night side navy tint, navy limb */
  if(k < 0.005) lit = '';
  else if(k > 0.995) lit = '<circle cx="12" cy="12" r="10" fill="'+light+'"/>';
  else {
    /* outer limb on the lit side, then the terminator ellipse back */
    var limbSweep = waxing ? 1 : 0, termSweep = (k > 0.5) ? limbSweep : 1-limbSweep;
    lit = '<path fill="'+light+'" d="M12 2 A'+r+' '+r+' 0 0 '+limbSweep+' 12 22 A'+rx.toFixed(2)+' '+r+' 0 0 '+termSweep+' 12 2 Z"/>';
  }
  return '<circle cx="12" cy="12" r="10" fill="'+dark+'"/>'+lit+'<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.2"/>';
}
function phaseLabel(age){
  var p = age/SYNODIC, k = Math.round(100*(1-Math.cos(2*Math.PI*p))/2);
  var n = p < 0.02 || p > 0.98 ? 'New Moon' : p < 0.23 ? 'Waxing Crescent' : p < 0.27 ? 'First Quarter' : p < 0.48 ? 'Waxing Gibbous'
        : p < 0.52 ? 'Full Moon' : p < 0.73 ? 'Waning Gibbous' : p < 0.77 ? 'Last Quarter' : 'Waning Crescent';
  return n + ' \u00b7 ' + k + '%';
}
function renderMoon(){
  var ico = document.getElementById('moonIco'); if(!ico) return;
  var now = Date.now(), age = moonAge(now), li = lunationInfo(now);
  ico.innerHTML = drawMoon(age);
  document.getElementById('moonPhase').textContent = phaseLabel(age);
  document.getElementById('moonName').textContent = li.word;
  document.getElementById('moonEng').textContent = li.english;
  document.getElementById('skyMoon').title = 'Moon '+(li.index+1)+' of the Haudenosaunee year \u2014 names and translations from the Onondaga Nation (onondaganation.org). Year reckoned from the first new moon after the winter solstice; the Nation\u2019s Faith Keepers set the actual calendar.';
}
renderMoon();
setInterval(renderMoon, 30*60*1000);
renderSkySun();
fetchSkyWx();
fetchStrat();
setInterval(fetchSkyWx, 15*60*1000);
setInterval(fetchStrat, 30*60*1000);
/* a laptop that slept through the timer, or a tab left in the background, refetches on return */
document.addEventListener('visibilitychange', function(){ if(!document.hidden && Date.now()-skyLastFetch > 60*1000){ skyLastFetch = Date.now(); fetchSkyWx(); fetchStrat(); renderSkySun(); renderMoon(); } });
setInterval(renderSkySun, 60*1000);

/* exported for signals.js (2026-09-20): everything above lives inside this closure */
window.hfa = { skyKind: skyKind, compass: compass, nearestHour: nearestHour, moonAge: moonAge, drawMoon: drawMoon, phaseLabel: phaseLabel, lunationInfo: lunationInfo, SYNODIC: SYNODIC };
})();

/* ============ RADIO TUNER (2026-09-17, per Laurie) ============
   A small fixed tuner, bottom-left on every page, that streams public/community
   radio in-page through a plain <audio> element. Presets are edited in STATIONS
   below; each `url` must be a direct HTTPS audio stream (MP3/AAC), not a web
   player page. `verified:false` presets are best-guess endpoints — test them,
   fix or delete. Remembers the last station and whether it was playing
   (localStorage); browsers block autoplay until the visitor has clicked once. */
(function(){
  var STATIONS = [
    /* Order per Laurie, 2026-09-18. Dropped from the tuner (still reachable elsewhere): WAMC HD2,
       WGXC 90.7 (Wave Farm's terrestrial station), Solar Radio, Weather Warlock, Traffic Saxx, Here GOES. */
    {id:'apiary', name:'Apiary', sub:'The Listening Apiary · inside a honeybee hive at Wave Farm', url:'https://audio.wavefarm.org/listening-apiary.mp3', verified:true}, /* first per Laurie 2026-09-25 */
    {id:'wjff', name:'Radio Catskill', sub:'WJFF 90.5 · Jeffersonville / Sullivan County', url:'https://stream1.rcast.net/69645', verified:true},,
    {id:'wamc', name:'WAMC', sub:'Northeast Public Radio · Albany', url:'https://playerservices.streamtheworld.com/api/livestream-redirect/WAMCFM.mp3', verified:true},,
    {id:'wfmu', name:'WFMU', sub:'WFMU 91.1 Jersey City · freeform, listener-supported, independent', url:'https://stream0.wfmu.org/freeform-128k', verified:false},,
    {id:'wnyc', name:'WNYC', sub:'WNYC 93.9 FM · New York public radio', url:'https://fm939.wnyc.org/wnycfm', verified:false},
    {id:'npr', name:'NPR', sub:'NPR News / Talk · national live stream', url:'https://npr-ice.streamguys1.com/live.mp3', verified:false},
    {id:'bbcws', name:'BBC World Service', sub:'BBC World Service · English · global news', url:'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', verified:false},
    {id:'kexp', name:'KEXP', sub:'KEXP 90.3 Seattle · independent music radio', url:'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', verified:false},
    {id:'swr', name:'Standing Wave', sub:'Wave Farm · transmission art / experimental sound', url:'https://audio.wavefarm.org/transmissionarts.mp3', verified:true},
    {id:'pond', name:'Pond', sub:'Pond Station · inside a Wave Farm pond, dawn to sundown', url:'https://audio.wavefarm.org/pondstation.mp3', verified:true}
  ];
  var css = '#hfaRadio{position:fixed;left:14px;bottom:14px;z-index:5000;font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.04em;color:var(--ink-blue,#1a1f5e);background:var(--paper,#f4ecd8);border:1px solid var(--ink-blue,#1a1f5e);border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:8px 10px;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 28px)}'
    + '#hfaRadio button{font:inherit;cursor:pointer;border:1px solid var(--ink-blue,#1a1f5e);background:transparent;color:inherit;border-radius:6px;padding:4px 7px;line-height:1}'
    + '#hfaRadio .pl{width:30px;height:30px;border-radius:50%;font-size:13px;display:inline-flex;align-items:center;justify-content:center}'
    + '#hfaRadio .st{display:flex;flex-direction:column;min-width:0}#hfaRadio .nm{font-weight:700;font-size:12px;white-space:nowrap}#hfaRadio .sb{opacity:.75;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}'
    + '#hfaRadio .pre{display:flex;gap:4px;flex-wrap:wrap}#hfaRadio .pre button{padding:3px 6px;font-size:10px}#hfaRadio .pre button.on{background:var(--ink-blue,#1a1f5e);color:var(--paper,#f4ecd8)}'
    + '#hfaRadio.err .sb{color:#b3261e}#hfaRadio .x{border:none;opacity:.6;padding:2px 4px}'
    + 'html[data-theme="night"] #hfaRadio{background:var(--ink2,#141a3a);color:var(--birch,#e9e2cf);border-color:var(--birch,#e9e2cf)}html[data-theme="night"] #hfaRadio button{border-color:var(--birch,#e9e2cf)}html[data-theme="night"] #hfaRadio .pre button.on{background:var(--birch,#e9e2cf);color:var(--ink2,#141a3a)}'
    + '@media (max-width:760px){#hfaRadio{left:8px;bottom:8px;padding:6px 8px}#hfaRadio .pre{display:none}#hfaRadio.open .pre{display:flex}}'
    + '#hfaRadio.min .st,#hfaRadio.min .pre{display:none}';
  function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){} }
  function build(){
    if(document.getElementById('hfaRadio')) return;
    var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
    var box=document.createElement('div'); box.id='hfaRadio'; box.setAttribute('role','region'); box.setAttribute('aria-label','Radio tuner');
    box.innerHTML='<button class="pl" id="hfaPlay" title="Play / stop" aria-label="Play or stop">&#9654;</button>'
      +'<div class="st"><span class="nm" id="hfaName"></span><span class="sb" id="hfaSub"></span></div>'
      +'<div class="pre" id="hfaPre"></div><button class="x" id="hfaMin" title="Minimize">&#8211;</button>';
    document.body.appendChild(box);
    var audio=new Audio(); audio.preload='none';   /* no crossOrigin: it forces a CORS check most radio servers fail (2026-09-18) */
    var cur=null, playing=false;
    var pre=document.getElementById('hfaPre');
    STATIONS.forEach(function(s){ var b=document.createElement('button'); b.textContent=s.name; b.dataset.id=s.id; b.onclick=function(){ tune(s, true); }; pre.appendChild(b); });
    function show(s){ document.getElementById('hfaName').textContent=s.name; document.getElementById('hfaSub').textContent=s.sub; Array.prototype.forEach.call(pre.children,function(b){ b.classList.toggle('on', b.dataset.id===s.id); }); box.classList.remove('err'); }
    function tune(s, go){ cur=s; show(s); ls('hfaRadio.station', s.id); if(go || playing){ start(); } }
    function start(){ if(!cur) return; audio.src=cur.url; document.getElementById('hfaSub').textContent='Tuning…';
      audio.play().then(function(){ playing=true; ls('hfaRadio.playing','1'); document.getElementById('hfaPlay').innerHTML='&#9632;'; document.getElementById('hfaSub').textContent=cur.sub; })
      .catch(function(){ playing=false; box.classList.add('err'); document.getElementById('hfaSub').textContent='Stream unavailable — try another station'; document.getElementById('hfaPlay').innerHTML='&#9654;'; }); }
    function stop(){ audio.pause(); audio.removeAttribute('src'); audio.load(); playing=false; ls('hfaRadio.playing','0'); document.getElementById('hfaPlay').innerHTML='&#9654;'; if(cur) document.getElementById('hfaSub').textContent=cur.sub; }
    audio.addEventListener('error', function(){ if(playing){ box.classList.add('err'); document.getElementById('hfaSub').textContent='Stream dropped — press play to retry'; playing=false; document.getElementById('hfaPlay').innerHTML='&#9654;'; } });
    document.getElementById('hfaPlay').onclick=function(){ playing ? stop() : start(); };
    document.getElementById('hfaMin').onclick=function(){ box.classList.toggle('min'); ls('hfaRadio.min', box.classList.contains('min')?'1':'0'); };
    box.addEventListener('click', function(e){ if(window.matchMedia('(max-width:760px)').matches && e.target.closest('.st')) box.classList.toggle('open'); });
    if(ls('hfaRadio.min')==='1') box.classList.add('min');
    var saved=STATIONS.filter(function(s){ return s.url && s.id===ls('hfaRadio.station'); })[0] || STATIONS.filter(function(s){ return s.url; })[0];
    tune(saved, false);
    if(ls('hfaRadio.playing')==='1'){ start(); }   /* resumes after navigation when the browser allows autoplay */
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
