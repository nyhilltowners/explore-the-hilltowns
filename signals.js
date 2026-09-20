/* ============ SIGNS + SIGNALS (2026-09-19, per Laurie) ============
   Phenology / natural-cycles dashboard for Berne, NY. Reuses skyline.js (loaded first)
   for BERNE, sunTimes(), moon math, compass(). All data from Open-Meteo (CC BY 4.0):
   - surface + pressure-level winds (10/100/500/850 hPa) via GEM Global (GFS fallback)
   - degree days from the archive API: daily Tmax/Tmin since Jan 1, base 65°F for
     heating/cooling and base 50°F for growing (corn/standard), capped at 86°F. */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var LAT = (window.BERNE||{}).lat || 42.6248, LNG = (window.BERNE||{}).lng || -74.1350;
  var Q = 'latitude='+LAT.toFixed(4)+'&longitude='+LNG.toFixed(4)+'&timezone=America%2FNew_York';
  var f2c = function(f){ return (f-32)*5/9; }, c2f = function(c){ return c*9/5+32; };

  /* ---------- dial helpers ---------- */
  var errs = []; function status(msg){ errs.push(msg); var e=$('sg-status'); if(e) e.textContent = errs.join(' · '); }
  function windDial(prefix, kt, dir, extra){
    var ico = $(prefix+'-ico'), arrow = ico && ico.querySelector('.arrow');
    if(typeof kt!=='number'){ $(prefix+'-val').textContent='—'; $(prefix+'-sub').textContent='no data'; if(arrow) arrow.style.opacity=.3; return; }
    if(arrow){ arrow.style.opacity=1; arrow.style.transform='rotate('+((dir+180)%360)+'deg)'; }   /* points downwind */
    $(prefix+'-val').textContent = Math.round(kt)+' kt';
    $(prefix+'-sub').textContent = 'from '+compass(dir)+' · '+Math.round(dir)+'°'+(extra?' · '+extra:'');
  }
  function gauge(prefix, val, min, max, text, sub){ $(prefix+'-val').textContent = text; if(sub!==undefined) $(prefix+'-sub').textContent = sub; }

  /* ---------- sun & moon ---------- */
  function sunTimes(isoDate, lat, lng){
    var p = isoDate.split('-').map(Number), jd0 = Date.UTC(p[0], p[1]-1, p[2])/86400000 + 2440587.5, n = Math.round(jd0) - 2451545 + 0.0008, rad = Math.PI/180, Js = n - lng/360;
    var M = ((357.5291 + 0.98560028*Js) % 360 + 360) % 360, C = 1.9148*Math.sin(M*rad) + 0.02*Math.sin(2*M*rad) + 0.0003*Math.sin(3*M*rad), L = ((M + C + 180 + 102.9372) % 360 + 360) % 360;
    var Jt = 2451545 + Js + 0.0053*Math.sin(M*rad) - 0.0069*Math.sin(2*L*rad), sinD = Math.sin(L*rad)*Math.sin(23.4397*rad), D = Math.asin(sinD);
    var cosW = (Math.sin(-0.833*rad) - Math.sin(lat*rad)*sinD)/(Math.cos(lat*rad)*Math.cos(D)); if(cosW>=1||cosW<=-1) return null;
    var w = Math.acos(cosW)/rad, toMs = function(j){ return (j - 2440587.5)*86400000; }; return {rise:toMs(Jt - w/360), set:toMs(Jt + w/360)};
  }
  function renderSunMoon(){
    var now = Date.now();
    function isoLocal(ms){ var d=new Date(ms); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    var st = sunTimes(isoLocal(now), LAT, LNG);
    if(st){
      var rise = st.rise, set = st.set, len = (set-rise)/3600000;
      var clk=function(ms){ return new Date(ms).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).toLowerCase(); };
      $('sun-times').innerHTML = clk(rise)+'<span class="c">·</span>'+clk(set);
      var lenTxt = Math.floor(len)+'h '+Math.round((len%1)*60)+'m of daylight';
      var tmr = new Date(now+86400000), iso = tmr.getFullYear()+'-'+String(tmr.getMonth()+1).padStart(2,'0')+'-'+String(tmr.getDate()).padStart(2,'0');
      var st2 = sunTimes(iso, LAT, LNG), d = st2 ? ((st2.set-st2.rise)-(set-rise))/60000 : 0;
      $('sun-det').textContent = lenTxt+' · tomorrow '+(d>=0?'+':'')+d.toFixed(1)+' min'+(now<rise?' · before sunrise':(now>set?' · after sunset':''));
    }
    if(window.moonAge){
      var age = moonAge(now), ill = (1-Math.cos(age/SYNODIC*2*Math.PI))/2;
      var mi = $('moon-ico'); if(mi && window.drawMoon) mi.innerHTML = '<svg viewBox="0 0 40 40" style="fill:none">'+drawMoon(age)+'</svg>';
      $('moon-phase').textContent = phaseLabel(age)+' · '+Math.round(ill*100)+'% lit';
      var li = window.lunationInfo ? lunationInfo(now) : null;
      $('moon-det').innerHTML = (li ? '<b>'+li.word+'</b> — '+(li.english||'')+'<br>' : '')+age.toFixed(1)+' days into the lunation · next new moon in '+(SYNODIC-age).toFixed(1)+' days';
    }
  }

  /* ---------- weather + winds ---------- */
  function fetchWx(){
    var url = 'https://api.open-meteo.com/v1/forecast?'+Q
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,cloud_cover'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=1'
      + '&temperature_unit=fahrenheit&wind_speed_unit=kn&precipitation_unit=inch';
    fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var c = j.current; if(!c){ status('Surface weather: '+(j.reason||'no data')); return; }
      gauge('temp', c.temperature_2m, -20, 110, Math.round(c.temperature_2m)+'°F', 'feels like '+Math.round(c.apparent_temperature)+'° · '+Math.round(f2c(c.temperature_2m))+'°C');
      gauge('hum', c.relative_humidity_2m, 0, 100, c.relative_humidity_2m+'%', 'relative humidity');
      var inHg = c.surface_pressure*0.02953;
      gauge('pres', inHg, 28.5, 31, inHg.toFixed(2)+' inHg', Math.round(c.surface_pressure)+' hPa at the surface');
      gauge('cloud', c.cloud_cover, 0, 100, c.cloud_cover+'%', 'cloud cover · '+(window.skyKind ? skyKind(c.weather_code, c.is_day)[1] : ''));
      windDial('w10', c.wind_speed_10m, c.wind_direction_10m, 'gusts '+Math.round(c.wind_gusts_10m)+' kt');
      var d = j.daily||{};
      $('day-val').innerHTML = '↑ '+Math.round(d.temperature_2m_max[0])+'°<span class="c">↓ '+Math.round(d.temperature_2m_min[0])+'°</span>';
      $('day-det').textContent = 'forecast high / low · '+(d.precipitation_sum[0]||0).toFixed(2)+' in precipitation expected';
    }).catch(function(e){ status('Surface weather: '+(e && e.message || 'fetch failed')); });
    var lv = ['850','500','100','10'];
    var q2 = Q+'&hourly='+lv.map(function(l){ return 'wind_speed_'+l+'hPa,wind_direction_'+l+'hPa,geopotential_height_'+l+'hPa'; }).join(',')+'&wind_speed_unit=kn&past_hours=3&forecast_hours=6';
    var tries = ['https://api.open-meteo.com/v1/gem?'+q2+'&models=cmc_gem_global','https://api.open-meteo.com/v1/gfs?'+q2+'&models=gfs_global'];
    (function attempt(i){
      if(i>=tries.length){ lv.forEach(function(l){ windDial(l==='10'?'w10hpa':'w'+l, null); }); return; }
      fetch(tries[i]).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
        var ok = false;
        lv.forEach(function(l){ var h = window.nearestHour ? nearestHour(j,'wind_speed_'+l+'hPa','wind_direction_'+l+'hPa','geopotential_height_'+l+'hPa') : null;
          var pid = (l==='10') ? 'w10hpa' : 'w'+l; if(h){ ok = true; windDial(pid, h.kt, h.dir, (h.gph/1000).toFixed(1)+' km up'); } else windDial(pid, null); });
        if(!ok) attempt(i+1);
      }).catch(function(e){ if(i===tries.length-1) status('Winds aloft: '+(e && e.message || 'fetch failed')); attempt(i+1); });
    })(0);
  }

  /* ---------- degree days: this year, the 1991–2020 normal for the same date, and every year since 1940 ----------
     One archive call (ERA5 reanalysis via Open-Meteo, 1940 → yesterday, daily Tmax/Tmin ≈ 32k rows).
     Heating/cooling base 65°F on the daily mean; growing base 50°F with Tmax capped at 86°F and Tmin floored at 50°F. */
  function ddOf(mx, mn){ var out={h:0,c:0,g:0}; if(typeof mx!=='number'||typeof mn!=='number') return null;
    var mean=(mx+mn)/2; if(mean<65) out.h=65-mean; else out.c=mean-65;
    var gm=(Math.min(86,mx)+Math.max(50,mn))/2; if(gm>50) out.g=gm-50; return out; }
  function fetchDD(){
    var t = new Date(Date.now()-86400000), end = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    var thisYear = t.getFullYear(), mmdd = end.slice(5);
    var url = 'https://archive-api.open-meteo.com/v1/archive?'+Q+'&start_date=1940-01-01&end_date='+end+'&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit';
    $('dd-note').textContent = 'Loading 1940–'+thisYear+' history…';
    fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var T=j.daily.time, mx=j.daily.temperature_2m_max, mn=j.daily.temperature_2m_min, years={};
      for(var i=0;i<T.length;i++){ var y=+T[i].slice(0,4), d=ddOf(mx[i],mn[i]); if(!d) continue;
        var Y=years[y]||(years[y]={td:{h:0,c:0,g:0},full:{h:0,c:0,g:0},days:0});
        if(T[i].slice(5)<=mmdd){ Y.td.h+=d.h; Y.td.c+=d.c; Y.td.g+=d.g; } Y.full.h+=d.h; Y.full.c+=d.c; Y.full.g+=d.g; Y.days++; }
      var cur=years[thisYear]; if(!cur){ status('Degree days: no data for '+thisYear); return; }
      var norm={h:0,c:0,g:0}, n=0; for(var y=1991;y<=2020;y++){ if(years[y]){ norm.h+=years[y].td.h; norm.c+=years[y].td.c; norm.g+=years[y].td.g; n++; } }
      norm.h/=n; norm.c/=n; norm.g/=n;
      var fmt=function(v){ return Math.round(v).toLocaleString(); }, dev=function(v,nv){ var d=v-nv, p=nv?Math.round(d/nv*100):0; return (d>=0?'+':'−')+fmt(Math.abs(d))+' ('+(p>=0?'+':'')+p+'%) vs. 1991–2020 normal '+fmt(nv); };
      $('dd-h').textContent=fmt(cur.td.h); $('dd-c').textContent=fmt(cur.td.c); $('dd-g').textContent=fmt(cur.td.g);
      /* Albany observed (station_dd.js), same date, same formulas */
      var SD = window.STATION_DD, doy = Math.round((Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())-Date.UTC(t.getFullYear(),0,1))/86400000)+1, sy = SD && SD.years[thisYear], sn = null;
      if(SD){ var acc={h:0,c:0,g:0}, k=0; for(var yy=1991; yy<=2020; yy++){ var Y=SD.years[yy]; if(Y){ acc.h+=Y.h[doy-1]; acc.c+=Y.c[doy-1]; acc.g+=Y.g[doy-1]; k++; } } if(k){ sn={h:acc.h/k,c:acc.c/k,g:acc.g/k}; } }
      var obs=function(key){ if(!sy||!sn) return ''; var v=sy[key][doy-1]; return '<br><span class="obs">Albany observed: <b>'+fmt(v)+'</b> · normal '+fmt(sn[key])+' ('+(v-sn[key]>=0?'+':'−')+fmt(Math.abs(v-sn[key]))+')</span>'; };
      $('dd-h-d').innerHTML='<b>'+dev(cur.td.h,norm.h)+'</b>'+obs('h')+'<br>Base 65°F: each degree the daily mean falls below 65 is one heating degree day.';
      $('dd-c-d').innerHTML='<b>'+dev(cur.td.c,norm.c)+'</b>'+obs('c')+'<br>Base 65°F, the other direction: heat the season has thrown at us.';
      $('dd-g-d').innerHTML='<b>'+dev(cur.td.g,norm.g)+'</b>'+obs('g')+'<br>Base 50°F, capped at 86°F (the corn scale). Insects, weeds and crops keep their calendars in these units.';
      $('dd-note').textContent='Jan 1 – '+end+' · Berne, NY at ~1,700 ft: ERA5 reanalysis via Open-Meteo. Albany observed: '+(SD?SD.station+', '+SD.source+' (observed since June 1938; ~1,400 ft lower and 25 mi east, so it runs warmer)':'not loaded')+'. Normals are the 1991–2020 mean through this same date, same formulas for both.';
      /* year-by-year table (collapsed) */
      var ys=Object.keys(years).map(Number).sort(function(a,b){ return b-a; });
      var h='<table class="ddtab"><thead><tr><th>Year</th><th colspan="3">Berne · through '+mmdd.replace('-','/')+'</th><th colspan="3">Berne · full year</th>'+(SD?'<th colspan="3">Albany observed · through '+mmdd.replace('-','/')+'</th>':'')+'</tr><tr><th></th><th>Heat</th><th>Cool</th><th>Grow</th><th>Heat</th><th>Cool</th><th>Grow</th>'+(SD?'<th>Heat</th><th>Cool</th><th>Grow</th>':'')+'</tr></thead><tbody>';
      if(SD){ Object.keys(SD.years).forEach(function(y){ y=+y; if(!years[y]) years[y]={td:{h:0,c:0,g:0},full:{h:0,c:0,g:0},days:0,noBerne:true}; }); }
      var ys=Object.keys(years).map(Number).sort(function(a,b){ return b-a; });
      ys.forEach(function(y){ var Y=years[y], nb=Y.noBerne, S=SD&&SD.years[y]; h+='<tr'+(y===thisYear?' class="cur"':'')+'><td>'+y+'</td><td>'+(nb?'—':fmt(Y.td.h))+'</td><td>'+(nb?'—':fmt(Y.td.c))+'</td><td>'+(nb?'—':fmt(Y.td.g))+'</td><td>'+(nb||y===thisYear?'—':fmt(Y.full.h))+'</td><td>'+(nb||y===thisYear?'—':fmt(Y.full.c))+'</td><td>'+(nb||y===thisYear?'—':fmt(Y.full.g))+'</td>'+(SD?'<td>'+(S?fmt(S.h[doy-1]):'—')+'</td><td>'+(S?fmt(S.c[doy-1]):'—')+'</td><td>'+(S?fmt(S.g[doy-1]):'—')+'</td>':'')+'</tr>'; });
      h+='</tbody></table>';
      $('dd-hist').innerHTML=h;
      $('dd-toggle').style.display='inline-block';
    }).catch(function(e){ $('dd-note').textContent='Degree-day history unavailable right now.'; status('Degree days: '+(e && e.message || 'fetch failed')); });
  }

  function init(){ renderSunMoon(); fetchWx(); fetchDD(); setInterval(renderSunMoon, 60000); setInterval(fetchWx, 15*60000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
