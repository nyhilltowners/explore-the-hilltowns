/* ============ SIGNS + SIGNALS (2026-09-19, per Laurie) ============
   Phenology / natural-cycles dashboard for Berne, NY. Reuses skyline.js (loaded first)
   for BERNE, sunTimes(), moon math, compass(). All data from Open-Meteo (CC BY 4.0):
   - surface + pressure-level winds (10/100/500/850 hPa) via GEM Global (GFS fallback)
   - degree days from the archive API: daily Tmax/Tmin since Jan 1, base 65°F for
     heating/cooling and base 50°F for growing (corn/standard), capped at 86°F. */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var H = window.hfa || {};   /* skyline.js helpers (its code is a closure; it exports these) */
  var compass = H.compass || function(d){ return Math.round(d)+'°'; }, nearestHour = H.nearestHour, skyKind = H.skyKind, SYNODIC = H.SYNODIC || 29.530588853;
  function safe(fn){ try{ fn(); }catch(e){ status(e && e.message || String(e)); } }
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
    if(H.moonAge){
      var age = H.moonAge(now), ill = (1-Math.cos(age/SYNODIC*2*Math.PI))/2;
      var mi = $('moon-ico'); if(mi && H.drawMoon) mi.innerHTML = '<svg viewBox="0 0 40 40" style="fill:none">'+H.drawMoon(age)+'</svg>';
      $('moon-phase').textContent = (H.phaseLabel?H.phaseLabel(age):Math.round(ill*100)+'%');   /* v953 (Laurie): 'lit' dropped */ /* 2026-09-27 (v898, Laurie): phaseLabel already carries the percent — no longer repeated */
      var li = H.lunationInfo ? H.lunationInfo(now) : null;
      $('moon-det').innerHTML = age.toFixed(1)+' days into the lunation · next new moon in '+(SYNODIC-age).toFixed(1)+' days';   /* v953 (Laurie): the Mohawk moon name stays in the header only */
    }
  }

  /* ---------- weather + winds ---------- */
  function fetchWx(){
    var url = 'https://api.open-meteo.com/v1/forecast?'+Q
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day,cloud_cover'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=1'
      + '&hourly=surface_pressure&past_hours=6&forecast_hours=1&timeformat=unixtime' /* v865 (2026-09-25, Laurie): 3-h pressure tendency */
      + '&temperature_unit=fahrenheit&wind_speed_unit=kn&precipitation_unit=inch';
    fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var c = j.current; if(!c){ status('Surface weather: '+(j.reason||'no data')); return; }
      safe(function(){ gauge('temp', c.temperature_2m, -20, 110, Math.round(c.temperature_2m)+'°F', 'feels like '+Math.round(c.apparent_temperature)+'° · '+Math.round(f2c(c.temperature_2m))+'°C');
      });
      safe(function(){ gauge('hum', c.relative_humidity_2m, 0, 100, c.relative_humidity_2m+'%', 'relative humidity'); });
      safe(function(){ var inHg = c.surface_pressure*0.02953, tr='';
        /* v865 (2026-09-25, Laurie): 3-hour tendency from the hourly series (past 6 h + now); WMO-style bands */
        var hp = j.hourly && j.hourly.surface_pressure, ht = j.hourly && j.hourly.time;
        if(hp && ht){ var nowMs=Date.now(), iNow=-1; for(var i=0;i<ht.length;i++){ if(hp[i]!=null && (typeof ht[i]==='number'?ht[i]*1000:Date.parse(ht[i]))<=nowMs) iNow=i; }
          if(iNow>=3 && hp[iNow-3]!=null){ var d=hp[iNow]-hp[iNow-3], a=Math.abs(d), word = a<1?'steady':(a<3?(d>0?'rising slowly':'falling slowly'):(a<6?(d>0?'rising':'falling'):(d>0?'rising rapidly':'falling rapidly'))), arrow = a<1?'→':(d>0?(a<3?'↗':'↑'):(a<3?'↘':'↓'));
            tr = ' · '+arrow+' '+(d>=0?'+':'−')+a.toFixed(1)+' hPa / 3 h, '+word; } }
        gauge('pres', inHg, 28.5, 31, inHg.toFixed(2)+' inHg', Math.round(c.surface_pressure)+' hPa at the surface'+tr);
      });
      safe(function(){ gauge('cloud', c.cloud_cover, 0, 100, c.cloud_cover+'%', 'cloud cover · '+(skyKind ? skyKind(c.weather_code, c.is_day)[1] : ''));
      });
      safe(function(){ windDial('w10', c.wind_speed_10m, c.wind_direction_10m, 'gusts '+Math.round(c.wind_gusts_10m)+' kt'); });
      safe(function(){ var d = j.daily||{};
      $('day-val').innerHTML = '↑ '+Math.round(d.temperature_2m_max[0])+'°<span class="c">↓ '+Math.round(d.temperature_2m_min[0])+'°</span>';
      $('day-det').textContent = 'forecast high / low · '+(d.precipitation_sum[0]||0).toFixed(2)+' in precipitation expected'; });
    }).catch(function(e){ status('Surface weather: '+(e && e.message || 'fetch failed')); });
    var lv = ['850','500','100','10'];
    var q2 = Q+'&hourly='+lv.map(function(l){ return 'wind_speed_'+l+'hPa,wind_direction_'+l+'hPa,geopotential_height_'+l+'hPa'; }).join(',')+',relative_humidity_850hPa,temperature_850hPa&wind_speed_unit=kn&past_hours=3&forecast_hours=6'; /* 2026-09-27 (v928, Laurie): 850 hPa temperature alongside humidity \u2014 saturated air near or below 0\u00b0C at this level is the classic snow setup */ /* 2026-09-27 (v924, Laurie): humidity only at 850 — the level moisture actually shows up at */
    function nearestIdx(j){ if(!j||!j.hourly||!j.hourly.time) return -1; var t=j.hourly.time, now=Date.now(), best=-1,bd=1e18; for(var i=0;i<t.length;i++){ var ms=new Date(t[i]+(j.utc_offset_seconds?'':'Z')).getTime()-(j.utc_offset_seconds||0)*1000; var d=Math.abs(ms-now); if(d<bd){ bd=d; best=i; } } return bd>4*3600*1000?-1:best; }   /* 2026-09-27 (v924, Laurie): mirrors skyline.js's nearestHour matching, just to pull one extra field (humidity) it doesn't expose */
    var tries = ['https://api.open-meteo.com/v1/gem?'+q2+'&models=cmc_gem_global','https://api.open-meteo.com/v1/gfs?'+q2+'&models=gfs_global'];
    (function attempt(i){
      if(i>=tries.length){ lv.forEach(function(l){ windDial(l==='10'?'w10hpa':'w'+l, null); }); return; }
      fetch(tries[i]).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
        var ok = false;
        var rhIdx = nearestIdx(j), rh850 = (rhIdx>=0 && j.hourly && j.hourly.relative_humidity_850hPa) ? j.hourly.relative_humidity_850hPa[rhIdx] : null;
        var t850 = (rhIdx>=0 && j.hourly && j.hourly.temperature_850hPa) ? j.hourly.temperature_850hPa[rhIdx] : null;
        lv.forEach(function(l){ var h = nearestHour ? nearestHour(j,'wind_speed_'+l+'hPa','wind_direction_'+l+'hPa','geopotential_height_'+l+'hPa') : null;
          var pid = (l==='10') ? 'w10hpa' : 'w'+l;
          var extra = h ? (h.gph/1000).toFixed(1)+' km up'+(l==='850'&&typeof rh850==='number'?' \u00b7 '+Math.round(rh850)+'% RH':'')+(l==='850'&&typeof t850==='number'?' \u00b7 '+Math.round(t850)+'\u00b0C ('+Math.round(t850*9/5+32)+'\u00b0F)':'') : null; /* 2026-09-27 (v924, Laurie): relative humidity appended to the 850 hPa row only */
          if(h){ ok = true; windDial(pid, h.kt, h.dir, extra); } else windDial(pid, null); });
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
  var _ddCache = null;
  function buildPicker(){ var sel=$('st-pick'), ALL=window.STATION_DD; if(!sel||!ALL||sel.options.length) return;
    /* v953 (2026-09-28, Laurie): this picker only feeds the year-to-date grid, so only stations still reporting belong in
       it (a closed station has no current year to compare). Closed stations stay in station_dd.js and in the
       year-by-year chart source picker, where their history is the point. Label = name · since YYYY. */
    /* v954 (Laurie): Berne reanalysis first and default; then the active stations. This one picker drives Rain & snow AND the year-by-year charts. */
    var ob=document.createElement('option'); ob.value='berne'; ob.textContent='Berne reanalysis \u00b7 ERA5 grid cell, ~1,700 ft \u00b7 since 1940'; sel.appendChild(ob);
    Object.keys(ALL.stations).forEach(function(k){ var S=ALL.stations[k]; if(!S.active) return; var o=document.createElement('option'); o.value=k; o.textContent=S.name.replace(/ — elev\. approx\./,'')+' \u00b7 since '+S.first; sel.appendChild(o); }); sel.value='berne'; sel.onchange=function(){ if(_ddCache) renderDD(_ddCache); }; }
  /* 2026-09-27 (v906, Laurie): both archive requests are 86 years of daily data — big enough that reloading the
     page repeatedly could run into Open-Meteo's free-tier daily request cap ("Daily API request
     limit exceeded"), which is what blanked every chart. Cache each response in localStorage,
     keyed by the end date, so the same browser only re-fetches once per day rather than once per
     page load. A cache-read failure (quota, private browsing, corrupt JSON) just falls through to
     a normal fetch. */
  function lsGet(key){ try{ return JSON.parse(localStorage.getItem(key)); }catch(e){ return null; } }
  function lsSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
  function fetchDD(){
    buildPicker();
    if(_ddCache){ renderDD(_ddCache); return; }
    var t = new Date(Date.now()-86400000), end = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    var thisYear = t.getFullYear(), mmdd = end.slice(5);
    var cacheKey = 'hfa.dd.'+end;
    var cached = lsGet(cacheKey);
    if(cached && cached.daily){ _ddCache=cached; renderDD(cached); fetchMoisture(end); return; }
    var url = 'https://archive-api.open-meteo.com/v1/archive?'+Q+'&start_date=1940-01-01&end_date='+end+'&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit'; /* v887 (2026-09-26): moisture is fetched separately (fetchMoisture) so a failure there cannot blank the temperature charts */
    var stn0=$('st-note'); if(stn0) stn0.textContent = 'Loading 1940–'+thisYear+' history…';   /* v954: status goes beside the picker; #dd-note is now the static sources footnote */
    fetch(url).then(function(r){ return r.json(); }).then(function(j){ if(!j||!j.daily){ throw new Error(j&&j.reason?j.reason:'no daily data'); } _ddCache=j; lsSet(cacheKey,j); renderDD(j); fetchMoisture(end); }).catch(function(e){ var stn1=$('st-note'); if(stn1) stn1.textContent='History unavailable right now'+(/limit/i.test(e&&e.message||'')?' — Open-Meteo\u2019s free daily request limit was reached; this resets tomorrow.':'.'); status('Degree days: '+(e && e.message || 'fetch failed')); });
  }
  /* v887 (2026-09-26): second request for the moisture charts; merged into the year series when it arrives */
  var _moist=null;
  function fetchMoisture(end){
    if(_moist){ return; }
    var cacheKey='hfa.moist.'+end, cached=lsGet(cacheKey);
    if(cached && cached.daily){ _moist=cached; if(_ddCache){ mergeMoisture(_ddCache,cached); renderDD(_ddCache); } return; }
    var url='https://archive-api.open-meteo.com/v1/archive?'+Q+'&start_date=1940-01-01&end_date='+end+'&daily=precipitation_sum,rain_sum,snowfall_sum&precipitation_unit=inch';
    fetch(url).then(function(r){ return r.json(); }).then(function(m){ if(!m||!m.daily) throw new Error(m&&m.reason?m.reason:'no daily data'); _moist=m; lsSet(cacheKey,m); if(_ddCache){ mergeMoisture(_ddCache,m); renderDD(_ddCache); } })
      .catch(function(e){ status('Rain/snow history: '+(e && e.message || 'fetch failed')); var rn=$('ch-rain-note'); if(rn) rn.textContent='Rain and snow history could not be loaded'+(/limit/i.test(e&&e.message||'')?' — Open-Meteo\u2019s free daily request limit was reached; this resets tomorrow.':' right now.'); });
  }
  function mergeMoisture(j,m){ var idx={}; m.daily.time.forEach(function(t,i){ idx[t]=i; }); ['precipitation_sum','rain_sum','snowfall_sum'].forEach(function(k){ j.daily[k]=j.daily.time.map(function(t){ var i=idx[t]; return i==null?null:m.daily[k][i]; }); }); }
  /* ---------- the year, drawn: one chart builder, six charts ---------- */
  function yearSeries(j){
    var T=j.daily.time, mx=j.daily.temperature_2m_max, mn=j.daily.temperature_2m_min, pp=j.daily.precipitation_sum||[], rr=j.daily.rain_sum||[], ss=j.daily.snowfall_sum||[], out={};
    var mk=function(){ return {hi:new Array(366),lo:new Array(366),mean:new Array(366),hdd:new Array(366),cdd:new Array(366),gdd:new Array(366),rain:new Array(366),snow:new Array(366),precip:new Array(366),_h:0,_c:0,_g:0,_r:0,_s:0,_p:0}; };
    for(var i=0;i<T.length;i++){
      var y=+T[i].slice(0,4), d=new Date(T[i]+'T00:00:00Z'), doy=Math.round((d-Date.UTC(y,0,1))/86400000);
      var Y=out[y]||(out[y]=mk());
      if(typeof mx[i]==='number'&&typeof mn[i]==='number'){
        var mean=(mx[i]+mn[i])/2; Y.hi[doy]=mx[i]; Y.lo[doy]=mn[i]; Y.mean[doy]=mean;
        Y._h+=Math.max(0,65-mean); Y._c+=Math.max(0,mean-65); Y._g+=Math.max(0,(Math.min(86,mx[i])+Math.max(50,mn[i]))/2-50);
        Y.hdd[doy]=Y._h; Y.cdd[doy]=Y._c; Y.gdd[doy]=Y._g; }
      /* v883 (2026-09-26, Laurie): accumulating moisture — rain and total in inches of water, snowfall in inches of snow (Open-Meteo reports snowfall in inches when precipitation_unit=inch) */
      if(typeof rr[i]==='number'){ Y._r+=rr[i]; Y.rain[doy]=Y._r; }
      if(typeof ss[i]==='number'){ Y._s+=ss[i]; Y.snow[doy]=Y._s; }
      if(typeof pp[i]==='number'){ Y._p+=pp[i]; Y.precip[doy]=Y._p; } }
    return out;
  }
  /* v886 (2026-09-26, Laurie): snowfall by winter — key = the July year, index 0 = Jul 1, accumulating through Jun 30 */
  var _winterBerne=null;
  function winterFromDaily(T, ss){
    var out={}, doyOf=function(y,d){ return Math.round((d-Date.UTC(y,0,1))/86400000); };
    for(var i=0;i<T.length;i++){ if(typeof ss[i]!=='number') continue;
      var y=+T[i].slice(0,4), d=new Date(T[i]+'T00:00:00Z'), doy=doyOf(y,d), jul=(y%4===0&&(y%100!==0||y%400===0))?182:181;
      var wy=doy>=jul?y:y-1, idx=doy>=jul?doy-jul:doy+184;
      var W=out[wy]||(out[wy]={snow:new Array(366),_s:0}); W._s+=ss[i]; W.snow[idx]=W._s; }
    return out;
  }
  function winterFromStation(S){
    var out={}; Object.keys(S.years).map(Number).sort().forEach(function(y){ var Y=S.years[y]; if(!Y.np||!Y.s) return;
      var jul=(y%4===0&&(y%100!==0||y%400===0))?182:181;
      for(var d=0; d<Y.s.length; d++){ var daily=Y.s[d]-(d?Y.s[d-1]:0); var wy=d>=jul?y:y-1, idx=d>=jul?d-jul:d+184;
        var W=out[wy]||(out[wy]={snow:new Array(366),_s:0}); W._s+=daily; W.snow[idx]=W._s; } });
    return out;
  }
  var _snowMode='year';
  function stationSeries(S){
    var out={}; Object.keys(S.years).forEach(function(y){ var Y=S.years[y]; if(!Y.dhi && !(Y.np>0)) return;   /* v954: precip-only years still draw the moisture charts */
      var o={hi:new Array(366),lo:new Array(366),mean:new Array(366),hdd:new Array(366),cdd:new Array(366),gdd:new Array(366),rain:new Array(366),snow:new Array(366),precip:new Array(366)}, h=0,c=0,g=0;
      for(var d=0;d<366 && Y.dhi;d++){ var mx=Y.dhi[d], mn=Y.dlo[d]; if(typeof mx!=='number'||typeof mn!=='number') continue;
        var mean=(mx+mn)/2; o.hi[d]=mx; o.lo[d]=mn; o.mean[d]=mean; h+=Math.max(0,65-mean); c+=Math.max(0,mean-65); g+=Math.max(0,(Math.min(86,mx)+Math.max(50,mn))/2-50); o.hdd[d]=h; o.cdd[d]=c; o.gdd[d]=g; }
      /* v883 (2026-09-26, Laurie): station precipitation (liquid, incl. melted snow) and snowfall are cumulative by day-of-year in station_dd.js; rain alone is not observed at a NOAA co-op station */
      if(Y.np>0 && Y.p){ for(var d2=0; d2<366 && d2<Y.p.length; d2++){ o.precip[d2]=Y.p[d2]; o.snow[d2]=Y.s[d2]; } }
      out[y]=o; });
    return out;
  }
  /* 2026-09-27 (v933, Laurie): year colours are now tied to the calendar year itself, not to whichever years a given
     source happens to contain. 1956 is the same violet on every station and on Berne; only the real
     current year (New York time) is bold white. Before, the LAST year of each dataset was drawn as "now",
     so a station that closed in 1932 traced 1932 in bold white. */
  var CUR_YEAR = +new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric'}).format(new Date());
  var CUR_MONTH = +new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',month:'numeric'}).format(new Date());
  var COLOR_Y0 = 1869;   /* earliest daily record in the whole set (Central Park) = the deepest violet */
  function drawChart(id, years, key, tMin, tMax, smooth, unit, opts){
    opts=opts||{}; var shift=opts.shift||0, curY=opts.curYear||CUR_YEAR, lab0=opts.label||function(y){ return String(y); };
    var lab=function(y){ return lab0(y)+((years[y]&&years[y].modeled)?' (modeled)':''); }; /* v886 (2026-09-26, Laurie): shift=6 → July-first winter axis */
    var svg=$(id), tip=$(id+'-tip'); if(!svg) return;
    var allYs=Object.keys(years).map(Number).sort(function(a,b){ return a-b; }), y0=allYs[0], yN=allYs[allYs.length-1];
    var ys=allYs.filter(function(y){ return !_yearSel || _yearSel[y]!==false; }); /* v882 (2026-09-26, Laurie): year picker — colours keyed to the full range so a year keeps its shade when others are hidden */
    /* 2026-09-27 (v928, Laurie): every chart keeps its shared default range so stations and years stay comparable,
       but if ANY year in the current dataset runs past it (Central Park's CDD, GDD and yearly rain
       all do), the axis stretches to the next round number, only as far as needed. Measured over
       every year available, not just the checked ones, so the scale doesn't jump as you toggle years. */
    var dMax=-Infinity, dMin=Infinity;
    allYs.forEach(function(y){ var arr=years[y][key]||[]; for(var d=0; d<arr.length; d++){ var x=arr[d]; if(typeof x==='number'){ if(x>dMax) dMax=x; if(x<dMin) dMin=x; } } });
    var span0=tMax-tMin, niceStep=span0>=2000?500:(span0>=200?50:(span0>=50?10:5));
    if(dMax>tMax) tMax=Math.ceil(dMax/niceStep)*niceStep;
    if(dMin<tMin) tMin=Math.floor(dMin/niceStep)*niceStep;
    var W=1000,H=420,L=64,R=10,Tp=10,B=28; /* 2026-09-27 (v914, Laurie): L widened 48→64 — the HDD/CDD/GDD tick labels ("8,500HDD") were running off the left edge */
    var X=function(doy){ return L+(W-L-R)*doy/365; }, Y=function(t){ return Tp+(H-Tp-B)*(1-(t-tMin)/(tMax-tMin)); };
    var h='', mdays0=[0,31,59,90,120,151,181,212,243,273,304,334], mon0=['J','F','M','A','M','J','J','A','S','O','N','D'];
    var mdays=mdays0, mon=mon0; if(shift){ var base=mdays0[shift]; mdays=mdays0.slice(shift).map(function(v){ return v-base; }).concat(mdays0.slice(0,shift).map(function(v){ return v+365-base; })); mon=mon0.slice(shift).concat(mon0.slice(0,shift)); }
    var step=(tMax-tMin)>=2000?1000:((tMax-tMin)>=200?200:((tMax-tMin)>=150?20:((tMax-tMin)<=70&&unit===' in'?10:20)));
    var axUnit=(unit==='HDD'||unit==='CDD'||unit==='GDD')?'':unit; /* 2026-09-27 (v914, Laurie): drop the redundant HDD/CDD/GDD suffix from every tick — the chart's own title already says which one it is; ° and " in" stay, they're short and genuinely informative per tick */
    for(var t=Math.ceil(tMin/step)*step;t<=tMax;t+=step){ h+='<line class="ax" x1="'+L+'" y1="'+Y(t)+'" x2="'+(W-R)+'" y2="'+Y(t)+'"/><text class="lbl" x="'+(L-6)+'" y="'+(Y(t)+4)+'" text-anchor="end">'+t.toLocaleString()+axUnit+'</text>'; }
    for(var m=0;m<12;m++){ h+='<line class="ax" x1="'+X(mdays[m])+'" y1="'+Tp+'" x2="'+X(mdays[m])+'" y2="'+(H-B)+'"/><text class="lbl" x="'+X(mdays[m]+15)+'" y="'+(H-8)+'" text-anchor="middle">'+mon[m]+'</text>'; }
    if(unit==='°' && tMin<32 && tMax>32) h+='<line class="ax" x1="'+L+'" y1="'+Y(32)+'" x2="'+(W-R)+'" y2="'+Y(32)+'" style="stroke:rgba(255,255,255,.45); stroke-dasharray:4 4"/><text class="lbl" x="'+(W-R-4)+'" y="'+(Y(32)-4)+'" text-anchor="end">freezing</text>';
    var vals={};   /* smoothed values per year for hover */
    ys.forEach(function(y){
      var v=years[y][key], pts=[], sv=new Array(366), f=Math.max(0,Math.min(1,(y-COLOR_Y0)/Math.max(1,(curY-1-COLOR_Y0)))), cur=(y===curY), mod=!!years[y].modeled;
      var col=cur?'#ffffff':'rgb('+Math.round(150+70*f)+','+Math.round(70+150*f)+','+Math.round(235+20*f)+')', op=cur?1:(0.6+0.35*f), sw=cur?2.4:1.1; /* v884 (2026-09-26, Laurie): oldest = deep violet, newest = pale lavender, all readable; this year white */
      for(var d=0;d<366;d++){ var val=null;
        if(smooth){ var s_=0,n=0; for(var q=-3;q<=3;q++){ var x=v[d+q]; if(typeof x==='number'){ s_+=x; n++; } } if(n>=4) val=s_/n; }
        else if(typeof v[d]==='number') val=v[d];
        if(val!=null){ sv[d]=val; pts.push(X(d).toFixed(1)+','+Y(val).toFixed(1)); } }
      vals[y]=sv;
      if(pts.length>1) h+='<polyline data-y="'+y+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-opacity="'+op+'" stroke-linejoin="round"'+(mod?' stroke-dasharray="7 4"':'')+' points="'+pts.join(' ')+'"/>';
    });
    svg.innerHTML=h;
    /* v885 (2026-09-26, Laurie): play button — draw the shown years in chronologically, oldest first */
    var ctl=svg.parentNode.querySelector('.ch-play'); if(!ctl){ ctl=document.createElement('button'); ctl.type='button'; ctl.className='ch-play'; svg.parentNode.appendChild(ctl); }
    var yl=svg.parentNode.querySelector('.ch-year'); if(!yl){ yl=document.createElement('div'); yl.className='ch-year'; svg.parentNode.appendChild(yl); }
    ctl.textContent='▶ Play'; yl.style.display='none';
    if(svg._timer){ clearTimeout(svg._timer); svg._timer=null; }
    ctl.onclick=function(){
      var lines=ys.map(function(y){ return svg.querySelector('polyline[data-y="'+y+'"]'); }).filter(Boolean);
      if(svg._timer){ /* stop: show everything */
        clearTimeout(svg._timer); svg._timer=null; lines.forEach(function(el){ el.style.transition='none'; el.style.strokeDasharray=''; el.style.strokeDashoffset=''; el.style.visibility=''; }); ctl.textContent='▶ Play'; yl.style.display='none'; return; }
      if(!lines.length) return;
      lines.forEach(function(el){ var len=el.getTotalLength(); el.style.transition='none'; el.style.strokeDasharray=len; el.style.strokeDashoffset=len; el.style.visibility='hidden'; });
      ctl.textContent='■ Stop'; yl.style.display='block';
      var i=0, step=Math.max(60, Math.min(220, Math.round(9000/lines.length))), draw=Math.round(step*2.2);
      var tick=function(){ if(i>=lines.length){ svg._timer=null; ctl.textContent='▶ Play'; yl.style.display='none'; return; }
        var el=lines[i]; yl.textContent=lab(+el.getAttribute('data-y')); el.style.visibility='visible'; svg.appendChild(el);
        requestAnimationFrame(function(){ el.style.transition='stroke-dashoffset '+draw+'ms linear'; el.style.strokeDashoffset='0'; });
        i++; svg._timer=setTimeout(tick, step); };
      tick();
    };
    /* hover: nearest line at the cursor's day */
    var lastHl=null;
    svg.onmousemove=function(e){
      var r=svg.getBoundingClientRect(), px=(e.clientX-r.left)/r.width*W, py=(e.clientY-r.top)/r.height*H;
      var doy=Math.max(0,Math.min(365,Math.round((px-L)/(W-L-R)*365))), best=null, bd=1e9;
      ys.forEach(function(y){ var v=vals[y][doy]; if(v==null) return; var d=Math.abs(Y(v)-py); if(d<bd){ bd=d; best=y; } });
      if(lastHl) lastHl.classList.remove('hl');
      if(best!=null && bd<18){ var el=svg.querySelector('polyline[data-y="'+best+'"]'); if(el){ el.classList.add('hl'); svg.appendChild(el); lastHl=el; }
        var v=vals[best][doy]; tip.style.display='block'; tip.textContent=lab(best)+' · '+(unit==='°'?Math.round(v)+'°F':Math.round(v).toLocaleString()+' '+unit)+' on '+mon[Math.max(0,mdays.findIndex(function(md,i){ return doy<(mdays[i+1]||366); }))]+' '+(doy-mdays[Math.max(0,mdays.findIndex(function(md,i){ return doy<(mdays[i+1]||366); }))]+1); }
      else { tip.style.display='none'; }
    };
    svg.onmouseleave=function(){ if(lastHl) lastHl.classList.remove('hl'); tip.style.display='none'; };
  }
  /* v882 (2026-09-26, Laurie): shared year selection for the six charts. null = all years; otherwise {year:false} for hidden years. */
  var _yearSel=null, _pickYears=[];
  function yearsShown(){ return _pickYears.filter(function(y){ return !_yearSel || _yearSel[y]!==false; }); }
  function setYear(y,on){ if(!_yearSel){ _yearSel={}; } if(on) delete _yearSel[y]; else _yearSel[y]=false; if(!Object.keys(_yearSel).length) _yearSel=null; syncPickers(); drawCharts(); }
  function setAllYears(on){ if(on){ _yearSel=null; } else { _yearSel={}; _pickYears.forEach(function(y){ _yearSel[y]=false; }); } syncPickers(); drawCharts(); }
  function syncPickers(){
    var n=yearsShown().length, tot=_pickYears.length;
    document.querySelectorAll('.yr-pick').forEach(function(d){
      d.querySelector('summary').textContent='Years: '+(n===tot?'all '+tot:(n===0?'none':n+' of '+tot))+' ▾';
      d.querySelectorAll('input[type=checkbox]').forEach(function(cb){ cb.checked=!_yearSel||_yearSel[+cb.value]!==false; });
    });
  }
  function buildPickers(years){
    _pickYears=Object.keys(years).map(Number).sort(function(a,b){ return b-a; });
    _yearSel=null;
    ['ch-mean','ch-hi','ch-lo','ch-hdd','ch-cdd','ch-gdd','ch-rain','ch-snow','ch-precip'].forEach(function(id){
      var svg=$(id); if(!svg) return; var box=svg.parentNode, blurb=box.previousElementSibling, h3=blurb&&blurb.previousElementSibling;
      var old=document.querySelector('.yr-pick[data-for="'+id+'"]'); if(old) old.parentNode.removeChild(old);
      var d=document.createElement('details'); d.className='yr-pick'; d.setAttribute('data-for',id);
      var h='<summary></summary><div class="yr-pick-panel"><div class="yr-pick-tools"><a href="#" data-act="all">Select all</a> \u00b7 <a href="#" data-act="clear">Clear</a></div><div class="yr-pick-grid">';
      _pickYears.forEach(function(y){ h+='<label><input type="checkbox" value="'+y+'" checked> '+y+'</label>'; });
      d.innerHTML=h+'</div></div>';
      d.addEventListener('change',function(e){ var cb=e.target; if(cb && cb.type==='checkbox') setYear(+cb.value, cb.checked); });
      d.addEventListener('click',function(e){ var a=e.target.closest && e.target.closest('a[data-act]'); if(a){ e.preventDefault(); setAllYears(a.getAttribute('data-act')==='all'); } });
      /* 2026-09-27 (v914, Laurie): put the picker on the same row as the chart's <h3> title instead of on
         its own line above the chart — wrap the title's own text once so flex has two children. */
      if(h3 && h3.tagName==='H3'){
        if(!h3.querySelector('.sg-h3-txt')){ var span=document.createElement('span'); span.className='sg-h3-txt'; span.textContent=h3.textContent; h3.textContent=''; h3.appendChild(span); }
        h3.appendChild(d);
      } else { box.parentNode.insertBefore(d, box); }   /* fallback if the markup ever changes */
    });
    syncPickers();
  }
  function drawCharts(){
    var years=_curYears; if(!years) return;
    drawChart('ch-mean', years, 'mean', -20, 95, false, '°');
    drawChart('ch-hi',   years, 'hi',  -10, 105, false, '°');
    drawChart('ch-lo',   years, 'lo',  -35,  80, false, '°');
    drawChart('ch-hdd',  years, 'hdd',   0, 8500, false, 'HDD');
    drawChart('ch-cdd',  years, 'cdd',   0, 1400, false, 'CDD');
    drawChart('ch-gdd',  years, 'gdd',   0, 4000, false, 'GDD');
    drawChart('ch-rain', years, 'rain',  0,  60, false, ' in');
    if(_snowMode==='winter' && _curWinter){ var wsel={}; Object.keys(_curWinter).forEach(function(w){ wsel[w]=_curWinter[w]; }); drawChart('ch-snow', wsel, 'snow', 0, 160, false, ' in', {shift:6, curYear:(CUR_MONTH>=7?CUR_YEAR:CUR_YEAR-1), label:function(y){ return y+'–'+String(y+1).slice(2); }}); }
    else drawChart('ch-snow', years, 'snow',  0, 160, false, ' in');
    var sm=$('snow-mode'); if(sm){ sm.querySelectorAll('a').forEach(function(a){ a.classList.toggle('on', a.getAttribute('data-mode')===_snowMode); }); }
    drawChart('ch-precip', years, 'precip', 0, 70, false, ' in');
    var rn=$('ch-rain-note'); if(rn) rn.textContent = (_curSrc==='berne') ? '' : 'Rain alone is not recorded at a NOAA co-op station — total precipitation (next chart down) is the liquid total including melted snow. Switch the source to the Berne reanalysis to see rain and snow separated.';
    var ys=yearsShown(), nn=$('yr-note'); if(nn) nn.textContent = (ys.length?ys.length+' of '+_pickYears.length+' years shown ('+Math.min.apply(null,ys)+'–'+Math.max.apply(null,ys)+')':'No years selected')+' · '+_curNote+' · raw daily values.';
  }
  var _curYears=null, _curNote='', _curSrc='berne', _curWinter=null;
  var _yearsBerne=null;
  document.addEventListener('DOMContentLoaded',function(){ var sm=$('snow-mode'); if(sm) sm.addEventListener('click',function(e){ var a=e.target.closest&&e.target.closest('a[data-mode]'); if(!a) return; e.preventDefault(); _snowMode=a.getAttribute('data-mode'); drawCharts(); }); });
  function renderYearChart(j){
    if(!j||!j.daily){ status('Year charts: '+(j&&j.reason?j.reason:'no data')); return; }
    _yearsBerne=yearSeries(j); _winterBerne=winterFromDaily(j.daily.time, j.daily.snowfall_sum||[]);
    drawAll();   /* v954: the single station picker (#st-pick) is the source */
  }
  /* 2026-09-27 (v933, Laurie): a closed station has no current-year line to compare against. When the station has known
     coordinates and no (or almost no) data for the current year, fetch ERA5 reanalysis for THAT location for
     this year so far (one small request, cached per day) and draw it as a dashed bold-white "2026 (modeled)"
     line. It is the model's estimate for the place, not an observation and not bias-corrected against the
     station, and the note under the source picker says so. Stations with no coordinates, or that are still
     reporting, are untouched. */
  var _modeledYears = {};
  function needsModeled(S, years){
    if(typeof S.lat !== 'number' || typeof S.lng !== 'number') return false;
    var y = years[CUR_YEAR]; if(!y) return true;
    var n = 0; for(var d=0; d<366; d++) if(typeof y.mean[d] === 'number') n++;
    return n < 20;
  }
  function modeledYear(slug, S){
    var end = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(Date.now()-86400000));
    if(+end.slice(0,4) !== CUR_YEAR) return Promise.resolve(null);      /* Jan 1: nothing of the new year exists yet */
    var ck = 'hfa.model.v1.'+slug+'.'+end;
    try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('hfa.model.v1.'+slug+'.')===0 && k!==ck) localStorage.removeItem(k); }); }catch(e){}   /* one day's model per station, not a growing pile */
    if(_modeledYears[ck]) return Promise.resolve(_modeledYears[ck]);
    var build = function(daily){
      var m = yearSeries({daily:daily})[CUR_YEAR]; if(!m) return null;
      m.rain = new Array(366);      /* stations have no observed rain, so no modeled rain line either */
      m.modeled = true; _modeledYears[ck] = m; return m;
    };
    var cached = lsGet(ck); if(cached && cached.time) return Promise.resolve(build(cached));
    var url = 'https://archive-api.open-meteo.com/v1/archive?latitude='+S.lat.toFixed(4)+'&longitude='+S.lng.toFixed(4)
      + '&timezone=America%2FNew_York&start_date='+CUR_YEAR+'-01-01&end_date='+end
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum&temperature_unit=fahrenheit&precipitation_unit=inch';
    return fetch(url).then(function(r){ return r.json(); }).then(function(j2){
      if(!j2 || !j2.daily) return null;
      lsSet(ck, j2.daily); return build(j2.daily);
    }).catch(function(){ return null; });
  }
  function drawAll(){
    var sel=$('st-pick'), ALL=window.STATION_DD, src=sel?sel.value:'berne', years, note='', S=null;
    if(src==='berne'||!ALL||!ALL.stations[src]){ years=_yearsBerne; _curWinter=_winterBerne; note=''; }
    else { S=ALL.stations[src]; years=stationSeries(S); _curWinter=winterFromStation(S); note='Observed at '+S.name.replace(/ — elev\. approx\./,'')+', ~'+S.elev.toLocaleString()+' ft \u2014 NOAA readings, gaps where the observer missed a day.'; }
    var n=$('ch-src-note'); if(n) n.textContent=note;
    /* v954: a precip-only station has no temperature record - hide the six temperature/degree-day charts rather than draw them empty */
    var noTemp = !!(S && !S.daily); var wrap=document.querySelector('.sg-wrap'); if(wrap) wrap.classList.toggle('no-temp', noTemp);
    var ntn=$('no-temp-note'); if(ntn){ ntn.style.display=noTemp?'':'none'; ntn.textContent=noTemp?('This station records precipitation and snow only; the temperature and degree-day charts are hidden. Choose Berne reanalysis or a station with a thermometer to see them.'):''; }
    if(!years) return;
    _curSrc=src; _curYears=years; _curNote=(src==='berne'?'ERA5 reanalysis for Berne via Open-Meteo':'NOAA GHCN-Daily via xmACIS2');
    buildPickers(years); /* source change resets the selection to all years */
    drawCharts();
    if(S && needsModeled(S, years)){
      modeledYear(src, S).then(function(m){
        var sel2=$('st-pick'); if(!m || (sel2?sel2.value:'berne')!==src) return;      /* user moved on, or nothing to draw */
        years[CUR_YEAR]=m;
        var n2=$('ch-src-note'); if(n2) n2.textContent=note+' The dashed white line is '+CUR_YEAR+' so far, modeled \u2014 ERA5 reanalysis for this location, not an observation and not adjusted to this station.';
        buildPickers(years); drawCharts();
      });
    }
  }

  function renderDD(j){
    renderYearChart(j);
    var t = new Date(Date.now()-86400000), end = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    var thisYear = t.getFullYear(), mmdd = end.slice(5);
    (function(){
      var T=j.daily.time, mx=j.daily.temperature_2m_max, mn=j.daily.temperature_2m_min, years={};
      for(var i=0;i<T.length;i++){ var y=+T[i].slice(0,4), d=ddOf(mx[i],mn[i]); if(!d) continue;
        var Y=years[y]||(years[y]={td:{h:0,c:0,g:0},full:{h:0,c:0,g:0},days:0});
        if(T[i].slice(5)<=mmdd){ Y.td.h+=d.h; Y.td.c+=d.c; Y.td.g+=d.g; } Y.full.h+=d.h; Y.full.c+=d.c; Y.full.g+=d.g; Y.days++; }
      var cur=years[thisYear]; if(!cur){ status('Degree days: no data for '+thisYear); return; }
      var norm={h:0,c:0,g:0}, n=0, nyrs=Object.keys(years).map(Number).filter(function(y){ return y<thisYear && years[y].days>=360; });
      nyrs.forEach(function(y){ norm.h+=years[y].td.h; norm.c+=years[y].td.c; norm.g+=years[y].td.g; n++; });
      norm.h/=n; norm.c/=n; norm.g/=n; var normLbl='vs. '+Math.min.apply(null,nyrs)+'–'+Math.max.apply(null,nyrs)+' average';
      var fmt=function(v){ return Math.round(v).toLocaleString(); }, dev=function(v,nv){ var d=v-nv, p=nv?Math.round(d/nv*100):0; return (d>=0?'+':'−')+fmt(Math.abs(d))+' ('+(p>=0?'+':'')+p+'%) '+normLbl+' '+fmt(nv); };
      /* Albany observed (station_dd.js), same date, same formulas */
      /* Observed station (picker; station_dd.js carries several) */
      var ALL = window.STATION_DD, doy = Math.round((Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())-Date.UTC(t.getFullYear(),0,1))/86400000)+1;
      var sel = $('st-pick'), key = (sel && sel.value) || 'berne';
      var SD = ALL && ALL.stations[key], sy = SD && SD.years[thisYear], sn = null;
      if(SD){ var acc={h:0,c:0,g:0}, k=0, y1=null, y2=null; Object.keys(SD.years).forEach(function(yy){ yy=+yy; var Y=SD.years[yy]; if(yy<thisYear && Y && Y.n>=360 && Y.h){ acc.h+=Y.h[doy-1]; acc.c+=Y.c[doy-1]; acc.g+=Y.g[doy-1]; k++; y1=y1==null?yy:Math.min(y1,yy); y2=y2==null?yy:Math.max(y2,yy); } }); if(k>=5){ sn={h:acc.h/k,c:acc.c/k,g:acc.g/k,n:k,y1:y1,y2:y2}; } }
      /* water + extremes for the chosen source - v954: Berne reanalysis (default) computed from the same ERA5 series the charts use, or the chosen station */
      (function(){ var P=$('w-p'); if(!P) return;
        var sel=$('st-pick'), src=(sel&&sel.value)||'berne';
        if(src==='berne'){
          var T=j.daily.time, PP=j.daily.precipitation_sum, SS=j.daily.snowfall_sum, MX=j.daily.temperature_2m_max, MN=j.daily.temperature_2m_min;
          if(!PP){ $('w-p').textContent='…'; $('w-p-d').textContent='Berne reanalysis · loading moisture'; $('w-s').textContent='…'; $('w-s-d').textContent=''; $('w-x').textContent='—'; $('w-x-d').textContent=''; return; }
          var by={}; for(var i=0;i<T.length;i++){ var yy=+T[i].slice(0,4), md=T[i].slice(5); if(md>mmdd) continue; var B=by[yy]||(by[yy]={p:0,s:0,wet:0,hi:null,lo:null,d90:0,d0:0,n:0});
            if(typeof PP[i]==='number'){ B.p+=PP[i]; if(PP[i]>=0.01) B.wet++; } if(typeof SS[i]==='number') B.s+=SS[i];
            if(typeof MX[i]==='number'){ B.hi=B.hi==null?MX[i]:Math.max(B.hi,MX[i]); if(MX[i]>=90) B.d90++; } if(typeof MN[i]==='number'){ B.lo=B.lo==null?MN[i]:Math.min(B.lo,MN[i]); if(MN[i]<=0) B.d0++; } B.n++; }
          var C=by[thisYear]; if(!C){ $('w-p').textContent='—'; $('w-p-d').textContent='Berne reanalysis · no '+thisYear+' data yet'; return; }
          var pa=0, sa=0, k=0; Object.keys(by).forEach(function(yy){ yy=+yy; if(yy<thisYear && by[yy].n>=doy-3){ pa+=by[yy].p; sa+=by[yy].s; k++; } }); if(k){ pa/=k; sa/=k; }
          var diff=C.p-pa;
          $('w-p').textContent=C.p.toFixed(2)+' in'; $('w-p-d').textContent='Berne reanalysis · '+C.wet+' days with rain or snow · '+(Math.abs(diff)<0.05?'right on':(Math.abs(diff).toFixed(2)+' in '+(diff>0?'above':'below')))+' the '+k+'-year average for this date ('+pa.toFixed(2)+' in)';
          $('w-s').textContent=C.s.toFixed(1)+' in'; $('w-s-d').textContent='Berne reanalysis · average by this date '+sa.toFixed(1)+' in';
          $('w-x').innerHTML=(C.hi!=null?'↑ '+Math.round(C.hi)+'°<span class="c">↓ '+Math.round(C.lo)+'°</span>':'—');
          $('w-x-d').textContent='Berne reanalysis · '+C.d90+' days of 90°F or hotter · '+C.d0+' nights of 0°F or colder';
          var stn=$('st-note'); if(stn) stn.textContent='ERA5 reanalysis for the Berne grid cell via Open-Meteo, 1940 to yesterday — a model reconstruction, not a thermometer.';
          return;
        }
        if(!SD){ P.textContent='—'; return; }
        var pn=null, snw=null, k2=0; Object.keys(SD.years).forEach(function(yy){ yy=+yy; var Y=SD.years[yy]; if(yy<thisYear && Y && Y.np>=360 && Y.p){ pn=(pn||0)+Y.p[doy-1]; snw=(snw||0)+Y.s[doy-1]; k2++; } });
        if(k2>=5){ pn/=k2; snw/=k2; } else { pn=snw=null; }
        var lbl=SD.name.split(' ·')[0];
        var stn2=$('st-note'); if(stn2) stn2.textContent=SD.name.replace(/ — elev\. approx\./,'')+', ~'+SD.elev.toLocaleString()+' ft, record '+SD.first+'–'+SD.last+' — NOAA GHCN-Daily via xmACIS2.';
        if(sy && sy.np){ var pv=sy.p[doy-1], sv=sy.s[doy-1];
          var diff2=(pn!=null)?(pv-pn):null;
          $('w-p').textContent=pv.toFixed(2)+' in'; $('w-p-d').textContent=lbl+' · '+sy.wet+' days with rain or snow'+(pn!=null?' · '+(Math.abs(diff2)<0.05?'right on':(Math.abs(diff2).toFixed(2)+' in '+(diff2>0?'above':'below')))+' the '+k2+'-year average for this date ('+pn.toFixed(2)+' in)':' · too few complete years for an average');
          $('w-s').textContent=sv.toFixed(1)+' in'; $('w-s-d').textContent=lbl+' · deepest snow on the ground '+sy.depth+' in'+(snw!=null?' · average by this date '+snw.toFixed(1)+' in':'');
          $('w-x').innerHTML=(sy.hi!=null?'↑ '+Math.round(sy.hi)+'°<span class="c">↓ '+Math.round(sy.lo)+'°</span>':'—');
          $('w-x-d').textContent=lbl+' · '+sy.d90+' days of 90°F or hotter · '+sy.d0+' nights of 0°F or colder';
        } else { ['w-p','w-s','w-x'].forEach(function(id){ $(id).textContent='—'; }); $('w-p-d').textContent=lbl+': no '+thisYear+' observations'+(SD.active?'':' (closed '+SD.last+')'); $('w-s-d').textContent=''; $('w-x-d').textContent=''; }
      })();
    })();
  }

  /* ---------- Phenology: one PAIR per fortnight — expected (microseasons) beside on-record (register) ---------- */
  function renderPhenology(){
    var EV = window.PHENOLOGY_HISTORY || [], EX = window.PHENOLOGY_EXPECTED || [], row=$('ph-row'); if(!row) return;
    var MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
    function dim(m){ return new Date(2001, m, 0).getDate(); }
    var esc=function(v){ return String(v||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    var wins=[]; for(var m=1;m<=12;m++){ wins.push({m:m,lo:1,hi:15}); wins.push({m:m,lo:16,hi:31}); }
    var now=new Date(), curIdx=(now.getMonth())*2+(now.getDate()<=15?0:1);
    var TAG={ghost:'Ghost',health:'Nature health watch',garden:'Garden & orchard',foodways:'Foodways'};
    row.innerHTML = wins.map(function(w,idx){
      var label = MON[w.m-1]+' '+w.lo+'–'+(w.hi===15?15:dim(w.m));
      var ex = EX[idx];
      var exCard = '<article class="ph-card'+(idx===curIdx?' cur':'')+'"><div class="ph-head"><div><p class="ph-sub">Predicted</p><div class="ph-win">'+(ex?esc(ex.name):label)+'</div></div><div class="ph-count">'+label+'</div></div>'
        + (ex ? ex.sections.map(function(sec){ var k=({'Ghost':'ghost','Health Watch':'health','Nature Health Watch':'health','Garden':'garden','Garden & Orchard':'garden','Foodways':'foodways'})[sec.cat]||'plain'; return '<div class="ph-sec"><div class="ph-sech">'+esc(sec.cat)+'</div><ul class="ph-list">'+sec.items.map(function(h){ return '<li><div class="ph-kind '+k+'">'+h+'</div></li>'; }).join('')+'</ul></div>'; }).join('') : '<p class="ph-empty">No microseason text for this window.</p>')+'</article>';
      var items = EV.filter(function(e){ return e.m===w.m && e.d>=w.lo && e.d<=w.hi; }).sort(function(a,b){ return (a.y-b.y)||(a.d-b.d); });
      var hist = '<article class="ph-card'+(idx===curIdx?' cur':'')+'"><div class="ph-head"><div><p class="ph-sub">On record</p><div class="ph-win">'+label+'</div></div><div class="ph-count">'+items.length+' event'+(items.length===1?'':'s')+'</div></div>'
        + (items.length ? '<ol class="ph-list">'+items.map(function(e){
            var when = e.prec==='day' ? MON[e.m-1].slice(0,3)+' '+e.d : (e.prec==='days' ? MON[e.m-1].slice(0,3)+' '+e.d+' onset' : (e.prec||''));
            return '<li><span class="ph-y">'+e.y+'</span><div><div class="ph-name">'+esc(e.t)+'</div><div class="ph-meta">'+esc(e.cat)+(when?' · '+esc(when):'')+(e.area?' · '+esc(e.area):'')+'</div>'
              + (e.meas?'<div class="ph-meta"><b>Measured:</b> '+esc(e.meas)+(e.station?' — '+esc(e.station):'')+'</div>':'')
              + (e.impact?'<div class="ph-meta">'+esc(e.impact.length>200?e.impact.slice(0,197)+'…':e.impact)+'</div>':'')
              + '<div class="ph-src">'+(e.url?'<a href="'+esc(e.url)+'" target="_blank" rel="noopener">'+esc(e.source||'source')+'</a>':esc(e.source))+'</div></div></li>'; /* 2026-09-27 (v898, Laurie): confidence note removed from display */
          }).join('')+'</ol>' : '<p class="ph-empty">Nothing on record for this fortnight yet.</p>')+'</article>';
      return '<div class="ph-pair" id="ph-win-'+idx+'">'+hist+exCard+'</div>';
    }).join('');
    var ys=EV.map(function(e){ return e.y; });
    if($('ph-note')) $('ph-note').textContent = EX.length+' microseasons in '+(EX.length?EX.reduce(function(n,x){ return n+x.sections.reduce(function(m,s){ return m+s.items.length; },0); },0):0)+' entries · '+EV.length+' events on the register, '+Math.min.apply(null,ys)+'–'+Math.max.apply(null,ys)+' · multi-day and seasonal events sit at their anchor date · hill dates, not valley dates.';
    function setTitle(idx){ var w=wins[idx]; $('ph-title').textContent=(idx===curIdx?'Now: ':'')+MON[w.m-1]+' '+w.lo+'–'+(w.hi===15?15:dim(w.m)); } /* 2026-09-27 (v898, Laurie): season name dropped from the title per Laurie */
    function go(idx){ var el=$('ph-win-'+idx); if(el) row.scrollTo({left: el.offsetLeft - row.offsetLeft, behavior:'smooth'}); setTitle(idx); }
    var cur=curIdx; setTitle(cur);
    $('ph-prev').onclick=function(){ cur=(cur+23)%24; go(cur); };
    $('ph-next').onclick=function(){ cur=(cur+1)%24; go(cur); };
    setTimeout(function(){ var el=$('ph-win-'+curIdx); if(el) row.scrollLeft = el.offsetLeft - row.offsetLeft; }, 0);
  }

  /* ---------- iNaturalist: research-grade observations in the Hilltowns box, newest observed first ---------- */
  var INAT_DIST_KM = 40;   /* v927 shrank this to 25 km to match the birds; v939 (2026-09-27, Laurie): widened to 40 km so the box reaches the Hudson at Albany (~31 km E) and the northern Catskills at Windham (~35 km S) - affordable now that v938 pulls per taxonomic group. Half-width of a square box, not a radius. */
  var INAT_BOX = (function(){ var dLat=INAT_DIST_KM/111, dLng=INAT_DIST_KM/(111*Math.cos(LAT*Math.PI/180));
    return {nelat:LAT+dLat, nelng:LNG+dLng, swlat:LAT-dLat, swlng:LNG-dLng}; })();
  /* 2026-09-27 (v898, Laurie): two independent queries so the layout is always consistent — 24 with a
     displayable (openly licensed) photo, then 12 more recent ones without, below. */
  var INAT_CC = 'cc0,cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa,cc-by-nd,cc-by-nc-nd';
  /* 2026-09-27 (v906, Laurie): shared date/time formatting for both the iNat and eBird sections — "7:12am,
     Sept 22" instead of a raw "2026-09-22 07:12", read straight off the digits in the source
     string so it is never reinterpreted through the browser's own timezone. Also strips a
     trailing "(lat, lng)" that eBird bakes into some auto-generated location names, since
     coordinates were dropped from these cards on purpose. */
  var MON3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
  function fmtWhen(s){
    if(!s) return '';
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))/);
    if(m){ var day=+m[3], mon=MON3[+m[2]-1], hh=+m[4], mm=m[5], ap=hh>=12?'pm':'am', h12=hh%12; if(h12===0) h12=12;
      return h12+':'+mm+ap+', '+mon+' '+day; }
    var m2 = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m2) return MON3[+m2[2]-1]+' '+(+m2[3]);
    return String(s);
  }
  function stripCoords(s){ return String(s||'').replace(/\s*\([\-\d.]+,\s*[\-\d.]+\)\s*$/,''); }
  /* 2026-09-27 (v920, Laurie): live USGS water levels via the classic Water Services instantaneous-values API
     (waterservices.usgs.gov) — no key needed, CORS-open, same "just fetch it from the browser"
     pattern as Open-Meteo/eBird/iNaturalist elsewhere on this page. One request, a bounding box
     around Berne, several parameter codes at once; USGS returns whatever each site actually has. */
  var WATER_BBOX_KM = 50;
  function waterBBox(){
    var dLat = WATER_BBOX_KM/111, dLng = WATER_BBOX_KM/(111*Math.cos(LAT*Math.PI/180));
    return (LNG-dLng).toFixed(4)+','+(LAT-dLat).toFixed(4)+','+(LNG+dLng).toFixed(4)+','+(LAT+dLat).toFixed(4);
  }
  function haversineKm(lat1,lng1,lat2,lng2){
    var R=6371, toRad=function(d){ return d*Math.PI/180; };
    var dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
    var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  /* v929 (2026-09-27, Laurie): each parameter now also knows (a) how to print itself short for the
     stats line, (b) how big a change counts as "moving" rather than "steady" (rel = fraction of the
     earlier reading, abs = feet), and (c) whether a bigger number means LESS water (invert: depth to
     water in a well grows as the water table falls, so its arrow is flipped). */
  var WATER_PARAMS = {
    '00060':{kind:'stream', label:'Streamflow',              fmt:function(v){ return Number(v).toLocaleString()+' ft\u00b3/s'; }, rel:0.03},
    '00065':{kind:'stream', label:'Gage height',             fmt:function(v){ return Number(v).toFixed(2)+' ft'; }, abs:0.05},
    '62615':{kind:'lake',   label:'Water surface elevation', fmt:function(v){ return Number(v).toFixed(2)+' ft'; }, abs:0.03},
    '00054':{kind:'lake',   label:'Reservoir storage',       fmt:function(v){ return Number(v).toLocaleString()+' acre-ft'; }, rel:0.005},
    '72019':{kind:'well',   label:'Depth to water',          fmt:function(v){ return Number(v).toFixed(2)+' ft below surface'; }, fmtS:function(v){ return Number(v).toFixed(2)+' ft'; }, abs:0.03, invert:true},
    '62611':{kind:'well',   label:'Groundwater level',       fmt:function(v){ return Number(v).toFixed(2)+' ft (NAVD88)'; }, fmtS:function(v){ return Number(v).toFixed(2)+' ft'; }, abs:0.03}
  };
  /* v940 (2026-09-27, Laurie): tidal-Hudson parameters. 62620 = estuary water-surface elevation (NAVD88); 72137 =
     discharge, tidally filtered (net seaward flow with the tide removed - the only honest "how much water is
     leaving" number on the estuary); 72254 = current speed at the sensor; 00010 = water temperature. These are
     requested only for the curated STREAM_SITES, never in the bounding-box sweep. */
  WATER_PARAMS['62620']={kind:'stream', label:'Water surface (NAVD88)',     fmt:function(v){ return Number(v).toFixed(2)+' ft'; }, abs:0.05, tidal:true};
  WATER_PARAMS['72137']={kind:'stream', label:'Net flow, tidally filtered', fmt:function(v){ return Number(v).toLocaleString()+' ft\u00b3/s'; }, rel:0.03};
  WATER_PARAMS['72254']={kind:'stream', label:'Current speed',              fmt:function(v){ return Number(v).toFixed(2)+' ft/s'; }, abs:0.1, tidal:true, nobar:true};
  WATER_PARAMS['00010']={kind:'stream', label:'Water temp',                 fmt:function(v){ return (Number(v)*9/5+32).toFixed(1)+'\u00b0F'; }, fmtS:function(v){ return (Number(v)*9/5+32).toFixed(0)+'\u00b0F'; }, abs:0.3};
  var WATER_ORDER = ['00060','72137','00065','62620','62615','00054','72019','62611','72254','00010'];   /* which reading leads a site's card when it reports several */
  var WATER_SHORT = {'00060':'flow','72137':'net flow','00065':'height','62620':'level','62615':'level','00054':'storage','72019':'depth','62611':'level','72254':'speed','00010':'temp'};   /* v936: caption under each range bar */
  var CURATED_CODES = ['00060','00065','62615','00054','62620','72137','72254','00010','72019','62611'];   /* v946: + reservoir codes; v948: + groundwater codes for the pinned wells */
  /* v948 (2026-09-28, Laurie): wells asked for by link - always shown, ahead of the nearest-N sweep.
     421821074012701 = G-390 near Cairo (Greene Co., 408 ft deep, land surface 491 ft NAVD88); 421746074180201 = near Windham/Ashland. */
  var WELL_SITES = ['421821074012701','421746074180201'];
  /* v940 (2026-09-27, Laurie): the stream row is a curated transect, not a nearest-N sweep - Schoharie Creek from
     Prattsville down to the Mohawk, the Mohawk at Cohoes, the Hudson at Green Island, the Normans Kill, the
     tidal Hudson at the Port of Albany, the Esopus at Mount Marion (the big Catskill drainage, entering at
     Saugerties) and the Hudson below Poughkeepsie. Ordered at render by USGS downstream-order site number.
     Catskill Creek has no active gauge (Oak Hill 01361500 is dead). */
  /* v943 (2026-09-27, Laurie): eyebrow shows how each gauge connects - the drainage path down to the Hudson - plus
     the gauge datum elevation from the site file, so the row reads as a descent. */
  var WATER_CHAIN = {
    '01347000':'Mohawk \u00b7 above the Schoharie', '01349705':'Schoharie headwaters \u2192 Mohawk \u2192 Hudson', '01349950':'Batavia Kill \u2192 Schoharie',
    '01350212':'Schoharie \u00b7 below Blenheim-Gilboa pumped storage', '01351298':'Cobleskill Creek \u2192 Schoharie', '01354500':'Mohawk (+ Schoharie) \u2192 Hudson',
    '01359528':'Normans Kill \u2192 Hudson \u00b7 near the mouth', '0136219503':'Esopus headwaters \u00b7 above the tunnel', '0136230002':'Woodland Creek \u2192 Esopus',
    '01350000':'Schoharie \u2192 Mohawk \u2192 Hudson', '01350100':'Schoharie Reservoir \u00b7 Gilboa Dam', '01350101':'Schoharie \u2192 Mohawk \u2192 Hudson', '01350355':'Schoharie \u2192 Mohawk \u2192 Hudson',
    '01350480':'Little Schoharie \u2192 Schoharie', '01350500':'Schoharie \u2192 Mohawk \u2192 Hudson', '01350750':'Schoharie \u2192 Mohawk \u2192 Hudson',
    '01351200':'Fox Creek \u2192 Schoharie', '01351450':'Schoharie \u2192 Mohawk \u2192 Hudson', '01351500':'Schoharie \u2192 Mohawk \u2192 Hudson',
    '01357500':'Mohawk \u2192 Hudson', '01358000':'Hudson \u00b7 head of tide', '01359165':'Hudson \u00b7 tidal',
    '01359525':'Normans Kill \u2192 Hudson', '01362230':'Schoharie Reservoir \u2192 Shandaken Tunnel \u2192 Esopus', '01364500':'Esopus (+ Schoharie via tunnel) \u2192 Hudson', '01372058':'Hudson estuary'
  };
  /* v946 (2026-09-28, Laurie): + 01350100 Schoharie Reservoir (the impoundment between Prattsville and Gilboa Dam;
     a lake-kind site that now lives in the numbered chain rather than the lakes row) and 01362230 'Diversion from
     Schoharie Reservoir' = the Shandaken Tunnel outlet at Allaben - the water the reservoir sends OUT of the
     Schoharie basin to the Esopus and New York City (~170 ft\u00b3/s tonight). Its number sorts just before Esopus at
     Mount Marion, which is right: that gauge sees Schoharie water too. */
  /* v947 (2026-09-28, Laurie's list): + Schoharie near Lexington 01349705 (headwater), Batavia Kill at Red Falls 01349950
     (enters at Prattsville), Schoharie near North Blenheim 01350212 (below the Blenheim-Gilboa pumped-storage plant),
     Cobleskill Creek at Cobleskill 01351298 (enters at Central Bridge), Mohawk near Little Falls 01347000 (the Mohawk
     BEFORE the Schoharie joins), Mohawk at Freeman's Bridge 01354500 (after), Normans Kill at Albany 01359528 (near
     the mouth), Esopus at Big Indian 0136219503 (Esopus BEFORE the tunnel water), Woodland Creek above mouth at
     Phoenicia 0136230002 (per Laurie). Not added, with reasons in the README: Delaware-basin gauges (Tremper Kill,
     West Branch Delaware, Little Delaware - drain to Delaware Bay), Indian River (Adirondack), Otsquago Creek and
     Patroon Creek (unrelated), the small Schoharie tributaries (West Kill, East Kill, Bear Kill, Manor Kill, Platter
     Kill, Mine Kill), Beaver Kill at Mt Tremper, Schoharie AT North Blenheim (duplicate of NEAR). Optional if wanted:
     Hudson at Fort Edward 01327750 (upper Hudson before the Mohawk), Kinderhook at Rossman 01361000 (east bank). */
  var STREAM_SITES = ['01347000','01349705','01349950','01350000','01350100','01350101','01350212','01350355','01350480','01350500','01350750','01351200','01351298','01351450','01351500','01354500','01357500','01358000','01359165','01359525','01359528','0136219503','01362230','0136230002','01364500','01372058'];
  var WATER_ICON = {
    stream:'<svg viewBox="0 0 24 24"><path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
    lake:'<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    well:'<svg viewBox="0 0 24 24"><path d="M12 2v13M7 11l5 5 5-5M5 20h14"/></svg>'
  };
  /* v949 (2026-09-28, Laurie): the transect is shown as river CHAINS, each numbered from 1 in downstream order and
     each with its own colour, identical on the map pin and the card badge. Palette = the six validated categorical
     slots (light-map / dark-page variants), fixed order, dark text on every badge. */
  var CHAINS = [
    {key:'schoharie', name:'Schoharie Creek \u2192 Mohawk', light:'#2a78d6', dark:'#3987e5', sites:['01349705','01349950','01350000','01350100','01350101','01350212','01350355','01350480','01350500','01350750','01351200','01351298','01351450','01351500']},
    {key:'mohawk',    name:'Mohawk River \u2192 Hudson',    light:'#eb6834', dark:'#d95926', sites:['01347000','01354500','01357500']},
    {key:'hudson',    name:'Hudson River \u00b7 head of tide to estuary', light:'#1baf7a', dark:'#199e70', sites:['01358000','01359165','01359525','01359528','01372058']},
    {key:'esopus',    name:'Esopus Creek \u2192 Hudson (Catskills)', light:'#eda100', dark:'#c98500', sites:['0136219503','01362230','0136230002','01364500']}
  ];
  var CHAIN_OF={}; CHAINS.forEach(function(c){ c.sites.forEach(function(sn){ CHAIN_OF[sn]=c; }); });
  var KIND_COLOR = {lake:{light:'#e87ba4', dark:'#d55181'}, well:{light:'#008300', dark:'#008300'}};
  var colorOf=function(d, mode){ var c=CHAIN_OF[d.siteNo]; if(c) return c[mode]; var k=KIND_COLOR[d.kind]; return k?k[mode]:'#6b6f7a'; };
  var WATER_COLOR = {stream:'#3f8fd0', lake:'#1f9d91', well:'#b8901c'};   /* legacy; colorOf() is what renders now */
  var WATER_LABEL = {stream:'Stream', lake:'Lake / reservoir', well:'Groundwater well'};
  var WATER_CAP = {stream:99, lake:3, well:5};   /* v948: pinned wells count toward the cap; 5 so the three nearest still appear alongside Laurie's two */   /* v934: named waters count toward the cap; streams get two rows' worth so the Schoharie-side creeks survive */
  var TREND_TXT = {up:'\u2191 rising', down:'\u2193 falling', flat:'\u2192 steady'};
  /* The specific local waters Laurie asked about by name, matched against each site's own USGS name
     rather than hardcoded site numbers. v929: any of them with no live USGS gauge is now simply
     left out instead of shown as a "no gauge found" placeholder. */
  var NAMED_WATERS = [
    {key:'catskill', re:/catskill creek/i, label:'Catskill Creek'},
    {key:'basicres', re:/basic creek reservoir/i, label:'Basic Creek Reservoir'},
    {key:'basic',    re:/basic creek(?! reservoir)/i, label:'Basic Creek'},
    {key:'normans',  re:/normans? ?kill/i, label:'Normans Kill'},
    {key:'alcove',   re:/alcove reservoir/i, label:'Alcove Reservoir'},
    {key:'hudson',   re:/hudson river/i, label:'Hudson River'}
  ];
  /* USGS names wells with no descriptive name like "Local number, So-528, Westerlo NY" - strip the ID. */
  function cleanSiteName(raw, kind){
    var n = String(raw||'').trim();
    var m = n.match(/^local number,\s*[a-z0-9\-]+,?\s*(.*)$/i);
    if(m){ return m[1] ? m[1].replace(/\s*NY$/i,'').trim() || (WATER_LABEL[kind]||'Well') : (WATER_LABEL[kind]||'Well'); }
    return n;
  }
  function trendOf(code, series){
    var meta=WATER_PARAMS[code]; if(!meta || !series || series.length<2) return null;
    var last=series[series.length-1], lookMs=(meta.kind==='stream'?3:24)*3600000, target=last.t-lookMs, prev=series[0];
    for(var i=series.length-1;i>=0;i--){ if(series[i].t<=target){ prev=series[i]; break; } }
    var span=last.t-prev.t; if(span < lookMs*0.5) return null;   /* not enough history yet to say anything honest */
    var d=last.v-prev.v, thr=(meta.abs!=null)?meta.abs:Math.abs(prev.v)*meta.rel;
    var dir=Math.abs(d)<=thr?'flat':(d>0?'up':'down');
    if(meta.invert && dir!=='flat') dir=(dir==='up')?'down':'up';
    return {dir:dir, hours:Math.max(1,Math.round(span/3600000))};
  }
  function waterToday(){ var s=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()), p=s.split('-'); return {key:s, m:+p[1], d:+p[2]}; }
  /* v936 (2026-09-27, Laurie): statistics are now kept per reading (d.stats[code]) so a stream that reports
     both flow and stage can show a bar for each. statLine(d, rd) prints one reading's line. */
  function statLine(d, rd){
    var s=d.stats && d.stats[rd.code]; if(!s) return '';
    var meta=WATER_PARAMS[rd.code], f=meta.fmtS||meta.fmt;
    var hi=meta.invert?s.min:s.max, hiYr=meta.invert?s.minYr:s.maxYr, lo=meta.invert?s.max:s.min, loYr=meta.invert?s.maxYr:s.minYr;
    var bits=[];
    if(meta.invert){   /* wells: depth to water. The record HIGH water level is the SHALLOWEST depth, so say it in those terms */
      if(s.mean!=null) bits.push('avg depth '+f(s.mean));
      if(hi!=null) bits.push('highest water '+f(hi)+' down'+(hiYr?' ('+hiYr+')':''));
      if(lo!=null) bits.push('lowest '+f(lo)+' down'+(loYr?' ('+loYr+')':''));
    } else {
      if(s.mean!=null) bits.push('avg '+f(s.mean));
      if(hi!=null) bits.push('high '+f(hi)+(hiYr?' ('+hiYr+')':''));
      if(lo!=null) bits.push('low '+f(lo)+(loYr?' ('+loYr+')':''));
    }
    if(!bits.length) return '';
    var lead = d.readings.length>1 ? (WATER_SHORT[rd.code]||meta.label).replace(/^./,function(c){ return c.toUpperCase(); })+', this date' : 'This date';
    return lead+(s.begin?' since '+s.begin:'')+': '+bits.join(' · ');
  }
  /* Daily statistics for "today's" calendar date, via the USGS stat service (RDB text, CORS-open).
     Cached per calendar day in localStorage so it's fetched at most once a day per site+parameter. */
  function fetchWaterStats(sites){
    /* v945 (2026-09-28, Laurie: "the old gages still aren't showing"): since v936 this was ONE request for every
       gauge and every parameter at once - 20-odd sites x 366 daily rows x several parameters, megabytes - and
       the USGS statistics service has been timing out on requests that size, silently. v935's request was a
       fraction of it, which is why the bars used to appear. Now: one small request per gauge, four in flight at
       a time, a 20 s timeout each, the card redrawn as soon as its own numbers land, and a visible note under
       the cards when statistics are unavailable instead of nothing. Positives persist per day (v3 key);
       "asked, nothing there" is remembered only for this page load. */
    var today=waterToday(), ck='hfa.wstat.v3.'+today.key, cache=lsGet(ck)||{};
    try{ Object.keys(localStorage).forEach(function(k){ if(/^hfa\.wstat\.v[12]\./.test(k) || (k.indexOf('hfa.wstat.v3.')===0 && k!==ck)) localStorage.removeItem(k); }); }catch(e){}
    var miss=fetchWaterStats._miss || (fetchWaterStats._miss={});
    var pairs=[]; sites.forEach(function(d){ d.stats=d.stats||{}; d.readings.forEach(function(r){ pairs.push({d:d, code:r.code, key:d.siteNo+'|'+r.code}); }); });
    var apply=function(){ pairs.forEach(function(p){ p.d.stats[p.code]=cache[p.key]||null; }); };
    apply();
    var need=pairs.filter(function(p){ return cache[p.key]===undefined && !miss[p.key]; });
    if(!need.length){ waterStatNote(sites); return Promise.resolve(); }
    var bySite={}; need.forEach(function(p){ (bySite[p.d.siteNo]=bySite[p.d.siteNo]||{d:p.d, codes:{}, pairs:[]}); bySite[p.d.siteNo].codes[p.code]=1; bySite[p.d.siteNo].pairs.push(p); });
    var jobs=Object.keys(bySite).map(function(k){ return bySite[k]; });
    var num=function(v){ var x=parseFloat(v); return isNaN(x)?null:x; };
    var failed=0;
    var one=function(job){
      var url='https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites='+job.d.siteNo+'&statReportType=daily&statTypeCd=mean,max,min&parameterCd='+Object.keys(job.codes).join(',');
      var ctl=(typeof AbortController!=='undefined')?new AbortController():null, tm=ctl?setTimeout(function(){ ctl.abort(); },20000):null;
      return fetch(url, ctl?{signal:ctl.signal}:{}).then(function(r){
        if(r.status===404) return '';
        if(!r.ok) throw new Error('HTTP '+r.status);
        return r.text();
      }).then(function(txt){
        var header=null, idx={}, skipFmt=false, rows=0;
        String(txt).split('\n').forEach(function(line){
          if(!line || line.charAt(0)==='#') return;
          var c=line.replace(/\r$/,'').split('\t');
          if(!header){ header=c; c.forEach(function(h,i){ idx[h.trim()]=i; }); skipFmt=true; return; }
          if(skipFmt){ skipFmt=false; return; }
          if(+c[idx.month_nu]!==today.m || +c[idx.day_nu]!==today.d) return;
          var key=c[idx.site_no]+'|'+c[idx.parameter_cd];
          if(cache[key]) return;
          rows++;
          cache[key]={mean:num(c[idx.mean_va]), max:num(c[idx.max_va]), maxYr:c[idx.max_va_yr]||'', min:num(c[idx.min_va]), minYr:c[idx.min_va_yr]||'', begin:c[idx.begin_yr]||'', end:c[idx.end_yr]||''};
        });
        job.pairs.forEach(function(p){ if(cache[p.key]===undefined) miss[p.key]=true; });   /* a real answer with no row for this pair - remembered for this page load only */
        if(rows>0) lsSet(ck, cache);
        job.pairs.forEach(function(p){ p.d.stats[p.code]=cache[p.key]||null; });
        renderWaterCard(job.d);                       /* redraw just this card as its numbers land */
      }).catch(function(e){ failed++; }).then(function(){ if(tm) clearTimeout(tm); })
      .then(function(){ return fetchRange30(job.d); });   /* v951: readings with no long-term statistics get a 30-day range instead */
    };
    var i=0, workers=[];
    var next=function(){ if(i>=jobs.length) return Promise.resolve(); var j=jobs[i++]; return one(j).then(next); };
    for(var w=0; w<4 && w<jobs.length; w++) workers.push(next());
    return Promise.all(workers).then(function(){ waterStatNote(sites, failed, jobs.length); });
  }
  /* v951 (2026-09-28, Laurie: "bars for both flow and height"): USGS publishes long-term daily statistics for flow at
     nearly every gauge but for stage at only some, so a height bar was often impossible. For any reading whose
     this-date statistics came back empty, fetch that gauge's own last 30 days (one small iv request per gauge) and
     draw a range bar from it: low, high, median - captioned "· 30 d" so it is never mistaken for a record range.
     Cached per gauge per calendar day. */
  function fetchRange30(d){
    var codes=d.readings.filter(function(r){ return !(d.stats&&d.stats[r.code]) && !WATER_PARAMS[r.code].nobar; }).map(function(r){ return r.code; });
    if(!codes.length) return Promise.resolve();
    var today=waterToday(), ck='hfa.w30.v1.'+today.key, cache=lsGet(ck)||{};
    try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf('hfa.w30.v1.')===0 && k!==ck) localStorage.removeItem(k); }); }catch(e){}
    d.range30=d.range30||{};
    var need=codes.filter(function(c){ return cache[d.siteNo+'|'+c]===undefined; });
    codes.forEach(function(c){ if(cache[d.siteNo+'|'+c]) d.range30[c]=cache[d.siteNo+'|'+c]; });
    if(!need.length){ renderWaterCard(d); return Promise.resolve(); }
    var url='https://waterservices.usgs.gov/nwis/iv/?format=json&sites='+d.siteNo+'&parameterCd='+need.join(',')+'&period=P30D&siteStatus=all';
    var ctl=(typeof AbortController!=='undefined')?new AbortController():null, tm=ctl?setTimeout(function(){ ctl.abort(); },20000):null;
    return fetch(url, ctl?{signal:ctl.signal}:{}).then(function(r){ return r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)); }).then(function(j){
      var ts=(j&&j.value&&j.value.timeSeries)||[], got={};
      ts.forEach(function(t){
        var code=(t.variable&&t.variable.variableCode&&t.variable.variableCode[0]&&t.variable.variableCode[0].value)||''; if(need.indexOf(code)<0 || got[code]) return;
        var vals=((t.values&&t.values[0]&&t.values[0].value)||[]).map(function(v){ return parseFloat(v.value); }).filter(function(x){ return isFinite(x) && x>-999990; });
        if(vals.length<24) return;
        vals.sort(function(a,b){ return a-b; });
        got[code]={min:vals[0], max:vals[vals.length-1], med:vals[Math.floor(vals.length/2)], n:vals.length};
      });
      need.forEach(function(c){ cache[d.siteNo+'|'+c]=got[c]||null; if(got[c]) d.range30[c]=got[c]; });
      lsSet(ck, cache); renderWaterCard(d);
    }).catch(function(){}).then(function(){ if(tm) clearTimeout(tm); });
  }
  /* v945: a plain sentence under the cards about the statistics - present, partly missing, or unavailable. */
  function waterStatNote(sites, failed, asked){
    var el=$('water-stat-note'); if(!el) return;
    var have=0, total=0; sites.forEach(function(d){ d.readings.forEach(function(r){ total++; if(d.stats && d.stats[r.code]) have++; }); });
    if(failed && failed>=asked && !have) el.textContent='Historical statistics (this-date average, record high and low) are not answering from USGS right now; the bars will fill in on the next refresh.';
    else if(failed) el.textContent='Historical statistics for '+failed+' of '+asked+' gauges did not answer from USGS; those bars will fill in on the next refresh.';
    else if(!have) el.textContent='';
    else el.textContent='';
  }
  /* v945: redraw a single water card in place (keyed by site number) so statistics can arrive gauge by gauge. */
  function renderWaterCard(d){
    var host=$('water-cards'); if(!host) return;
    var old=host.querySelector('.wcard[data-site="'+d.siteNo+'"]'); if(!old) return;
    var tmp=document.createElement('div'); tmp.innerHTML=waterCardHtml(d); var nw=tmp.firstChild; if(nw) old.parentNode.replaceChild(nw, old);
    var mk=_waterMarkers.find(function(m){ return m._siteNo===d.siteNo; }); if(mk && mk.getPopup()) mk.getPopup().setHTML(popupHtml(d));
  }
  /* v936 (2026-09-27, Laurie): land-surface altitude per site from the USGS site file (alt_va, feet), so
     wells can be ordered highest ground to lowest. Altitudes don't change, so the cache never expires. */
  function fetchSiteAlts(sites){
    var ck='hfa.walt.v1', cache=lsGet(ck)||{};
    var apply=function(){ sites.forEach(function(d){ d.alt=(cache[d.siteNo]!=null)?cache[d.siteNo]:null; }); };
    var need=sites.filter(function(d){ return cache[d.siteNo]===undefined; });
    if(!need.length){ apply(); return Promise.resolve(); }
    var url='https://waterservices.usgs.gov/nwis/site/?format=rdb&sites='+need.map(function(d){ return d.siteNo; }).join(',')+'&siteOutput=expanded&siteStatus=all';
    return fetch(url).then(function(r){ return r.ok?r.text():Promise.reject(new Error('HTTP '+r.status)); }).then(function(txt){
      var header=null, idx={}, skipFmt=false;
      String(txt).split('\n').forEach(function(line){
        if(!line || line.charAt(0)==='#') return;
        var c=line.replace(/\r$/,'').split('\t');
        if(!header){ header=c; c.forEach(function(h,i){ idx[h.trim()]=i; }); skipFmt=true; return; }
        if(skipFmt){ skipFmt=false; return; }
        var sn=c[idx.site_no], a=parseFloat(c[idx.alt_va]); if(sn && isFinite(a)) cache[sn]=a;
      });
      need.forEach(function(d){ if(cache[d.siteNo]===undefined) cache[d.siteNo]=null; });
      lsSet(ck, cache); apply();
    }).catch(function(){ apply(); });
  }
  /* v936 (2026-09-27, Laurie): left-to-right is downhill on every row.
     Streams: USGS numbers stream sites in downstream order within a basin (tributaries as they enter, the
       main stem increasing toward the mouth), so ascending site number = upstream to downstream. Here that
       runs Schoharie headwaters -> Schoharie at Schoharie -> Hudson at Green Island -> Normans Kill.
     Lakes/reservoirs: by their own water-surface elevation, highest first (site altitude if a gauge only
       reports storage).
     Wells: by land-surface altitude, highest first; nearest-first if the site file didn't answer. */
  function orderWater(byKind){
    /* v947: USGS inserts extra digits BETWEEN neighbours (0136230002 sits between 01362300 and 01362301), so the number is a
       decimal fraction, not an integer - compare right-padded strings. 15-digit lat-long ids (wells) never reach this sort. */
    var dkey=function(n){ return (n+'000000000000000').slice(0,15); };
    byKind.stream.sort(function(a,b){ var A=dkey(a.siteNo), B=dkey(b.siteNo); return A<B?-1:A>B?1:0; });
    var elev=function(d){ var r=d.readings.find(function(x){ return x.code==='62615'; }); return r?r.value:(d.alt!=null?d.alt:-Infinity); };
    byKind.lake.sort(function(a,b){ return elev(b)-elev(a) || a.km-b.km; });
    byKind.well.sort(function(a,b){ var A=a.alt!=null?a.alt:-Infinity, B=b.alt!=null?b.alt:-Infinity; return (B-A) || (a.km-b.km); });
  }
  var _waterMap=null, _waterMarkers=[], _wm=null, _waterBounds=null;
  function ensureWaterMap(){
    if(_waterMap || typeof maplibregl==='undefined' || !$('water-map')) return _waterMap;
    _waterMap = new maplibregl.Map({
      container:'water-map',
      style:{version:8, sources:{'topo':{type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize:256, attribution:'Esri'}}, layers:[{id:'topo', type:'raster', source:'topo'}]},
      center:[LNG,LAT], zoom:8.3, attributionControl:true
    });
    /* 2026-09-27 (v930, Laurie): locked \u2014 everything is already in frame (the map fits itself to the gauges shown), so zoom
       buttons and drag/scroll/pinch handling were only confusing. Handlers are switched off one by one
       rather than using interactive:false, so the pins still receive clicks and open their popups. */
    ['scrollZoom','boxZoom','dragRotate','dragPan','keyboard','doubleClickZoom','touchZoomRotate','touchPitch'].forEach(function(h){ if(_waterMap[h] && _waterMap[h].disable) _waterMap[h].disable(); });
    return _waterMap;
  }
  var waterEsc=function(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var trendHtml=function(rd){ var tidal=WATER_PARAMS[rd.code]&&WATER_PARAMS[rd.code].tidal; return rd.trend ? ' <span class="wtrend" title="'+TREND_TXT[rd.trend.dir].slice(2)+' over the last '+rd.trend.hours+' h'+(tidal?' (tide-driven)':'')+'">'+TREND_TXT[rd.trend.dir].charAt(0)+'<span class="wtrend-lbl"> '+TREND_TXT[rd.trend.dir].slice(2)+(tidal?' (tide)':'')+'</span></span>' : ''; };
  var siteUrl=function(d){ return 'https://waterdata.usgs.gov/monitoring-location/USGS-'+encodeURIComponent(d.siteNo)+'/'; };
  function popupHtml(d){
    var sts=d.readings.map(function(r){ return statLine(d,r); }).filter(Boolean);
    if(d.dead) return '<div class="wpop"><b>'+(d.num?d.num+' · ':'')+waterEsc(d.displayName)+'</b><div class="wk">'+waterEsc(eyebrow(d))+'</div><div>No data \u2014 USGS: '+waterEsc(d.why)+'</div><div class="wl"><a href="'+siteUrl(d)+'" target="_blank" rel="noopener">USGS data for this site \u2197</a></div></div>';
    return '<div class="wpop"><b>'+(d.num?d.num+' · ':'')+waterEsc(d.displayName)+'</b><div class="wk">'+waterEsc(eyebrow(d))+(d.when?' · read '+waterEsc(fmtWhen(d.when)):'')+'</div>'
      +d.readings.map(function(r){ return '<div>'+waterEsc(r.label)+': <b>'+waterEsc(r.text)+'</b>'+trendHtml(r)+'</div>'; }).join('')
      +(sts.length?'<div class="ws">'+sts.map(waterEsc).join('<br>')+'</div>':'')
      +'<div class="wl"><a href="'+siteUrl(d)+'" target="_blank" rel="noopener">USGS data for this site ↗</a></div></div>';
  }
  function plotWaterMarkers(sites){
    var map=ensureWaterMap(); if(!map) return;
    _waterMarkers.forEach(function(m){ m.remove(); }); _waterMarkers=[];
    /* v934 (2026-09-27, Laurie: "the pins and popups are missing"): this used to wait for map.loaded()
       before drawing, else hang the draw on the 'load' event. But loaded() is false whenever any tile is
       still downloading — e.g. right after the first draw's fitBounds — so the second draw (when the
       historical statistics arrived a moment later) removed every marker, found loaded()===false, and
       queued itself on a 'load' event that had already fired and never fires again. Markers are plain DOM
       and camera moves don't need the style, so draw immediately, always. */
    var b=new maplibregl.LngLatBounds([LNG,LAT],[LNG,LAT]);
    sites.forEach(function(d){
      var el=document.createElement('div');
      el.className='wpin';
      el.style.background=d.dead?'#9a9ea8':colorOf(d,'light');
      el.innerHTML=(d.num?'<span class="wpin-num">'+d.num+'</span>':WATER_ICON[d.kind].replace('<svg viewBox="0 0 24 24">','<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#101010" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'));
      el.title=(d.num?d.num+' · ':'')+d.displayName;
      var mk=new maplibregl.Marker({element:el}).setLngLat([d.lng,d.lat]).setPopup(new maplibregl.Popup({offset:18, maxWidth:'260px'}).setHTML(popupHtml(d))).addTo(map);
      mk._siteNo=d.siteNo;
      _waterMarkers.push(mk); b.extend([d.lng,d.lat]);
    });
    if(sites.length){ _waterBounds=b; map.resize(); map.fitBounds(b,{padding:34, maxZoom:11, duration:0}); }
    if(!window._waterResizeBound){ window._waterResizeBound=true; window.addEventListener('resize', function(){ if(_waterMap && _waterBounds){ _waterMap.resize(); _waterMap.fitBounds(_waterBounds,{padding:34, maxZoom:11, duration:0}); } }); }
  }
  /* v934 (2026-09-27, Laurie): a small vertical range bar per reading that has statistics. Bottom = record low
     for THIS calendar date, top = record high, gold tick = average, gold mark = now. Discharge and storage are
     drawn on a log scale (the Hudson's 1,960-59,100 ft³/s record range would otherwise pin the average and
     today into the bottom sliver); stage, elevation and well depth are linear. Wells are inverted so up always
     means more water.
     v936 (Laurie): one bar per reading, so a stream with flow AND height gets two, each captioned ('flow',
     'height', 'level', 'depth'); end labels carry their units; the 'now' mark is a small solid gold dot when
     steady (or when there isn't enough history to say) and a gold caret pointing the way when rising or
     falling; 'avg' always prints, on the right of the tick, since the end labels moved above and below the
     track where nothing can collide with them; a reading beyond the record range sits just past the end. */
  function gaugeOne(d, rd){
    var meta=WATER_PARAMS[rd.code], s=d.stats && d.stats[rd.code], r30=null;
    if(meta.nobar || !isFinite(rd.value)) return '';
    if(!s || s.max==null || s.min==null){ r30=d.range30 && d.range30[rd.code]; if(!r30) return ''; s={min:r30.min, max:r30.max, mean:r30.med}; }
    /* v949 (Laurie): LINEAR always - she reads the bar as a ruler: Prattsville's 308 avg sits near the bottom of a 5.8-6,220
       range and today's 1,840 about a third of the way up. The log scale was mathematically defensible and visually a lie.
       Also v949: the average's VALUE prints beside its tick, the end labels are left-anchored so nothing collides, and the
       whole "this date since ..." sentence (with the record years) lives in the bar's tooltip instead of the card text. */
    var f=meta.fmtS||meta.fmt;
    var lo=s.min, hi=s.max; if(!(hi>lo)) return '';
    var span=hi-lo, top=meta.invert?s.min:s.max, bot=meta.invert?s.max:s.min;      /* wells: shallowest depth is the top */
    var W=84, X=16, Y0=28, Y1=80;                                                  /* track from y=28 (high) to y=80 (low) */
    var yOf=function(v){ var t=(v-lo)/span; if(meta.invert) t=1-t; return Y1-(Math.max(-0.08,Math.min(1.08,t)))*(Y1-Y0); };
    var yNow=yOf(rd.value), yAvg=(s.mean!=null)?yOf(s.mean):null;
    var dir=rd.trend?rd.trend.dir:'flat';
    var cap=(WATER_SHORT[rd.code]||meta.label)+(r30?' \u00b7 30 d':'');
    var title=r30 ? ('Last 30 days at this gauge: low '+f(r30.min)+' \u00b7 high '+f(r30.max)+' \u00b7 median '+f(r30.med)+' ('+r30.n+' readings). USGS publishes no long-term daily statistics for this reading here.')
                  : (statLine(d, rd) || (cap+': now vs this date’s record range'));
    if(meta.invert) title+=' (up = more water)';
    var svg='<svg viewBox="0 0 '+W+' 96" role="img" aria-label="'+waterEsc(title)+'"><title>'+waterEsc(title)+'</title>'
      +'<text class="wg-cap" x="2" y="8">'+waterEsc(cap)+'</text>'
      +'<text x="2" y="21">'+waterEsc(f(top))+'</text>'
      +'<line x1="'+X+'" y1="'+Y0+'" x2="'+X+'" y2="'+Y1+'" stroke="rgba(255,255,255,.28)" stroke-width="4" stroke-linecap="round"/>'
      +'<line x1="'+(X-6)+'" y1="'+Y0+'" x2="'+(X+6)+'" y2="'+Y0+'" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>'
      +'<line x1="'+(X-6)+'" y1="'+Y1+'" x2="'+(X+6)+'" y2="'+Y1+'" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>'
      +'<text x="2" y="93">'+waterEsc(f(bot))+'</text>';
    if(yAvg!=null){
      var ay=yAvg; if(Math.abs(ay-yNow)<7) ay = (yAvg<=yNow) ? yNow-7 : yNow+7;     /* keep the avg label clear of the now-mark */
      svg+='<line x1="'+(X-7)+'" y1="'+yAvg.toFixed(1)+'" x2="'+(X+7)+'" y2="'+yAvg.toFixed(1)+'" stroke="var(--gold,#c9a227)" stroke-width="2.5"/>'
         +'<text class="wg-avg" x="'+(X+10)+'" y="'+(ay+3).toFixed(1)+'">'+(r30?'med ':'avg ')+waterEsc(f(s.mean))+'</text>';
    }
    if(dir==='flat') svg+='<circle cx="'+X+'" cy="'+yNow.toFixed(1)+'" r="3.6" fill="var(--gold,#c9a227)"/>';
    else if(dir==='up') svg+='<path d="M'+(X-5)+' '+(yNow+3).toFixed(1)+' L'+X+' '+(yNow-3.5).toFixed(1)+' L'+(X+5)+' '+(yNow+3).toFixed(1)+'" fill="none" stroke="var(--gold,#c9a227)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    else svg+='<path d="M'+(X-5)+' '+(yNow-3).toFixed(1)+' L'+X+' '+(yNow+3.5).toFixed(1)+' L'+(X+5)+' '+(yNow-3).toFixed(1)+'" fill="none" stroke="var(--gold,#c9a227)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg+'</svg>';
  }
  function gaugeSvg(d){
    var bars=d.readings.map(function(r){ return gaugeOne(d,r); }).filter(Boolean);
    return bars.length?'<div class="wgauge">'+bars.join('')+'</div>':'';
  }
  var eyebrow=function(d){ var base=WATER_CHAIN[d.siteNo] || (d.tidal?'Tidal river':WATER_LABEL[d.kind]); return base+(d.alt>0?' \u00b7 '+Math.round(d.alt).toLocaleString()+' ft':''); };   /* v943; sea-level tidal gauges (alt 0) show no elevation */
  function waterCardHtml(d){
    if(d.dead) return '<div class="sg-row wcard wdead" data-site="'+waterEsc(d.siteNo)+'"><div class="sg-ico" style="color:'+colorOf(d,'dark')+'">'+WATER_ICON[d.kind]+(d.num?'<span class="wnum" style="background:'+colorOf(d,'dark')+'">'+d.num+'</span>':'')+'</div><div><p class="sg-eye">'+waterEsc(eyebrow(d))+'</p><p class="sg-val">no data</p><p class="sg-det"><b><a class="wsite" href="'+siteUrl(d)+'" target="_blank" rel="noopener" title="This gauge on USGS Water Data">'+waterEsc(d.displayName)+'</a></b><br><span class="wread">USGS: '+waterEsc(d.why)+'</span></p></div></div>';
    var main=d.readings[0], extra=d.readings.slice(1), sts=d.readings.map(function(r){ return statLine(d,r); }).filter(Boolean);
    return '<div class="sg-row wcard" data-site="'+waterEsc(d.siteNo)+'"><div class="sg-ico" style="color:'+colorOf(d,'dark')+'">'+WATER_ICON[d.kind]+(d.num?'<span class="wnum" style="background:'+colorOf(d,'dark')+'">'+d.num+'</span>':'')+'</div><div><p class="sg-eye">'+waterEsc(eyebrow(d))+'</p><p class="sg-val">'+waterEsc(main.text)+trendHtml(main)+'</p><p class="sg-det"><b><a class="wsite" href="'+siteUrl(d)+'" target="_blank" rel="noopener" title="This gauge on USGS Water Data">'+waterEsc(d.displayName)+'</a></b>'
      +(d.when?'<br><span class="wread">Read '+waterEsc(fmtWhen(d.when))+'</span>':'')
      +(extra.length?'<br>'+extra.map(function(e){ return '<span class="wx">'+waterEsc(e.label)+': '+waterEsc(e.text)+trendHtml(e)+'</span>'; }).join(' · '):'')
      +sts.filter(function(st,i){ return !gaugeOne(d, d.readings[i]); }).map(function(st){ return '<br><span class="wstat">'+waterEsc(st)+'</span>'; }).join('')   /* v949: the sentence lives in the bar's tooltip; printed only when there is no bar to hold it */
      +'</p></div>'+gaugeSvg(d)+'</div>';
  }
  function renderWater(){
    var host=$('water-cards'); if(!_wm || !host) return;
    var card=waterCardHtml;
    orderWater(_wm.byKind);
    /* v949 (Laurie): number within each chain, restarting at 1, in downstream order; lakes and wells unnumbered. */
    var groups=CHAINS.map(function(c){ return {chain:c, rows:_wm.byKind.stream.filter(function(d){ return CHAIN_OF[d.siteNo]===c; })}; });
    groups.forEach(function(g){ g.rows.forEach(function(d,i){ d.num=i+1; d.chain=g.chain; }); });
    _wm.byKind.stream.forEach(function(d){ if(!CHAIN_OF[d.siteNo]){ d.num=null; } });
    _wm.byKind.lake.forEach(function(d){ d.num=null; }); _wm.byKind.well.forEach(function(d){ d.num=null; });
    var section=function(title, color, rows){ return rows.length?'<div class="wchain"><h3 class="sg-h3 wchain-h"><span class="wsw" style="background:'+color+'"></span>'+waterEsc(title)+' <span class="wcount">'+rows.length+'</span></h3><div class="sg-grid wgrid">'+rows.map(card).join('')+'</div></div>':''; };
    var html=groups.map(function(g){ return section(g.chain.name, g.chain.dark, g.rows); }).join('')
      + section('Lakes & reservoirs', KIND_COLOR.lake.dark, _wm.byKind.lake)
      + section('Groundwater wells', KIND_COLOR.well.dark, _wm.byKind.well);
    host.innerHTML=html || '<p class="ph-empty">No active USGS gauges within '+WATER_BBOX_KM+' km right now.</p>';
    plotWaterMarkers(_wm.all);
  }
  function fetchWater(){
    var host=$('water-cards'); if(!host) return;
    /* period=P1D: the last 24 h of readings per gauge instead of just the latest, so each one can carry a trend arrow */
    /* v940: two requests - the curated stream transect by site number (any distance), and the bounding-box sweep
       for lakes/reservoirs and wells. Tidal codes are only asked of the curated list. */
    var sweepCodes=Object.keys(WATER_PARAMS).filter(function(c){ return CURATED_CODES.indexOf(c)<0 || c==='00060' || c==='00065'; });
    var urlA='https://waterservices.usgs.gov/nwis/iv/?format=json&sites='+STREAM_SITES.concat(WELL_SITES).join(',')+'&parameterCd='+CURATED_CODES.join(',')+'&siteStatus=all&period=P1D';
    var urlB='https://waterservices.usgs.gov/nwis/iv/?format=json&bBox='+waterBBox()+'&parameterCd='+sweepCodes.join(',')+'&siteStatus=active&period=P1D';
    var get=function(u){ return fetch(u).then(function(r){ return r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)); }); };
    Promise.all([get(urlA).catch(function(e){ status('Water levels (transect): '+(e&&e.message||'fetch failed')); return null; }), get(urlB).catch(function(e){ status('Water levels (nearby): '+(e&&e.message||'fetch failed')); return null; })]).then(function(js){
      if(!js[0] && !js[1]) throw new Error('both requests failed');
      var ts=[]; js.forEach(function(j){ ts=ts.concat((j&&j.value&&j.value.timeSeries)||[]); });
      var bySite={};
      ts.forEach(function(t){
        var code=(t.variable&&t.variable.variableCode&&t.variable.variableCode[0]&&t.variable.variableCode[0].value)||'';
        var meta=WATER_PARAMS[code]; if(!meta) return;
        var raw=(t.values&&t.values[0]&&t.values[0].value)||[];
        var series=raw.map(function(v){ return {t:Date.parse(v.dateTime), v:parseFloat(v.value), s:v.dateTime}; }).filter(function(p){ return isFinite(p.t) && isFinite(p.v) && p.v>-999990; });
        var si=t.sourceInfo||{}, sc=(si.siteCode&&si.siteCode[0]&&si.siteCode[0].value)||'';
        var geo=si.geoLocation&&si.geoLocation.geogLocation;
        if(!sc || !geo) return;
        var stc=''; (si.siteProperty||[]).forEach(function(pp){ if(pp.name==='siteTypeCd') stc=pp.value; });
        var d=bySite[sc] || (bySite[sc]={siteNo:sc, rawName:si.siteName||sc, lat:+geo.latitude, lng:+geo.longitude, readings:[], whenT:0, when:'', tidal:/^(ST-TS|ES)$/.test(stc), why:''});
        if(!series.length){
          /* v946 (Laurie: "I don't see Poughkeepsie"): no usable numbers, but the gauge exists - keep it, with USGS's own reason.
             Qualifier codes: Eqp equipment malfunction, Ice affected by ice, Dis discontinued, Mnt maintenance, Ssn out of season. */
          var q={}; raw.forEach(function(v){ (v.qualifiers||[]).forEach(function(x){ q[x]=1; }); });
          d.why = q.Eqp?'equipment malfunction' : q.Ice?'ice-affected' : q.Mnt?'maintenance' : q.Ssn?'out of season' : q.Dis?'discontinued' : (raw.length?'no usable readings':'no recent data');
          return;
        }
        var last=series[series.length-1];
        if(d.readings.some(function(r){ return r.code===code; })) return;   /* a site can publish the same parameter from two sensors (Prattsville's radar backup) - first one wins */
        d.readings.push({code:code, label:meta.label, value:last.v, text:meta.fmt(last.v), trend:trendOf(code, series)});
        /* v934 (Laurie): timestamp of the newest reading at the site. USGS stamps in the gauge's own local
           time with an offset; fmtWhen reads the digits as printed, so it stays Eastern wherever the reader is. */
        if(last.t>d.whenT){ d.whenT=last.t; d.when=last.s; }
      });
      var sites=Object.keys(bySite).map(function(sc){ var d=bySite[sc];
        d.readings.sort(function(a,b){ return WATER_ORDER.indexOf(a.code)-WATER_ORDER.indexOf(b.code); });
        d.dead=!d.readings.length;
        d.kind=d.dead ? 'stream' : WATER_PARAMS[d.readings[0].code].kind;
        if(sc==='01350100') d.kind='lake';   /* the reservoir keeps its drop icon inside the chain */
        d.km=haversineKm(LAT,LNG,d.lat,d.lng); d.displayName=cleanSiteName(d.rawName,d.kind); return d; });
      sites.sort(function(a,b){ return a.km-b.km; });
      /* v934 (Laurie): one section, grouped by kind \u2014 streams, then lakes/reservoirs, then wells. The named
         local waters (Normans Kill, Hudson, Catskill Creek...) are still guaranteed a card when a gauge
         exists; they simply lead their kind's row instead of sitting in a section of their own. */
      var used={}, byKind={stream:[], lake:[], well:[]};
      sites.forEach(function(d){ if(STREAM_SITES.indexOf(d.siteNo)>=0){ used[d.siteNo]=true; byKind.stream.push(d); } else if(WELL_SITES.indexOf(d.siteNo)>=0){ used[d.siteNo]=true; if(!d.dead){ d.kind='well'; byKind.well.push(d); } } else if(d.dead){ used[d.siteNo]=true; } });   /* v940: the transect is the curated list, whatever kind (v946: reservoir included); v948: pinned wells; dead sweep sites are dropped, dead transect sites kept */
      NAMED_WATERS.forEach(function(nw){
        var hit=sites.find(function(d){ return !used[d.siteNo] && d.kind!=='stream' && nw.re.test(d.rawName); });
        if(hit){ used[hit.siteNo]=true; byKind[hit.kind].push(hit); }
      });
      sites.forEach(function(d){ if(used[d.siteNo] || d.kind==='stream') return; if(byKind[d.kind].length<WATER_CAP[d.kind]){ used[d.siteNo]=true; byKind[d.kind].push(d); } });
      var all=[].concat(byKind.stream, byKind.lake, byKind.well);
      _wm={byKind:byKind, all:all};
      renderWater();                                  /* live readings first ... */
      Promise.all([fetchWaterStats(all), fetchSiteAlts(all)]).then(renderWater);   /* ... then again once statistics and site altitudes arrive */
    }).catch(function(e){ host.innerHTML='<p class="ph-empty">USGS water data is unreachable right now.</p>'; status('Water levels: '+(e && e.message || 'fetch failed')); });
  }
  
