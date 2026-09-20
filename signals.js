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
      $('moon-phase').textContent = (H.phaseLabel?H.phaseLabel(age):'')+' · '+Math.round(ill*100)+'% lit';
      var li = H.lunationInfo ? H.lunationInfo(now) : null;
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
      safe(function(){ gauge('temp', c.temperature_2m, -20, 110, Math.round(c.temperature_2m)+'°F', 'feels like '+Math.round(c.apparent_temperature)+'° · '+Math.round(f2c(c.temperature_2m))+'°C');
      });
      safe(function(){ gauge('hum', c.relative_humidity_2m, 0, 100, c.relative_humidity_2m+'%', 'relative humidity'); });
      safe(function(){ var inHg = c.surface_pressure*0.02953;
      gauge('pres', inHg, 28.5, 31, inHg.toFixed(2)+' inHg', Math.round(c.surface_pressure)+' hPa at the surface');
      });
      safe(function(){ gauge('cloud', c.cloud_cover, 0, 100, c.cloud_cover+'%', 'cloud cover · '+(skyKind ? skyKind(c.weather_code, c.is_day)[1] : ''));
      });
      safe(function(){ windDial('w10', c.wind_speed_10m, c.wind_direction_10m, 'gusts '+Math.round(c.wind_gusts_10m)+' kt'); });
      safe(function(){ var d = j.daily||{};
      $('day-val').innerHTML = '↑ '+Math.round(d.temperature_2m_max[0])+'°<span class="c">↓ '+Math.round(d.temperature_2m_min[0])+'°</span>';
      $('day-det').textContent = 'forecast high / low · '+(d.precipitation_sum[0]||0).toFixed(2)+' in precipitation expected'; });
    }).catch(function(e){ status('Surface weather: '+(e && e.message || 'fetch failed')); });
    var lv = ['850','500','100','10'];
    var q2 = Q+'&hourly='+lv.map(function(l){ return 'wind_speed_'+l+'hPa,wind_direction_'+l+'hPa,geopotential_height_'+l+'hPa'; }).join(',')+'&wind_speed_unit=kn&past_hours=3&forecast_hours=6';
    var tries = ['https://api.open-meteo.com/v1/gem?'+q2+'&models=cmc_gem_global','https://api.open-meteo.com/v1/gfs?'+q2+'&models=gfs_global'];
    (function attempt(i){
      if(i>=tries.length){ lv.forEach(function(l){ windDial(l==='10'?'w10hpa':'w'+l, null); }); return; }
      fetch(tries[i]).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
        var ok = false;
        lv.forEach(function(l){ var h = nearestHour ? nearestHour(j,'wind_speed_'+l+'hPa','wind_direction_'+l+'hPa','geopotential_height_'+l+'hPa') : null;
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
  var _ddCache = null;
  function buildPicker(){ var sel=$('st-pick'), ALL=window.STATION_DD; if(!sel||!ALL||sel.options.length) return; Object.keys(ALL.stations).forEach(function(k){ var S=ALL.stations[k], o=document.createElement('option'); o.value=k; o.textContent=S.name+' · '+S.first+'–'+S.last+(S.active?'':' (closed)'); sel.appendChild(o); }); sel.onchange=function(){ if(_ddCache) renderDD(_ddCache); }; }
  function fetchDD(){
    buildPicker();
    if(_ddCache){ renderDD(_ddCache); return; }
    var t = new Date(Date.now()-86400000), end = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    var thisYear = t.getFullYear(), mmdd = end.slice(5);
    var url = 'https://archive-api.open-meteo.com/v1/archive?'+Q+'&start_date=1940-01-01&end_date='+end+'&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit';
    $('dd-note').textContent = 'Loading 1940–'+thisYear+' history…';
    fetch(url).then(function(r){ return r.json(); }).then(function(j){ _ddCache=j; renderDD(j); }).catch(function(e){ $('dd-note').textContent='Degree-day history unavailable right now.'; status('Degree days: '+(e && e.message || 'fetch failed')); });
  }
  /* ---------- the year, drawn: one chart builder, six charts ---------- */
  function yearSeries(j){
    var T=j.daily.time, mx=j.daily.temperature_2m_max, mn=j.daily.temperature_2m_min, out={};
    for(var i=0;i<T.length;i++){ if(typeof mx[i]!=='number'||typeof mn[i]!=='number') continue;
      var y=+T[i].slice(0,4), d=new Date(T[i]+'T00:00:00Z'), doy=Math.round((d-Date.UTC(y,0,1))/86400000);
      var Y=out[y]||(out[y]={hi:new Array(366),lo:new Array(366),mean:new Array(366),hdd:new Array(366),cdd:new Array(366),gdd:new Array(366),_h:0,_c:0,_g:0});
      var mean=(mx[i]+mn[i])/2; Y.hi[doy]=mx[i]; Y.lo[doy]=mn[i]; Y.mean[doy]=mean;
      Y._h+=Math.max(0,65-mean); Y._c+=Math.max(0,mean-65); Y._g+=Math.max(0,(Math.min(86,mx[i])+Math.max(50,mn[i]))/2-50);
      Y.hdd[doy]=Y._h; Y.cdd[doy]=Y._c; Y.gdd[doy]=Y._g; }
    return out;
  }
  function stationSeries(S){
    var out={}; Object.keys(S.years).forEach(function(y){ var Y=S.years[y]; if(!Y.dhi) return;
      var o={hi:new Array(366),lo:new Array(366),mean:new Array(366),hdd:new Array(366),cdd:new Array(366),gdd:new Array(366)}, h=0,c=0,g=0;
      for(var d=0;d<366;d++){ var mx=Y.dhi[d], mn=Y.dlo[d]; if(typeof mx!=='number'||typeof mn!=='number') continue;
        var mean=(mx+mn)/2; o.hi[d]=mx; o.lo[d]=mn; o.mean[d]=mean; h+=Math.max(0,65-mean); c+=Math.max(0,mean-65); g+=Math.max(0,(Math.min(86,mx)+Math.max(50,mn))/2-50); o.hdd[d]=h; o.cdd[d]=c; o.gdd[d]=g; }
      out[y]=o; });
    return out;
  }
  function drawChart(id, years, key, tMin, tMax, smooth, unit){
    var svg=$(id), tip=$(id+'-tip'); if(!svg) return;
    var ys=Object.keys(years).map(Number).sort(function(a,b){ return a-b; }), y0=ys[0], yN=ys[ys.length-1];
    var W=1000,H=420,L=48,R=10,Tp=10,B=28;
    var X=function(doy){ return L+(W-L-R)*doy/365; }, Y=function(t){ return Tp+(H-Tp-B)*(1-(t-tMin)/(tMax-tMin)); };
    var h='', mdays=[0,31,59,90,120,151,181,212,243,273,304,334], mon=['J','F','M','A','M','J','J','A','S','O','N','D'];
    var step=(tMax-tMin)>=2000?1000:((tMax-tMin)>=200?200:20);
    for(var t=Math.ceil(tMin/step)*step;t<=tMax;t+=step){ h+='<line class="ax" x1="'+L+'" y1="'+Y(t)+'" x2="'+(W-R)+'" y2="'+Y(t)+'"/><text class="lbl" x="'+(L-6)+'" y="'+(Y(t)+4)+'" text-anchor="end">'+t.toLocaleString()+unit+'</text>'; }
    for(var m=0;m<12;m++){ h+='<line class="ax" x1="'+X(mdays[m])+'" y1="'+Tp+'" x2="'+X(mdays[m])+'" y2="'+(H-B)+'"/><text class="lbl" x="'+X(mdays[m]+15)+'" y="'+(H-8)+'" text-anchor="middle">'+mon[m]+'</text>'; }
    if(unit==='°' && tMin<32 && tMax>32) h+='<line class="ax" x1="'+L+'" y1="'+Y(32)+'" x2="'+(W-R)+'" y2="'+Y(32)+'" style="stroke:rgba(255,255,255,.45); stroke-dasharray:4 4"/><text class="lbl" x="'+(W-R-4)+'" y="'+(Y(32)-4)+'" text-anchor="end">freezing</text>';
    var vals={};   /* smoothed values per year for hover */
    ys.forEach(function(y){
      var v=years[y][key], pts=[], sv=new Array(366), f=(y-y0)/Math.max(1,(yN-1-y0)), cur=(y===yN);
      var col=cur?'#ffffff':'rgb('+Math.round(40+110*f)+','+Math.round(60+130*f)+','+Math.round(140+95*f)+')', op=cur?1:(0.35+0.5*f), sw=cur?2.4:1;
      for(var d=0;d<366;d++){ var val=null;
        if(smooth){ var s_=0,n=0; for(var q=-3;q<=3;q++){ var x=v[d+q]; if(typeof x==='number'){ s_+=x; n++; } } if(n>=4) val=s_/n; }
        else if(typeof v[d]==='number') val=v[d];
        if(val!=null){ sv[d]=val; pts.push(X(d).toFixed(1)+','+Y(val).toFixed(1)); } }
      vals[y]=sv;
      if(pts.length>1) h+='<polyline data-y="'+y+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-opacity="'+op+'" stroke-linejoin="round" points="'+pts.join(' ')+'"/>';
    });
    svg.innerHTML=h;
    /* hover: nearest line at the cursor's day */
    var lastHl=null;
    svg.onmousemove=function(e){
      var r=svg.getBoundingClientRect(), px=(e.clientX-r.left)/r.width*W, py=(e.clientY-r.top)/r.height*H;
      var doy=Math.max(0,Math.min(365,Math.round((px-L)/(W-L-R)*365))), best=null, bd=1e9;
      ys.forEach(function(y){ var v=vals[y][doy]; if(v==null) return; var d=Math.abs(Y(v)-py); if(d<bd){ bd=d; best=y; } });
      if(lastHl) lastHl.classList.remove('hl');
      if(best!=null && bd<18){ var el=svg.querySelector('polyline[data-y="'+best+'"]'); if(el){ el.classList.add('hl'); svg.appendChild(el); lastHl=el; }
        var v=vals[best][doy]; tip.style.display='block'; tip.textContent=best+' · '+(unit==='°'?Math.round(v)+'°F':Math.round(v).toLocaleString()+' '+unit)+' on '+mon[Math.max(0,mdays.findIndex(function(md,i){ return doy<(mdays[i+1]||366); }))]+' '+(doy-mdays[Math.max(0,mdays.findIndex(function(md,i){ return doy<(mdays[i+1]||366); }))]+1); }
      else { tip.style.display='none'; }
    };
    svg.onmouseleave=function(){ if(lastHl) lastHl.classList.remove('hl'); tip.style.display='none'; };
  }
  var _yearsBerne=null;
  function renderYearChart(j){
    if(!j||!j.daily) return;
    _yearsBerne=yearSeries(j);
    var sel=$('ch-src'), ALL=window.STATION_DD;
    if(sel && ALL && sel.options.length<2){ Object.keys(ALL.stations).forEach(function(k){ var S=ALL.stations[k]; if(!S.daily) return; var o=document.createElement('option'); o.value=k; o.textContent=S.name+' observed ('+S.first+'–'+S.last+')'; sel.appendChild(o); }); sel.onchange=drawAll; }
    drawAll();
  }
  function drawAll(){
    var sel=$('ch-src'), ALL=window.STATION_DD, src=sel?sel.value:'berne', years, note='';
    if(src==='berne'||!ALL||!ALL.stations[src]){ years=_yearsBerne; note=''; }
    else { var S=ALL.stations[src]; years=stationSeries(S); note='Observed at '+S.name+', ~'+S.elev.toLocaleString()+' ft — NOAA thermometer readings, gaps where the observer missed a day.'; }
    var n=$('ch-src-note'); if(n) n.textContent=note;
    if(!years) return;
    var ys=Object.keys(years).map(Number);
    drawChart('ch-mean', years, 'mean', -20, 95, false, '°');
    drawChart('ch-hi',   years, 'hi',  -10, 105, false, '°');
    drawChart('ch-lo',   years, 'lo',  -35,  80, false, '°');
    drawChart('ch-hdd',  years, 'hdd',   0, 8500, false, 'HDD');
    drawChart('ch-cdd',  years, 'cdd',   0, 1400, false, 'CDD');
    drawChart('ch-gdd',  years, 'gdd',   0, 4000, false, 'GDD');
    var nn=$('yr-note'); if(nn) nn.textContent = ys.length+' years ('+Math.min.apply(null,ys)+'–'+Math.max.apply(null,ys)+') · '+(src==='berne'?'ERA5 reanalysis for Berne via Open-Meteo':'NOAA GHCN-Daily via xmACIS2')+' · raw daily values.';
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
      $('dd-h').textContent=fmt(cur.td.h); $('dd-c').textContent=fmt(cur.td.c); $('dd-g').textContent=fmt(cur.td.g);
      /* Albany observed (station_dd.js), same date, same formulas */
      /* Observed station (picker; station_dd.js carries several) */
      var ALL = window.STATION_DD, doy = Math.round((Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())-Date.UTC(t.getFullYear(),0,1))/86400000)+1;
      var sel = $('st-pick'), key = (sel && sel.value) || (ALL && Object.keys(ALL.stations)[0]);
      var SD = ALL && ALL.stations[key], sy = SD && SD.years[thisYear], sn = null;
      if(SD){ var acc={h:0,c:0,g:0}, k=0, y1=null, y2=null; Object.keys(SD.years).forEach(function(yy){ yy=+yy; var Y=SD.years[yy]; if(yy<thisYear && Y && Y.n>=360 && Y.h){ acc.h+=Y.h[doy-1]; acc.c+=Y.c[doy-1]; acc.g+=Y.g[doy-1]; k++; y1=y1==null?yy:Math.min(y1,yy); y2=y2==null?yy:Math.max(y2,yy); } }); if(k>=5){ sn={h:acc.h/k,c:acc.c/k,g:acc.g/k,n:k,y1:y1,y2:y2}; } }
      /* water + extremes for the chosen station */
      (function(){ var P=$('w-p'); if(!P) return; if(!SD){ P.textContent='—'; return; }
        var pn=null, snw=null, k2=0; Object.keys(SD.years).forEach(function(yy){ yy=+yy; var Y=SD.years[yy]; if(yy<thisYear && Y && Y.np>=360 && Y.p){ pn=(pn||0)+Y.p[doy-1]; snw=(snw||0)+Y.s[doy-1]; k2++; } });
        if(k2>=5){ pn/=k2; snw/=k2; } else { pn=snw=null; }
        var lbl=SD.name.split(' ·')[0];
        if(sy && sy.np){ var pv=sy.p[doy-1], sv=sy.s[doy-1];
          $('w-p').textContent=pv.toFixed(2)+' in'; $('w-p-d').textContent=lbl+' · '+sy.wet+' wet days'+(pn!=null?' · record average '+pn.toFixed(2)+' in ('+(pv-pn>=0?'+':'−')+Math.abs(pv-pn).toFixed(2)+', '+k2+' yrs)':' · too few complete years for an average');
          $('w-s').textContent=sv.toFixed(1)+' in'; $('w-s-d').textContent=lbl+' · deepest snowpack '+sy.depth+' in'+(snw!=null?' · record average to date '+snw.toFixed(1)+' in':'');
          $('w-x').innerHTML=(sy.hi!=null?'↑ '+Math.round(sy.hi)+'°<span class="c">↓ '+Math.round(sy.lo)+'°</span>':'—');
          $('w-x-d').textContent=lbl+' · '+sy.d90+' days at or above 90°F · '+sy.d0+' nights at or below 0°F';
        } else { ['w-p','w-s','w-x'].forEach(function(id){ $(id).textContent='—'; }); $('w-p-d').textContent=lbl+': no '+thisYear+' observations'+(SD.active?'':' (closed '+SD.last+')'); $('w-s-d').textContent=''; $('w-x-d').textContent=''; }
      })();
      var obs=function(kk){ if(!SD) return ''; if(!sy) return '<br><span class="obs">'+SD.name+': no '+thisYear+' observations'+(SD.active?'':' (station closed '+SD.last+')')+'</span>';
        var v=sy[kk][doy-1]; return '<br><span class="obs">'+SD.name+' observed: <b>'+fmt(v)+'</b>'+(sn?' · '+sn.y1+'–'+sn.y2+' average '+fmt(sn[kk])+' ('+(v-sn[kk]>=0?'+':'−')+fmt(Math.abs(v-sn[kk]))+', '+sn.n+' complete years)':' · fewer than 5 complete years — no average')+'</span>'; };
      $('dd-h-d').innerHTML='<b>'+dev(cur.td.h,norm.h)+'</b>'+obs('h')+'<br>Base 65°F: each degree the daily mean falls below 65 is one heating degree day.';
      $('dd-c-d').innerHTML='<b>'+dev(cur.td.c,norm.c)+'</b>'+obs('c')+'<br>Base 65°F, the other direction: heat the season has thrown at us.';
      $('dd-g-d').innerHTML='<b>'+dev(cur.td.g,norm.g)+'</b>'+obs('g')+'<br>Base 50°F, capped at 86°F (the corn scale). Insects, weeds and crops keep their calendars in these units.';
      $('dd-note').textContent='Jan 1 – '+end+' · Berne, NY at ~1,700 ft: ERA5 reanalysis via Open-Meteo. Observed: '+(SD?SD.name+', ~'+SD.elev.toLocaleString()+' ft, record '+SD.first+'–'+SD.last+(SD.active?' (active)':' (closed)')+', '+ALL.source:'no station loaded')+'. Averages are the full period of record through this same date (complete years only, current year excluded), same formulas for both.';
      /* year-by-year table (collapsed) */
      var ys=Object.keys(years).map(Number).sort(function(a,b){ return b-a; });
      var h='<table class="ddtab"><thead><tr><th>Year</th><th colspan="3">Berne · through '+mmdd.replace('-','/')+'</th><th colspan="3">Berne · full year</th>'+(SD?'<th colspan="3">'+SD.name.split(' ·')[0]+' observed · through '+mmdd.replace('-','/')+'</th><th colspan="6">'+SD.name.split(' ·')[0]+' · full year</th>':'')+'</tr><tr><th></th><th>Heat</th><th>Cool</th><th>Grow</th><th>Heat</th><th>Cool</th><th>Grow</th>'+(SD?'<th>Heat</th><th>Cool</th><th>Grow</th><th>Precip</th><th>Snow</th><th>Hi</th><th>Lo</th><th>≥90°</th><th>≤0°</th><th>Depth</th>':'')+'</tr></thead><tbody>';
      if(SD){ Object.keys(SD.years).forEach(function(y){ y=+y; if(!years[y]) years[y]={td:{h:0,c:0,g:0},full:{h:0,c:0,g:0},days:0,noBerne:true}; }); }
      var ys=Object.keys(years).map(Number).sort(function(a,b){ return b-a; });
      ys.forEach(function(y){ var Y=years[y], nb=Y.noBerne, S=SD&&SD.years[y]; h+='<tr'+(y===thisYear?' class="cur"':'')+'><td>'+y+'</td><td>'+(nb?'—':fmt(Y.td.h))+'</td><td>'+(nb?'—':fmt(Y.td.c))+'</td><td>'+(nb?'—':fmt(Y.td.g))+'</td><td>'+(nb||y===thisYear?'—':fmt(Y.full.h))+'</td><td>'+(nb||y===thisYear?'—':fmt(Y.full.c))+'</td><td>'+(nb||y===thisYear?'—':fmt(Y.full.g))+'</td>'+(SD?'<td>'+(S&&S.n&&S.h?fmt(S.h[doy-1]):'—')+'</td><td>'+(S&&S.n&&S.c?fmt(S.c[doy-1]):'—')+'</td><td>'+(S&&S.n&&S.g?fmt(S.g[doy-1]):'—')+'</td><td>'+(S&&S.np?S.tp.toFixed(2):'—')+'</td><td>'+(S&&S.np?S.ts.toFixed(1):'—')+'</td><td>'+(S&&S.hi!=null?Math.round(S.hi)+'°':'—')+'</td><td>'+(S&&S.lo!=null?Math.round(S.lo)+'°':'—')+'</td><td>'+(S&&S.n?S.d90:'—')+'</td><td>'+(S&&S.n?S.d0:'—')+'</td><td>'+(S?S.depth:'—')+'</td>':'')+'</tr>'; });
      h+='</tbody></table>';
      $('dd-hist').innerHTML=h;
      $('dd-toggle').style.display='inline-block';
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
    var TAG={ghost:'Ghost',health:'Health watch',garden:'Garden',foodways:'Foodways'};
    row.innerHTML = wins.map(function(w,idx){
      var label = MON[w.m-1]+' '+w.lo+'–'+(w.hi===15?15:dim(w.m));
      var ex = EX[idx];
      var exCard = '<article class="ph-card'+(idx===curIdx?' cur':'')+'"><div class="ph-head"><div><p class="ph-sub">Expected</p><div class="ph-win">'+(ex?esc(ex.name):label)+'</div></div><div class="ph-count">'+label+'</div></div>'
        + (ex ? ex.sections.map(function(sec){ var k=({'Ghost':'ghost','Health Watch':'health','Garden':'garden','Foodways':'foodways'})[sec.cat]||'plain'; return '<div class="ph-sec"><div class="ph-sech">'+esc(sec.cat)+'</div><ul class="ph-list">'+sec.items.map(function(h){ return '<li><div class="ph-kind '+k+'">'+h+'</div></li>'; }).join('')+'</ul></div>'; }).join('') : '<p class="ph-empty">No microseason text for this window.</p>')+'</article>';
      var items = EV.filter(function(e){ return e.m===w.m && e.d>=w.lo && e.d<=w.hi; }).sort(function(a,b){ return (a.y-b.y)||(a.d-b.d); });
      var hist = '<article class="ph-card'+(idx===curIdx?' cur':'')+'"><div class="ph-head"><div><p class="ph-sub">On record</p><div class="ph-win">'+label+'</div></div><div class="ph-count">'+items.length+' event'+(items.length===1?'':'s')+'</div></div>'
        + (items.length ? '<ol class="ph-list">'+items.map(function(e){
            var when = e.prec==='day' ? MON[e.m-1].slice(0,3)+' '+e.d : (e.prec==='days' ? MON[e.m-1].slice(0,3)+' '+e.d+' onset' : (e.prec||''));
            return '<li><span class="ph-y">'+e.y+'</span><div><div class="ph-name">'+esc(e.t)+'</div><div class="ph-meta">'+esc(e.cat)+(when?' · '+esc(when):'')+(e.area?' · '+esc(e.area):'')+'</div>'
              + (e.meas?'<div class="ph-meta"><b>Measured:</b> '+esc(e.meas)+(e.station?' — '+esc(e.station):'')+'</div>':'')
              + (e.impact?'<div class="ph-meta">'+esc(e.impact.length>200?e.impact.slice(0,197)+'…':e.impact)+'</div>':'')
              + '<div class="ph-src">'+(e.url?'<a href="'+esc(e.url)+'" target="_blank" rel="noopener">'+esc(e.source||'source')+'</a>':esc(e.source))+(e.conf?' · confidence '+esc(e.conf):'')+'</div></div></li>';
          }).join('')+'</ol>' : '<p class="ph-empty">Nothing on record for this fortnight yet.</p>')+'</article>';
      return '<div class="ph-pair" id="ph-win-'+idx+'">'+hist+exCard+'</div>';
    }).join('');
    var ys=EV.map(function(e){ return e.y; });
    $('ph-note').textContent = EX.length+' microseasons in '+(EX.length?EX.reduce(function(n,x){ return n+x.sections.reduce(function(m,s){ return m+s.items.length; },0); },0):0)+' entries · '+EV.length+' events on the register, '+Math.min.apply(null,ys)+'–'+Math.max.apply(null,ys)+' · multi-day and seasonal events sit at their anchor date · hill dates, not valley dates.';
    function setTitle(idx){ var w=wins[idx], ex=EX[idx]; $('ph-title').textContent=(idx===curIdx?'Now: ':'')+MON[w.m-1]+' '+w.lo+'–'+(w.hi===15?15:dim(w.m))+(ex?' · '+ex.name:''); }
    function go(idx){ var el=$('ph-win-'+idx); if(el) row.scrollTo({left: el.offsetLeft - row.offsetLeft, behavior:'smooth'}); setTitle(idx); }
    var cur=curIdx; setTitle(cur);
    $('ph-prev').onclick=function(){ cur=(cur+23)%24; go(cur); };
    $('ph-next').onclick=function(){ cur=(cur+1)%24; go(cur); };
    setTimeout(function(){ var el=$('ph-win-'+curIdx); if(el) row.scrollLeft = el.offsetLeft - row.offsetLeft; }, 0);
  }

  /* ---------- iNaturalist: research-grade observations in the Hilltowns box, newest observed first ---------- */
  var INAT_BOX = {nelat:42.72799866533435, nelng:-73.7475942353335, swlat:42.23036745843211, swlng:-74.39711226427585};   /* per Laurie, 2026-09-20 */
  function fetchINat(){
    var grid=$('inat-grid'); if(!grid) return;
    var url='https://api.inaturalist.org/v1/observations?quality_grade=research&photos=true&order_by=observed_on&order=desc&per_page=24'
      +'&nelat='+INAT_BOX.nelat+'&nelng='+INAT_BOX.nelng+'&swlat='+INAT_BOX.swlat+'&swlng='+INAT_BOX.swlng;
    fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var esc=function(v){ return String(v||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
      var res=(j.results||[]);
      if(!res.length){ grid.innerHTML='<p class="ph-empty">No research-grade observations came back.</p>'; return; }
      var ICON={Aves:'🐦',Insecta:'🦋',Plantae:'🌿',Fungi:'🍄',Mammalia:'🦌',Amphibia:'🐸',Reptilia:'🐢',Arachnida:'🕷️'};
      var info=function(o){ var t=o.taxon||{}, ph=(o.photos&&o.photos[0])||null, lic=ph&&ph.license_code;
        return {t:t, name:t.preferred_common_name||t.name||'Unidentified', sci:t.preferred_common_name?t.name:'', img:(ph&&lic)?ph.url.replace('square','medium'):null, lic:lic,
                when:o.observed_on_string||o.observed_on||'', who:o.user&&(o.user.name||o.user.login)||'', where:o.place_guess||'', url:'https://www.inaturalist.org/observations/'+o.id}; };
      var withPic=res.filter(function(o){ return info(o).img; }), noPic=res.filter(function(o){ return !info(o).img; });
      grid.innerHTML = withPic.length ? withPic.map(function(o){ var d=info(o);
        return '<a class="inat" href="'+d.url+'" target="_blank" rel="noopener"><img src="'+esc(d.img)+'" alt="'+esc(d.name)+'" loading="lazy">'
          +'<div class="b"><div class="n">'+esc(d.name)+'</div>'+(d.sci?'<div class="sci">'+esc(d.sci)+'</div>':'')+'<div class="m">'+esc(d.when)+(d.where?' · '+esc(d.where):'')+(d.who?'<br>by '+esc(d.who):'')+'<br><span style="opacity:.7">photo '+esc(d.lic.toUpperCase())+'</span></div></div></a>';
      }).join('') : '<p class="ph-empty">No openly licensed photos in the latest batch.</p>';
      $('inat-list').innerHTML = noPic.length ? '<div class="inat-list">'+noPic.map(function(o){ var d=info(o);
        return '<div class="eb"><div class="img ph">'+(ICON[d.t.iconic_taxon_name]||'🔍')+'</div><div><div class="n"><a href="'+d.url+'" target="_blank" rel="noopener">'+esc(d.name)+'</a>'+(d.sci?' <span class="sci" style="font-weight:400;font-style:italic;opacity:.85">'+esc(d.sci)+'</span>':'')+'</div><div class="m">'+esc(d.when)+(d.where?' · '+esc(d.where):'')+(d.who?' · '+esc(d.who):'')+'</div></div></div>';
      }).join('')+'</div>' : '';
      $('inat-note').textContent='Showing '+res.length+' of '+(j.total_results||res.length).toLocaleString()+' research-grade observations in the box · data © iNaturalist contributors; only Creative Commons photos are displayed here, others link through.';
    }).catch(function(e){ grid.innerHTML='<p class="ph-empty">iNaturalist is unreachable right now.</p>'; status('iNaturalist: '+(e && e.message || 'fetch failed')); });
  }

  /* ---------- eBird: recent + notable sightings near Berne (key per Laurie, 2026-09-20) ---------- */
  var EBIRD_KEY='dce779eb-603d-4505-9113-a04103e6d8d5', EBIRD_DIST=25, EBIRD_BACK=14;
  function fetchEBird(){
    var grid=$('ebird-grid'), band=$('ebird-notable'); if(!grid) return;
    var base='https://api.ebird.org/v2/data/obs/geo/recent', q='?lat='+LAT.toFixed(4)+'&lng='+LNG.toFixed(4)+'&dist='+EBIRD_DIST+'&back='+EBIRD_BACK+'&maxResults=60';
    var opt={headers:{'X-eBirdApiToken':EBIRD_KEY}};
    var esc=function(v){ return String(v||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    var row=function(o,rare){ return '<div class="eb'+(rare?' rare':'')+'" data-sci="'+esc(o.sciName)+'"><div class="img ph">🐦</div><div class="c">'+(o.howMany!=null?o.howMany:'')+'</div><div><div class="n">'+esc(o.comName)+' <span class="sci" style="font-weight:400;font-style:italic;opacity:.85">'+esc(o.sciName)+'</span>'+(rare?' · <span class="ph-tag">notable</span>':'')+'</div><div class="m">'+esc((o.obsDt||'').slice(0,16))+' · '+esc(o.locName)+(o.subId?' · <a href="https://ebird.org/checklist/'+esc(o.subId)+'" target="_blank" rel="noopener">checklist</a>':'')+'</div></div></div>'; };
    Promise.all([fetch(base+'/notable'+q,opt).then(function(r){ return r.ok?r.json():[]; }).catch(function(){ return []; }),
                 fetch(base+q,opt).then(function(r){ if(!r.ok) throw new Error('eBird HTTP '+r.status); return r.json(); })])
    .then(function(res){ var notable=res[0]||[], recent=res[1]||[];
      var srt=function(a,b){ return (b.obsDt||'').localeCompare(a.obsDt||''); }; notable.sort(srt); recent.sort(srt);
      band.innerHTML = notable.length ? '<div class="eb-band"><div class="t">Notable · '+notable.length+'</div>'+notable.slice(0,12).map(function(o){ return row(o,true); }).join('')+'</div>' : '';
      var seen={}; recent=recent.filter(function(o){ var k=o.speciesCode; if(seen[k]) return false; seen[k]=1; return true; });   /* one line per species, most recent report */
      grid.innerHTML = recent.length ? '<div style="grid-column:1/-1">'+recent.map(function(o){ return row(o,false); }).join('')+'</div>' : '<p class="ph-empty">No reports in the window.</p>';
      wikiPics(); 
      $('ebird-note').textContent = recent.length+' species reported in the last '+EBIRD_BACK+' days within '+EBIRD_DIST+' km of Berne · one line per species, most recent report · data © eBird / Cornell Lab of Ornithology.';
    }).catch(function(e){ grid.innerHTML='<p class="ph-empty">eBird is unreachable right now.</p>'; status('eBird: '+(e && e.message || 'fetch failed')+' (if this says HTTP 403 the key is wrong; if it says "Failed to fetch" eBird refused the cross-site request and the feed must move to build time)'); });
  }

  function wikiPics(){
    var els=document.querySelectorAll('.eb[data-sci]'), cache={}; try{ cache=JSON.parse(sessionStorage.getItem('hfa.wiki')||'{}'); }catch(e){}
    var pending={};
    Array.prototype.forEach.call(els,function(el){ var sci=el.getAttribute('data-sci'); if(!sci) return;
      var put=function(u){ if(!u) return; var im=document.createElement('img'); im.className='img'; im.alt=''; im.loading='lazy'; im.src=u; var ph=el.querySelector('.img.ph'); if(ph) el.replaceChild(im,ph); };
      if(cache[sci]){ put(cache[sci]); return; }
      if(pending[sci]){ pending[sci].push(put); return; }
      pending[sci]=[put];
      fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(sci.replace(/ /g,'_'))).then(function(r){ return r.ok?r.json():null; }).then(function(p){
        var u=p&&p.thumbnail&&p.thumbnail.source||''; cache[sci]=u; try{ sessionStorage.setItem('hfa.wiki',JSON.stringify(cache)); }catch(e){}
        pending[sci].forEach(function(f){ f(u); });
      }).catch(function(){});
    });
  }

  function init(){ fetchINat(); fetchEBird(); renderPhenology(); renderSunMoon(); fetchWx(); fetchDD(); setInterval(renderSunMoon, 60000); setInterval(fetchWx, 15*60000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
