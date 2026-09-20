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
  function needle(id, deg){ var n=$(id); if(n) n.setAttribute('transform','rotate('+deg+' 100 100)'); }
  function windDial(prefix, kt, dir, extra){
    if(typeof kt!=='number'){ $(prefix+'-val').textContent='—'; $(prefix+'-sub').textContent='no data'; return; }
    needle(prefix+'-needle', (dir+180)%360);                       /* arrow points downwind */
    $(prefix+'-val').textContent = Math.round(kt)+' kt';
    $(prefix+'-sub').textContent = 'from '+compass(dir)+' · '+Math.round(dir)+'°'+(extra?' · '+extra:'');
  }
  function gauge(prefix, val, min, max, text, sub){
    var frac = Math.max(0, Math.min(1, (val-min)/(max-min)));
    needle(prefix+'-needle', -120 + frac*240);                    /* 240° sweep */
    $(prefix+'-val').textContent = text; if(sub!==undefined) $(prefix+'-sub').textContent = sub;
  }

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
      var clk=function(ms){ return new Date(ms).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).toLowerCase(); }; $('sun-rise').textContent = clk(rise); $('sun-set').textContent = clk(set);
      $('sun-len').textContent = Math.floor(len)+'h '+Math.round((len%1)*60)+'m of daylight';
      var frac = Math.max(0, Math.min(1, (now-rise)/(set-rise)));
      var a = Math.PI*(1-frac), sx = 100+80*Math.cos(a), sy = 110-70*Math.sin(a);
      $('sun-dot').setAttribute('cx', sx); $('sun-dot').setAttribute('cy', sy);
      $('sun-dot').style.opacity = (now<rise||now>set) ? .25 : 1;
      var tmr = new Date(now+86400000), iso = tmr.getFullYear()+'-'+String(tmr.getMonth()+1).padStart(2,'0')+'-'+String(tmr.getDate()).padStart(2,'0');
      var st2 = sunTimes(iso, LAT, LNG), d = st2 ? ((st2.set-st2.rise)-(set-rise))/60000 : 0;
      $('sun-delta').textContent = (d>=0?'+':'')+d.toFixed(1)+' min vs. tomorrow';
    }
    if(window.moonAge){
      var age = moonAge(now), ill = (1-Math.cos(age/SYNODIC*2*Math.PI))/2;
      $('moon-svg').innerHTML = drawMoon(age);
      $('moon-phase').textContent = phaseLabel(age)+' · '+Math.round(ill*100)+'% lit';
      $('moon-age').textContent = age.toFixed(1)+' days into the lunation · next new moon in '+(SYNODIC-age).toFixed(1)+' days';
      if(window.lunationInfo){ var li = lunationInfo(now); $('moon-name').textContent = li.word; $('moon-mean').textContent = li.english||''; }
    }
  }

  /* ---------- weather + winds ---------- */
  function fetchWx(){
    var url = 'https://api.open-meteo.com/v1/forecast?'+Q
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,cloud_cover'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=1'
      + '&temperature_unit=fahrenheit&wind_speed_unit=kn&precipitation_unit=inch';
    fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var c = j.current; if(!c) return;
      gauge('temp', c.temperature_2m, -20, 110, Math.round(c.temperature_2m)+'°F', 'feels like '+Math.round(c.apparent_temperature)+'° · '+Math.round(f2c(c.temperature_2m))+'°C');
      gauge('hum', c.relative_humidity_2m, 0, 100, c.relative_humidity_2m+'%', 'relative humidity');
      var inHg = c.surface_pressure*0.02953;
      gauge('pres', inHg, 28.5, 31, inHg.toFixed(2)+' inHg', Math.round(c.surface_pressure)+' hPa at the surface');
      gauge('cloud', c.cloud_cover, 0, 100, c.cloud_cover+'%', 'cloud cover · '+(window.skyKind ? skyKind(c.weather_code, c.is_day)[1] : ''));
      windDial('w10', c.wind_speed_10m, c.wind_direction_10m, 'gusts '+Math.round(c.wind_gusts_10m)+' kt');
      var d = j.daily||{};
      $('day-hi').textContent = Math.round(d.temperature_2m_max[0])+'°'; $('day-lo').textContent = Math.round(d.temperature_2m_min[0])+'°';
      $('day-pcp').textContent = (d.precipitation_sum[0]||0).toFixed(2)+' in';
    }).catch(function(){});
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
      }).catch(function(){ attempt(i+1); });
    })(0);
  }

  /* ---------- degree days (archive, Jan 1 → yesterday; today from forecast is excluded) ---------- */
  function fetchDD(){
    var y = new Date().getFullYear(), t = new Date(Date.now()-86400000);
    var end = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    var url = 'https://archive-api.open-meteo.com/v1/archive?'+Q+'&start_date='+y+'-01-01&end_date='+end+'&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit';
    fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var mx = j.daily.temperature_2m_max, mn = j.daily.temperature_2m_min, hdd=0, cdd=0, gdd=0, days=0;
      for(var i=0;i<mx.length;i++){ if(typeof mx[i]!=='number'||typeof mn[i]!=='number') continue; days++;
        var mean = (mx[i]+mn[i])/2; if(mean<65) hdd += 65-mean; else cdd += mean-65;
        var gmax = Math.min(86, mx[i]), gmin = Math.max(50, mn[i]); var gm = (gmax+gmin)/2; if(gm>50) gdd += gm-50; }
      $('dd-h').textContent = Math.round(hdd).toLocaleString(); $('dd-c').textContent = Math.round(cdd).toLocaleString(); $('dd-g').textContent = Math.round(gdd).toLocaleString();
      $('dd-note').textContent = 'Jan 1 – '+end+' · '+days+' days · Berne, NY · hourly-model reanalysis (ERA5/ECMWF via Open-Meteo)';
    }).catch(function(){ $('dd-note').textContent = 'Degree-day history unavailable right now.'; });
  }

  function init(){ renderSunMoon(); fetchWx(); fetchDD(); setInterval(renderSunMoon, 60000); setInterval(fetchWx, 15*60000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