function fetchINat(){
    var grid=$('inat-grid'); if(!grid) return;
    var esc=function(v){ return String(v||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    var box='&nelat='+INAT_BOX.nelat+'&nelng='+INAT_BOX.nelng+'&swlat='+INAT_BOX.swlat+'&swlng='+INAT_BOX.swlng;
    var iso=function(daysAgo){ return new Date(Date.now()-daysAgo*86400000).toISOString().slice(0,10); };
    /* 2026-09-27 (v925, Laurie): v922's single 14-day query was quietly truncating itself \u2014 iNat's per_page
       caps at 200 raw observations, and this area produces enough research-grade photo records
       that 200 of them only reached back about 5 days, not 14, so "14 days" was a lie the whole
       time and a lot of real observations never got fetched at all. Two separate, narrower windows
       fixes both problems: each one comfortably fits under 200 raw records, and species get sorted
       by actual recency instead of by which byte happened to survive the cap.
       Recent (last 5 days): full card, 3 across, exactly as before \u2014 real iNat photo when the
       licence allows it, Wikipedia-credit fallback card when it doesn't.
       Older (6\u201310 days back): a species with no sighting in the last 5 days doesn't earn a full
       card \u2014 just its Wikipedia thumbnail, common name, scientific name, and how many times it
       was logged in this window. Nothing here needs its own photo license fetch since it never
       shows a real iNat photo. */
    var ICON={Aves:'\uD83D\uDC26',Insecta:'\uD83E\uDD8B',Plantae:'\uD83C\uDF3F',Fungi:'\uD83C\uDF44',Mammalia:'\uD83E\uDD8C',Amphibia:'\uD83D\uDC38',Reptilia:'\uD83D\uDC22',Arachnida:'\uD83D\uDD77\uFE0F'};
    var info=function(o){ var t=o.taxon||{}, ph=(o.photos&&o.photos[0])||null, lic=ph&&ph.license_code;
      return {t:t, name:t.preferred_common_name||t.name||'Unidentified', sci:t.preferred_common_name?t.name:'', sciKey:t.name||'', img:(ph&&lic)?ph.url.replace('square','medium'):null, lic:lic,
              when:o.time_observed_at||o.observed_on||'', who:o.user&&(o.user.name||o.user.login)||'', where:stripCoords(o.place_guess)||'', url:'https://www.inaturalist.org/observations/'+o.id}; };
    /* v942 (2026-09-27, Laurie): common and scientific names link to the Wikipedia species page; the photo keeps the iNaturalist link. */
    var wikiA=function(sci, txt, title){ return sci ? '<a class="wiki" href="https://en.wikipedia.org/wiki/'+esc(String(sci).replace(/ /g,'_'))+'" target="_blank" rel="noopener" title="'+esc(title||'Wikipedia')+'">'+txt+'</a>' : txt; };
    var groupBySpecies=function(res){
      var bySpecies={};
      res.forEach(function(o){ var d=info(o), key=d.sciKey||d.name;
        var g=bySpecies[key] || (bySpecies[key]={best:null, latest:null, count:0, icon:ICON[d.t.iconic_taxon_name]||'\uD83D\uDD0D'});
        g.count++; if(!g.latest) g.latest=d;   /* v937: results arrive newest first, so the first one seen is the most recent sighting */
        if(!g.best || (d.img && !g.best.img)) g.best=d;
      });
      return bySpecies;
    };
    /* v938 (2026-09-27, Laurie): one pull per taxonomic group over the full 10 days, newest first, 200 each -
       iNat's per_page cap. Because every pull is newest-first, any truncation falls on the OLD end of the
       window: the last-5-days grid is complete by construction, and the leaderboard's 10-day counts are a
       floor only for a group that actually hit its cap - which the response's total_results tells us, so the
       footnote names it. Groups: iNat's iconic taxa, with the two crowded kingdoms split further by class /
       order (Magnoliopsida 47124 dicots, Liliopsida 47163 monocots; Lepidoptera 47157, Hymenoptera 47201,
       Coleoptera 47208, Diptera 47822). Fetched four at a time to stay polite with the API. */
    var GROUPS=[
      {label:'birds',            q:'iconic_taxa=Aves'},
      {label:'mammals',          q:'iconic_taxa=Mammalia'},
      {label:'amphibians',       q:'iconic_taxa=Amphibia'},
      {label:'reptiles',         q:'iconic_taxa=Reptilia'},
      {label:'fish',             q:'iconic_taxa=Actinopterygii'},
      {label:'molluscs',         q:'iconic_taxa=Mollusca'},
      {label:'spiders & kin',    q:'iconic_taxa=Arachnida'},
      {label:'butterflies & moths', q:'taxon_id=47157'},
      {label:'bees, wasps & ants',  q:'taxon_id=47201'},
      {label:'beetles',          q:'taxon_id=47208'},
      {label:'flies',            q:'taxon_id=47822'},
      {label:'other insects',    q:'iconic_taxa=Insecta&without_taxon_id=47157,47201,47208,47822'},
      {label:'dicots',           q:'taxon_id=47124'},
      {label:'monocots',         q:'taxon_id=47163'},
      {label:'other plants',     q:'iconic_taxa=Plantae&without_taxon_id=47124,47163'},
      {label:'fungi & lichens',  q:'iconic_taxa=Fungi'},
      {label:'microbes',         q:'iconic_taxa=Protozoa,Chromista'},
      {label:'other life',       q:'iconic_taxa=unknown,Animalia&without_taxon_id=3,40151,20978,26036,47178,47115,47119,47158'}
    ];
    var base='https://api.inaturalist.org/v1/observations?quality_grade=research&photos=true&order_by=observed_on&order=desc&per_page=200&d1='+iso(10)+box+'&';
    var results=[], capped=[], seen={};
    var pull=function(g){ return fetch(base+g.q).then(function(r){ return r.json(); }).then(function(j){
      var rs=(j&&j.results)||[]; rs.forEach(function(o){ if(!seen[o.id]){ seen[o.id]=1; results.push(o); } });
      if(j && j.total_results>rs.length && rs.length>=200) capped.push(g.label+' ('+rs.length+' of '+j.total_results+')');
    }).catch(function(){}); };
    var chunks=[]; for(var ci=0; ci<GROUPS.length; ci+=4) chunks.push(GROUPS.slice(ci,ci+4));
    chunks.reduce(function(pr,ch){ return pr.then(function(){ return Promise.all(ch.map(pull)); }); }, Promise.resolve()).then(function(){
      results.sort(function(a,b){ return (Date.parse(b.time_observed_at||b.observed_on)||0)-(Date.parse(a.time_observed_at||a.observed_on)||0); });   /* newest first across groups, so g.latest stays right */
      var cut=Date.now()-5*86400000;
      var recentObs=results.filter(function(o){ return (Date.parse(o.time_observed_at||o.observed_on)||0)>=cut; });
      var res=[{results:recentObs},{results:results}];
      var recentSpecies=groupBySpecies(res[0].results||[]);
      /* v937 (2026-09-27, Laurie): the compact list is now a 10-day species leaderboard - every species seen in
         the full window (days 1-5 included, counted again), sorted by sightings, most-spotted first. The
         photo grid above is still last-5-days only, in kinship order. */
      var allSpecies=groupBySpecies(res[1].results||[]);
      var recent=Object.keys(recentSpecies).map(function(k){ return recentSpecies[k]; });
      var older=Object.keys(allSpecies).map(function(k){ return allSpecies[k]; });
      if(!recent.length && !older.length){ grid.innerHTML='<p class="ph-empty">No research-grade observations with photos came back.</p>'; $('inat-list').innerHTML=''; $('inat-note').textContent=''; return; }
      var cbadge=function(g){ return g.count>1?' <span class="c">'+g.count+'<span class="c-lbl"> sightings</span></span>':''; };
      /* v931 (2026-09-27, Laurie): the "no openly licensed photo" cards were rendering full-width and huge
         because they lived in a plain block container (.inat-list) instead of the 3-across grid the
         other cards sit in. They now go in the same grid, same card shape, sorted together with the
         rest by recency: the photo is a Wikipedia/Commons image with its own photographer + licence
         credit line (wikiPics fills that in), and the sighting details (who / when / where) are the
         iNaturalist observation's, exactly as on the regular cards. */
      var byRecency=function(a,b){ return (Date.parse(b.best.when)||0)-(Date.parse(a.best.when)||0); };
      /* v935 (2026-09-27, Laurie): order by kinship, not by clock. The newest sighting leads; after that, each
         next card is whichever unplaced species shares the deepest ancestry with the one just placed (iNat's
         taxon.ancestor_ids runs root -> species, so shared prefix length = how close the relatives are), most
         recent first on ties. A blue jay pulls the other corvids after it, then the rest of the birds, then the
         other vertebrates, then insects, plants, fungi... and the asters, goldenrods and bees land side by
         side. Nothing is hard-coded, and no species is ever permanently on top - the seed is whatever was
         seen last. Deliberately approximate: a greedy chain, not a tree. Falls back to the iconic-taxon name
         when a record has no ancestor list. */
      var taxonOrder=function(groups){
        var rem=groups.slice().sort(byRecency); if(rem.length<3) return rem;
        var anc=function(g){ var t=g.best.t||{}, a=t.ancestor_ids; return (a&&a.length)?a:['iconic:'+(t.iconic_taxon_name||'?')]; };
        var shared=function(a,b){ var n=Math.min(a.length,b.length), i=0; while(i<n && a[i]===b[i]) i++; return i; };
        var out=[rem.shift()];
        while(rem.length){ var last=anc(out[out.length-1]), bi=0, bs=-1;
          for(var i=0;i<rem.length;i++){ var sc=shared(last,anc(rem[i])); if(sc>bs){ bs=sc; bi=i; } }   /* rem stays recency-sorted, so the first max is the newest */
          out.push(rem.splice(bi,1)[0]); }
        return out;
      };
      recent=taxonOrder(recent);
      older.sort(function(a,b){ return (b.count-a.count) || byRecency(a,b); });
      var cardFor=function(g){ var d=g.best;
        var info='<div class="b"><div class="n">'+wikiA(d.sciKey, esc(d.name), 'Wikipedia: '+d.name)+cbadge(g)+'</div>'+(d.sci?'<div class="sci">'+wikiA(d.sciKey, esc(d.sci))+'</div>':'')+'<div class="m"><b>'+esc(fmtWhen(d.when))+'</b>'+(d.where?' \u00b7 <b>'+esc(d.where)+'</b>':'')+(d.who?'<br>by '+esc(d.who):'');
        /* v942: the card is a div; the photo alone links to the observation (title says so), names link to Wikipedia */
        if(d.img) return '<div class="inat"><a class="img-link" href="'+d.url+'" target="_blank" rel="noopener" title="This observation on iNaturalist"><img src="'+esc(d.img)+'" alt="'+esc(d.name)+'" loading="lazy"></a>'+info+'<br><span style="opacity:.7">photo '+esc(d.lic.toUpperCase())+' \u00b7 <a href="'+d.url+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">on iNaturalist</a></span></div></div></div>';
        /* a div, not an <a>: wikiPics puts a link (the Commons file page) inside the credit line and anchors can't nest */
        return '<div class="inat eb-card" data-sci="'+esc(d.sciKey)+'"><div class="img ph">'+g.icon+'</div>'+info+' \u00b7 <a href="'+d.url+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">on iNaturalist</a><br><span class="photo-credit" style="opacity:.7">species photo: Wikipedia</span></div></div></div>';
      };
      grid.innerHTML = recent.length ? recent.map(cardFor).join('') : '<p class="ph-empty">No research-grade observations with photos in the last five days.</p>';
      /* v937: species leaderboard - thumbnail (Wikipedia/Commons, credited), common name linking to the most recent
         iNaturalist sighting, scientific name linking to the Wikipedia species page, and the 10-day count. */
      var olderHtml = older.map(function(g){ var d=g.latest||g.best;
        /* v942: names -> Wikipedia; the count badge -> most recent sighting on iNaturalist (thumbnail gets swapped in by wikiPics, so it isn't the link) */
        return '<div class="eb" data-sci="'+esc(d.sciKey)+'"><div class="img ph">'+g.icon+'</div><div><div class="n">'+wikiA(d.sciKey, esc(d.name), 'Wikipedia: '+d.name)+' <a class="c" href="'+esc(d.url)+'" target="_blank" rel="noopener" title="Most recent sighting on iNaturalist">'+g.count+'<span class="c-lbl"> '+(g.count===1?'sighting':'sightings')+', last 10 days \u2197</span></a></div>'
          +(d.sciKey?'<div class="sci" style="font-style:italic;opacity:.85;font-size:12px">'+wikiA(d.sciKey, esc(d.sciKey))+'</div>':'')
          +'<div class="photo-credit" style="opacity:.7;font-size:10px"></div></div></div>';
      });
      /* v941 (2026-09-27, Laurie): leaderboard shows the top 10; a "+" button reveals the rest. */
      var LB_SHOW=10, hiddenN=Math.max(0, olderHtml.length-LB_SHOW);
      var lbRows=olderHtml.map(function(h,i){ return i<LB_SHOW ? h : h.replace('<div class="eb" ','<div class="eb lb-more" '); }).join('');
      $('inat-list').innerHTML = olderHtml.length ? '<p class="sg-eye" style="margin:14px 0 4px">Species leaderboard \u00b7 last 10 days</p><div class="inat-list inat-older">'+lbRows+'</div>'
        +(hiddenN?'<button type="button" class="sg-btn lb-toggle" aria-expanded="false">+ '+hiddenN+' more species</button>':'') : '';
      var tg=$('inat-list').querySelector('.lb-toggle');
      if(tg){ tg.addEventListener('click', function(){ var open=tg.getAttribute('aria-expanded')==='true'; $('inat-list').querySelector('.inat-older').classList.toggle('lb-open', !open); tg.setAttribute('aria-expanded', String(!open)); tg.textContent = open ? '+ '+hiddenN+' more species' : '\u2212 Show top 10 only'; }); }
      wikiPics();
      var parts=[]; if(recent.length) parts.push(recent.length+' species in the last 5 days'); if(older.length) parts.push(older.length+' species over the last 10 days');
      $('inat-note').textContent=(parts.join(', ')||'Nothing recent')+(capped.length?' \u00b7 10-day counts are a floor for '+capped.join(', ')+' \u2014 iNaturalist returns at most 200 per group':'')+' \u00b7 Data \u00a9 iNaturalist contributors; Creative Commons photos displayed here, click to review others on iNaturalist.';
    }).catch(function(e){ grid.innerHTML='<p class="ph-empty">iNaturalist is unreachable right now.</p>'; status('iNaturalist: '+(e && e.message || 'fetch failed')); });
  }
  /* ---------- eBird: recent + notable sightings near Berne (key per Laurie, 2026-09-20) ---------- */
  /* 2026-09-27 (v932, Laurie): declaration restored verbatim from the v825/v885-era copies. It sat directly above fetchEBird()
     and was deleted when the v922/v925 rewrites of fetchINat() replaced everything up to the next
     'function fetchEBird' marker — which is what made fetchEBird() throw 'EBIRD_DIST is not defined'. */
  var EBIRD_KEY='dce779eb-603d-4505-9113-a04103e6d8d5', EBIRD_DIST=25, EBIRD_BACK=14;
  function fetchEBird(){
    var grid=$('ebird-grid'), band=$('ebird-notable'); if(!grid) return;
    if(!EBIRD_KEY){ grid.innerHTML='<p class="ph-empty">No eBird API key configured.</p>'; if(band) band.innerHTML=''; status('eBird: no API key set (EBIRD_KEY is blank)'); return; }   /* 2026-09-27 (v927, Laurie) */
    var base='https://api.ebird.org/v2/data/obs/geo/recent', q='?lat='+LAT.toFixed(4)+'&lng='+LNG.toFixed(4)+'&dist='+EBIRD_DIST+'&back='+EBIRD_BACK+'&maxResults=10000'; /* 2026-09-27 (v898, Laurie): was capped at 60 records, which read as a fixed species count; the eBird max is 10000 */
    var opt={headers:{'X-eBirdApiToken':EBIRD_KEY}};
    var esc=function(v){ return String(v||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    /* 2026-09-27 (v901, Laurie): totals across the whole 14-day window, not just the single most-recent report:
       sum of howMany per species, and how many separate checklists reported it. A checklist
       marking a species "X" (present, no count given) still means at least one bird — counted as
       1 here, not 0 — so the number is always a true floor; the "+" then means the real total may
       be higher than what's shown. */
    var wikiLink=function(sci, txt, title){ return sci ? '<a class="wiki" href="https://en.wikipedia.org/wiki/'+esc(String(sci).replace(/ /g,'_'))+'" target="_blank" rel="noopener" title="'+esc(title||'Wikipedia')+'">'+txt+'</a>' : txt; };   /* v942 (Laurie): names -> Wikipedia */
    var countMeta = function(recentAll, code){
      var sum=0, reports=0, anyUnknown=false;
      recentAll.forEach(function(o){ if(o.speciesCode!==code) return; reports++; if(o.howMany!=null) sum+=o.howMany; else { sum+=1; anyUnknown=true; } });
      return {sum:sum, reports:reports, anyUnknown:anyUnknown};
    };
    var countBadge = function(m){ if(!m.reports) return ''; return m.sum+(m.anyUnknown?'+':''); }; /* 2026-09-27 (v907, Laurie): every report guarantees at least one bird, so this is never a bare "0" — "1+" for a single unmarked sighting, per Laurie */
    var reportsNote = function(m){ return m.reports>1 ? m.reports+' reports' : '1 report'; };
    /* 2026-09-27 (v902, Laurie): row() (compact eBird strip) retired — the notable band now uses the same card as the main grid */
    var card=function(o,rare,m){ return '<div class="inat eb-card'+(rare?' rare':'')+'" data-sci="'+esc(o.sciName)+'" data-subid="'+esc(o.subId||'')+'"><div class="img ph">🐦</div><div class="b"><div class="n">'+wikiLink(o.sciName, esc(o.comName), 'Wikipedia: '+o.comName)+(countBadge(m)?' <span class="c">'+countBadge(m)+'<span class="c-lbl"> sightings</span></span>':'')+'</div><div class="sci">'+wikiLink(o.sciName, esc(o.sciName))+'</div><div class="m"><b>'+esc(fmtWhen(o.obsDt))+'</b>'+(o.locName?' \u00b7 <b>'+esc(stripCoords(o.locName))+'</b>':'')+' \u00b7 '+reportsNote(m)+'<span class="obs-by"></span><br><span class="photo-credit" style="opacity:.7">species photo: Wikipedia</span></div></div></div>'; }; /* 2026-09-27 (v906, Laurie): date/time and location bold, coordinates stripped from locName; count badge relabelled "sightings" — see countBadge() for what the number means */
    Promise.all([fetch(base+'/notable'+q,opt).then(function(r){ return r.ok?r.json():[]; }).catch(function(){ return []; }),
                 fetch(base+q,opt).then(function(r){ if(!r.ok) throw new Error('eBird HTTP '+r.status); return r.json(); })])
    .then(function(res){ var notable=res[0]||[], recent=res[1]||[];
      var srt=function(a,b){ return (b.obsDt||'').localeCompare(a.obsDt||''); }; notable.sort(srt); recent.sort(srt);
      /* v941 (2026-09-27, Laurie): one card per notable species (most recent report), with the same
         sightings badge as the main grid, instead of a card per individual report. The heading count is species. */
      var nseen={}, nuniq=notable.filter(function(o){ var k=o.speciesCode; if(nseen[k]) return false; nseen[k]=1; return true; });
      band.innerHTML = nuniq.length ? '<div class="eb-band"><div class="t">Big Deal Birdos \u00b7 '+nuniq.length+(nuniq.length===1?' species':' species')+'</div><div class="sg-grid">'+nuniq.slice(0,12).map(function(o){ return card(o,false,countMeta(recent,o.speciesCode)); }).join('')+'</div></div>' : ''; /* 2026-09-27 (v902, Laurie): every individual sighting kept separate (no per-species merge); same card size as the main grid; the 'notable' tag is dropped below since the section heading already says so, and eBird gives no reason code for why a sighting is flagged */
      var seen={}, uniq=recent.filter(function(o){ var k=o.speciesCode; if(seen[k]) return false; seen[k]=1; return true; });   /* one card per species, most recent report */
      grid.innerHTML = uniq.length ? uniq.map(function(o){ return card(o,false,countMeta(recent,o.speciesCode)); }).join('') : '<p class="ph-empty">No reports in the window.</p>';
      wikiPics();
      fetchObservers();
      $('ebird-note').textContent = uniq.length+' species reported in the last '+EBIRD_BACK+' days within '+EBIRD_DIST+' km of Berne, most recent report of each shown. \u00b7 data \u00a9 eBird / Cornell Lab of Ornithology.';
    }).catch(function(e){ grid.innerHTML='<p class="ph-empty">eBird is unreachable right now.</p>'; status('eBird: '+(e && e.message || 'fetch failed')+' (if this says HTTP 403 the key is wrong; if it says "Failed to fetch" eBird refused the cross-site request and the feed must move to build time)'); });
  }
  /* 2026-09-27 (v901, Laurie): observer name per most-recent checklist, filled in after the grid renders so a
     slow or failed lookup never blocks the page. Cached in sessionStorage by checklist id. */
  function fetchObservers(){
    var els=document.querySelectorAll('[data-subid]'), cache={}; try{ cache=JSON.parse(sessionStorage.getItem('hfa.ebobs')||'{}'); }catch(e){}
    var pending={};
    Array.prototype.forEach.call(els,function(el){ var sid=el.getAttribute('data-subid'); if(!sid) return;
      var put=function(name){ if(!name) return; var s=el.querySelector('.obs-by'); if(s) s.textContent=' \u00b7 by '+name; };
      if(cache[sid]!=null){ put(cache[sid]); return; }
      if(pending[sid]){ pending[sid].push(put); return; }
      pending[sid]=[put];
      fetch('https://api.ebird.org/v2/product/checklist/view/'+encodeURIComponent(sid),{headers:{'X-eBirdApiToken':EBIRD_KEY}}).then(function(r){ return r.ok?r.json():null; }).then(function(cl){
        var name=cl&&cl.userDisplayName||''; cache[sid]=name; try{ sessionStorage.setItem('hfa.ebobs',JSON.stringify(cache)); }catch(e){}
        pending[sid].forEach(function(f){ f(name); });
      }).catch(function(){ cache[sid]=''; pending[sid].forEach(function(f){ f(''); }); });
    });
  }

  /* 2026-09-27 (v903, Laurie): fetch the licence and photographer for the Wikipedia thumbnail itself, not just
     the image, and print it as the credit line. Wikipedia taxobox photos are almost always hosted
     on Commons under a free licence (Wikipedia requires this for mainspace use); the rare local,
     non-free upload is skipped rather than mis-credited. Cached under a new key (hfa.wiki2) since
     the old cache only ever held a bare URL. */
  var wpEsc=function(v){ return String(v||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  function fileCreditFromUrl(u){
    if(!u) return Promise.resolve(null);
    var onCommons = u.indexOf('/wikipedia/commons/') !== -1;
    var apiHost = onCommons ? 'https://commons.wikimedia.org/w/api.php' : 'https://en.wikipedia.org/w/api.php';
    var parts = u.split('/'), last = parts[parts.length-1];
    var fname = /^\d+px-/.test(last) ? parts[parts.length-2] : last;
    try{ fname = decodeURIComponent(fname); }catch(e){}
    if(!fname) return Promise.resolve(null);
    var url = apiHost+'?action=query&titles='+encodeURIComponent('File:'+fname)+'&prop=imageinfo&iiprop=extmetadata&format=json&origin=*';
    return fetch(url).then(function(r){ return r.ok?r.json():null; }).then(function(j2){
      if(!j2) return null;
      var pages = j2.query && j2.query.pages; if(!pages) return null;
      var pg = pages[Object.keys(pages)[0]]; var info = pg && pg.imageinfo && pg.imageinfo[0]; var meta = info && info.extmetadata;
      if(!meta) return null;
      var strip = function(s){ return String(s||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); };
      var artist = strip(meta.Artist && meta.Artist.value);
      var lic = strip(meta.LicenseShortName && meta.LicenseShortName.value) || 'licence unlisted';
      var fileUrl = (onCommons?'https://commons.wikimedia.org/wiki/File:':'https://en.wikipedia.org/wiki/File:')+encodeURIComponent(fname);
      return {artist:artist, lic:lic, fileUrl:fileUrl};
    }).catch(function(){ return null; });
  }
  function wikiPics(){
    var els=document.querySelectorAll('.eb[data-sci], .eb-card[data-sci]'), cache={}; /* 2026-09-27 (v899, Laurie): picks up both the notable-band rows and the new grid cards */ try{ cache=JSON.parse(sessionStorage.getItem('hfa.wiki2')||'{}'); }catch(e){}
    var pending={};
    Array.prototype.forEach.call(els,function(el){ var sci=el.getAttribute('data-sci'); if(!sci) return;
      var put=function(d){ if(!d||!d.url) return;
        var im=document.createElement('img'); im.className='img'; im.alt=''; im.loading='lazy'; im.src=d.url; var ph=el.querySelector('.img.ph'); if(ph) el.replaceChild(im,ph);
        var cr=el.querySelector('.photo-credit');
        if(cr && d.credit){
          cr.innerHTML = 'photo: '+(d.credit.artist?wpEsc(d.credit.artist)+' \u00b7 ':'')+'<a href="'+wpEsc(d.credit.fileUrl)+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">'+wpEsc(d.credit.lic)+'</a> (Wikimedia Commons)';
        }
      };
      if(cache[sci]){ put(cache[sci]); return; }
      if(pending[sci]){ pending[sci].push(put); return; }
      pending[sci]=[put];
      fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(sci.replace(/ /g,'_'))).then(function(r){ return r.ok?r.json():null; }).then(function(p){
        var u=p&&p.thumbnail&&p.thumbnail.source||'';
        fileCreditFromUrl(u).then(function(credit){
          var d={url:u, credit:credit}; cache[sci]=d; try{ sessionStorage.setItem('hfa.wiki2',JSON.stringify(cache)); }catch(e){}
          pending[sci].forEach(function(f){ f(d); });
        });
      }).catch(function(){});
    });
  }

  /* 2026-09-27 (v926, Laurie): one section throwing before it even reaches its fetch() used to take every
     later section down with it \u2014 init() called them all back-to-back with nothing to stop a
     synchronous error from aborting the rest of the list. Each call is now its own try/catch, so a
     bug in one section shows up as a status-line message and an empty card, never a blank page. */
  function safeCall(name, fn){ try{ fn(); }catch(e){ status(name+': '+(e && e.message || 'failed to start')); } }
  function init(){
    safeCall('iNaturalist', fetchINat);
    safeCall('eBird', fetchEBird);
    safeCall('Water levels', fetchWater);
    safeCall('Phenology', renderPhenology);
    safeCall('Sun/moon', renderSunMoon);
    safeCall('Surface weather', fetchWx);
    safeCall('Degree days', fetchDD);
    setInterval(function(){ safeCall('Sun/moon', renderSunMoon); }, 60000);
    setInterval(function(){ safeCall('Surface weather', fetchWx); }, 15*60000);
    setInterval(function(){ safeCall('Water levels', fetchWater); }, 15*60000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
