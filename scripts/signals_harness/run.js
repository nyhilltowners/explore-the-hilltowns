// Headless reproduction of the Signals water section with USGS mocked.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = process.argv[2] || '/home/claude/atlas/site';
const OUT = process.argv[3] || 'shot.png';
const http = require('http');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isFile()) { res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); }
  else { res.writeHead(404); res.end(); }
}).listen(8765);

function ts(name, code, lat, lng, siteNo, vals, stc) {
  const now = Date.now();
  return { sourceInfo: { siteName: name, siteCode: [{ value: siteNo }], siteProperty: stc?[{name:'siteTypeCd', value:stc}]:[], geoLocation: { geogLocation: { latitude: lat, longitude: lng } } },
    variable: { variableCode: [{ value: code }] },
    values: [{ value: vals.map((v, i) => ({ value: String(v), dateTime: new Date(now - (vals.length - 1 - i) * 3600000).toISOString() })) }] };
}
const fixture = { value: { timeSeries: [
  ts('NORMANS KILL AT KARLSFELD NY', '00065', 42.65, -73.85, '01359525', [8.5, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5]),
  ts('HUDSON RIVER AT GREEN ISLAND NY', '00060', 42.75, -73.69, '01358000', [7000, 6900, 6800, 6700, 6600, 6500, 6470]),
  ts('HUDSON RIVER AT GREEN ISLAND NY', '00065', 42.75, -73.69, '01358000', [16.5, 16.4, 16.3, 16.2, 16.1, 16.05, 16.02]),
  ts('FOX CREEK NEAR SCHOHARIE NY', '00060', 42.66, -74.32, '01351200', [18, 18.5, 19, 19.5, 20, 20.5, 20.9]),
  ts('FOX CREEK NEAR SCHOHARIE NY', '00065', 42.66, -74.32, '01351200', [2.07, 2.07, 2.07, 2.07, 2.07, 2.07, 2.07]),
  ts('LITTLE SCHOHARIE CREEK NEAR MIDDLEBURGH NY', '00060', 42.59, -74.31, '01350480', [5.2, 5.1, 5.0, 4.9, 4.85, 4.8, 4.75]),
  ts('SCHOHARIE CREEK AT SCHOHARIE NY', '00065', 42.67, -74.31, '01350750', [4.56, 4.56, 4.56, 4.56, 4.56, 4.56, 4.56]),
  ts('HUDSON RIVER AT PORT OF ALBANY NY', '62620', 42.6195, -73.7589, '01359165', [1.2,1.8,2.4,2.9,3.1,2.8,2.2], 'ST-TS'),
  ts('HUDSON RIVER AT PORT OF ALBANY NY', '00010', 42.6195, -73.7589, '01359165', [18,18,18.1,18.1,18.2,18.2,18.2], 'ST-TS'),
  (function(){ const t=ts('HUDSON RIVER BELOW POUGHKEEPSIE NY', '62620', 41.65, -73.95, '01372058', [1,1,1,1,1,1,1], 'ES'); t.values[0].value.forEach(v=>{ v.value='-999999'; v.qualifiers=['P','Eqp']; }); return t; })(),
  ts('SCHOHARIE RESERVOIR NEAR GRAND GORGE NY', '62615', 42.38, -74.45, '01350100', [1128.3,1128.35,1128.4,1128.42,1128.45,1128.47,1128.49]),
  ts('DIVERSION FROM SCHOHARIE RESERVOIR NY', '00060', 42.11, -74.38, '01362230', [170,171,172,172,173,173,173]),
  ts('SCHOHARIE CREEK AT PRATTSVILLE NY', '00060', 42.32, -74.44, '01350000', [40,40,41,41,42,42,42]),
  ts('SCHOHARIE RESERVOIR OLDFIXTURE', '62615', 42.38, -74.45, '01350199', [1128.3, 1128.35, 1128.4, 1128.42, 1128.45, 1128.47, 1128.49]),
  ts('SARATOGA LAKE AT STATE HWY 9P AT SARATOGA LAKE NY', '62615', 43.02, -73.73, '01329490', [202.85, 202.85, 202.85, 202.85, 202.85, 202.85, 202.85]),
  ts('Local number, Sc-1234, Middleburgh NY', '72019', 42.60, -74.33, '423600074200001', [9.33, 9.33, 9.33, 9.33, 9.33, 9.33, 9.33]),
  ts('Local number, S-567, Schenectady NY', '72019', 42.81, -73.94, '424900073560001', [8.68, 8.68, 8.68, 8.68, 8.68, 8.68, 8.68]),
  ts('Local number, A-89, SUNY Albany NY', '72019', 42.69, -73.82, '424100073490001', [8.82, 8.82, 8.82, 8.82, 8.82, 8.82, 8.82]),
] } };
// RDB stats for a few sites, today's month/day
const d = new Date(), m = d.getMonth() + 1, dd = d.getDate();
const rdb = ['# stats', 'agency_cd\tsite_no\tparameter_cd\tts_id\tloc_web_ds\tmonth_nu\tday_nu\tbegin_yr\tend_yr\tcount_nu\tmax_va_yr\tmax_va\tmin_va_yr\tmin_va\tmean_va', '5s\t15s\t5s\t3n\t15s\t3n\t3n\t4n\t4n\t3n\t4n\t12n\t4n\t12n\t12n',
  `USGS\t01359135\t00065\t1\t\t${m}\t${dd}\t2015\t2025\t10\t2018\t9.46\t2020\t8.16\t8.55`,
  `USGS\t01358000\t00060\t1\t\t${m}\t${dd}\t1946\t2025\t79\t1975\t59100\t1964\t1960\t7780`,
  `USGS\t01351600\t00060\t1\t\t${m}\t${dd}\t2018\t2025\t7\t2021\t183\t2020\t1.27\t63`,
  `USGS\t01351600\t00065\t1\t\t${m}\t${dd}\t2018\t2025\t7\t2021\t3.9\t2020\t1.6\t2.3`,
  `USGS\t01358000\t00065\t1\t\t${m}\t${dd}\t1946\t2025\t79\t1975\t24.1\t1964\t14.2\t16.4`,
  `USGS\t01350101\t62615\t1\t\t${m}\t${dd}\t1990\t2025\t35\t2011\t1132.1\t2016\t1105.4\t1122.7`,
  `USGS\t01351500\t00065\t1\t\t${m}\t${dd}\t2018\t2025\t7\t2018\t7.46\t2024\t4.40\t5.51`,
  `USGS\t423600074200001\t72019\t1\t\t${m}\t${dd}\t2007\t2025\t18\t2010\t9.92\t2025\t8.76\t9.47`,
  `USGS\t424900073560001\t72019\t1\t\t${m}\t${dd}\t2004\t2025\t21\t2012\t9.5\t2011\t6.1\t8.02`,
].join('\n');

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => logs.push('[console.' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('maplibre-gl.min.js')) return route.fulfill({ path: path.join(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl.js'), contentType: 'application/javascript' });
    if (u.includes('maplibre-gl.min.css')) return route.fulfill({ path: path.join(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl.css'), contentType: 'text/css' });

    /* v1010: modern USGS API mocks — built FROM the legacy fixtures so the two stay in step */
    if (u.includes('api.waterdata.usgs.gov/ogcapi/v1/collections/monitoring-locations/items')) {
      const feats=[]; const seen={}; fixture.value.timeSeries.forEach(t=>{ const sn=t.sourceInfo.siteCode[0].value; if(seen[sn]) return; seen[sn]=1; const g=t.sourceInfo.geoLocation.geogLocation; let stc=''; (t.sourceInfo.siteProperty||[]).forEach(p=>{ if(p.name==='siteTypeCd') stc=p.value; });
        feats.push({type:'Feature', id:'USGS-'+sn, geometry:{type:'Point', coordinates:[g.longitude, g.latitude]}, properties:{monitoring_location_id:'USGS-'+sn, monitoring_location_name:t.sourceInfo.siteName, site_type_code:stc||(sn.length>=15?'GW':'ST'), altitude: sn.length>=15 ? 300+Number(sn.slice(0,3))%40 : 100}}); });
      return route.fulfill({ json:{ type:'FeatureCollection', features:feats, links:[] } });
    }
    if (u.includes('api.waterdata.usgs.gov/ogcapi/v1/collections/continuous/items')) {
      const dec=decodeURIComponent(u); const period=(dec.match(/datetime=(P\d+D)/)||['','P1D'])[1]; const now=Date.now();
      const want=(dec.match(/monitoring_location_id IN \(([^)]*)\)/)||[])[1]; const ids=want?want.replace(/'/g,'').split(',').map(x=>x.replace('USGS-','')):null;
      const codesM=(dec.match(/parameter_code IN \(([^)]*)\)/)||[])[1]; const codes=codesM?codesM.replace(/'/g,'').split(','):null;
      const feats=[];
      if(period==='P7D'){ const N=7*24*4; const pts=(sn,code,fn)=>{ for(let i=0;i<N;i++) feats.push({type:'Feature', geometry:{type:'Point',coordinates:[-74,42]}, properties:{monitoring_location_id:'USGS-'+sn, parameter_code:code, time:new Date(now-(N-i)*900000).toISOString(), value:fn(i/N), qualifier:null}}); };
        (ids||[]).forEach((sn,k)=>{ if(sn==='01372058') return; if(sn.length>=15) pts(sn,'72019',f=>9.3+0.15*Math.sin(f*6)+(k%3)*0.05); else if(sn==='01350100'||sn==='01329490'||sn==='01350199') pts(sn,'62615',f=>1128+0.5*f); else if(sn==='01359165') pts(sn,'62620',f=>1.5+2*Math.sin(f*7*2*Math.PI*1.93)); else pts(sn,'00065',f=>3.8-0.2*f+(f>0.85?(f-0.85)*7*(1+k%4):0)); });
      } else {
        fixture.value.timeSeries.forEach(t=>{ const sn=t.sourceInfo.siteCode[0].value, code=t.variable.variableCode[0].value; if(ids && ids.indexOf(sn)<0) return; if(!ids && !/bbox=/.test(dec)) return; if(codes && codes.indexOf(code)<0) return; const g=t.sourceInfo.geoLocation.geogLocation;
          t.values[0].value.forEach(v=>{ feats.push({type:'Feature', geometry:{type:'Point',coordinates:[g.longitude,g.latitude]}, properties:{monitoring_location_id:'USGS-'+sn, parameter_code:code, time:v.dateTime, value:(v.value==='-999999'?null:Number(v.value)), qualifier:(v.qualifiers||[]).join(',')||null}}); }); });
      }
      return route.fulfill({ json:{ type:'FeatureCollection', features:feats, numberReturned:feats.length, links:[] } });
    }
    if (u.includes('api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items')) {
      const dec=decodeURIComponent(u); const sn=((dec.match(/monitoring_location_id IN \(([^)]*)\)/)||[])[1]||'').replace(/'/g,'').replace('USGS-',''); const codes=((dec.match(/parameter_code IN \(([^)]*)\)/)||[])[1]||'').replace(/'/g,'').split(',').filter(Boolean);
      const feats=[]; const now=Date.now(); codes.forEach(c=>{ for(let i=0;i<30;i++) feats.push({type:'Feature', properties:{monitoring_location_id:'USGS-'+sn, parameter_code:c, statistic_id:'00003', time:new Date(now-i*86400000).toISOString().slice(0,10), value:1+Math.sin(i/9)*0.6+i/300}}); });
      return route.fulfill({ json:{ type:'FeatureCollection', features:feats, links:[] } });
    }
    if (u.includes('api.waterdata.usgs.gov/statistics/v0/observationNormals')) {
      const dec=decodeURIComponent(u); const sn=(dec.match(/monitoring_location_id=USGS-([^&]+)/)||['',''])[1]; const codes=((dec.match(/parameter_code=([^&]+)/)||['',''])[1]).split(',');
      const d=new Date(); const items=[]; codes.forEach(c=>{ [['arithmetic_mean',10.5,''],['maximum',40.2,'2011'],['minimum',1.1,'1964']].forEach(([ct,v,yr])=>{ items.push({monitoring_location_id:'USGS-'+sn, parameter_code:c, month:d.getMonth()+1, day:d.getDate(), computation_type:ct, value:v, year:yr, begin_year:'1950', end_year:'2025'}); }); });
      return route.fulfill({ json:{ items } });
    }
    if (u.includes('waterservices.usgs.gov/nwis/iv') && u.includes('period=P7D')) {
      const sites=(u.match(/sites=([^&]+)/)||['',''])[1].split(','); const now=Date.now(); const N=7*24*4;
      const mk=(sn,code,fn)=>({ sourceInfo:{siteName:'X',siteCode:[{value:sn}],geoLocation:{geogLocation:{latitude:42,longitude:-74}}}, variable:{variableCode:[{value:code}]}, values:[{ value: Array.from({length:N},(_,i)=>({value:String(fn(i/N)), dateTime:new Date(now-(N-i)*900000).toISOString()})) }] });
      const ts=[]; sites.forEach((sn,k)=>{ if(sn==='01372058') return; if(sn.length>=15) ts.push(mk(sn,'72019',f=>9.3+0.15*Math.sin(f*6)+(k%3)*0.05));
        else if(sn==='01350100'||sn==='01329490'||sn==='01350199') ts.push(mk(sn,'62615',f=>1128+0.5*f));
        else if(sn==='01359165') ts.push(mk(sn,'62620',f=>1.5+2*Math.sin(f*7*2*Math.PI*1.93)));
        else ts.push(mk(sn,'00065',f=>3.8-0.2*f+(f>0.85?(f-0.85)*7*(1+k%4):0))); });
      return route.fulfill({ json:{ value:{ timeSeries: ts } } });
    }
    if (u.includes('waterservices.usgs.gov/nwis/iv') && u.includes('period=P30D')) { const m=u.match(/sites=([^&]+)/); const sn=m?m[1]:''; const codes=(u.match(/parameterCd=([^&]+)/)||['',''])[1].split(','); const now=Date.now(); return route.fulfill({ json:{ value:{ timeSeries: codes.map(c=>({ sourceInfo:{siteName:'X',siteCode:[{value:sn}],geoLocation:{geogLocation:{latitude:42,longitude:-74}}}, variable:{variableCode:[{value:c}]}, values:[{ value: Array.from({length:120},(_,i)=>({value:String(1+Math.sin(i/9)*0.6+i/300), dateTime:new Date(now-(120-i)*6*3600000).toISOString()})) }] })) } } }); }
    if (u.includes('waterservices.usgs.gov/')) return route.fulfill({ status:503, body:'Service Unavailable' });   /* v1010: legacy is dead; only the modern API answers */
    if (u.includes('archive-api.open-meteo.com')) { const t=[],mx=[],mn=[],pp=[],rr=[],ss=[]; const start=Date.UTC(2024,0,1), end=Date.now()-86400000; for(let d=start; d<=end; d+=86400000){ const dt=new Date(d); t.push(dt.toISOString().slice(0,10)); const doy=(d-Date.UTC(dt.getUTCFullYear(),0,1))/86400000; mx.push(50+30*Math.sin((doy-100)/58)); mn.push(35+30*Math.sin((doy-100)/58)); const p=(doy%5===0)?0.4:0; pp.push(p); rr.push(p); ss.push(0); } const daily=u.includes('precipitation_sum')?{time:t,precipitation_sum:pp,rain_sum:rr,snowfall_sum:ss}:{time:t,temperature_2m_max:mx,temperature_2m_min:mn}; return route.fulfill({ json:{ daily } }); }
    if (u.includes('api.inaturalist.org')) {
      const mk=(id,name,sci,iconic,anc,daysAgo)=>({id, taxon:{name:sci, preferred_common_name:name, iconic_taxon_name:iconic, ancestor_ids:anc}, photos:[{url:'https://x/square.jpg', license_code:null}], time_observed_at:new Date(Date.now()-daysAgo*86400000).toISOString(), user:{login:'obs'}, place_guess:'Berne, NY'});
      const A=[48460,1,2,355675,3,7251,8021], P=[48460,47126,211194,47125,47124,47604], I=[48460,1,47120,372739,47158,47201,47222];
      const recent=[mk(1,'Blue Jay','Cyanocitta cristata','Aves',A,1),mk(2,'Goldenrod','Solidago canadensis','Plantae',P,1),mk(3,'Bumblebee','Bombus impatiens','Insecta',I,2),mk(4,'Goldenrod','Solidago canadensis','Plantae',P,3),mk(5,'Blue Jay','Cyanocitta cristata','Aves',A,4)];
      const older=[mk(6,'Goldenrod','Solidago canadensis','Plantae',P,7),mk(7,'Monarch','Danaus plexippus','Insecta',I.slice(0,4).concat([47157]),8),mk(8,'Goldenrod','Solidago canadensis','Plantae',P,9)];
      return route.fulfill({ json:{ results: u.includes('d2=') ? older : recent } });
    }
    if (u.includes('en.wikipedia.org/api/rest_v1/page/summary')) return route.fulfill({ json:{ thumbnail:{ source:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/320px-Test.jpg' } } });
    if (u.includes('waterservices.usgs.gov/nwis/site')) return route.fulfill({ body: ['# site', 'agency_cd\tsite_no\tstation_nm\talt_va\talt_datum_cd', '5s\t15s\t50s\t8s\t10s', 'USGS\t423600074200001\tMiddleburgh well\t720\tNAVD88', 'USGS\t01350000\tPrattsville\t1120\tNAVD88', 'USGS\t01359165\tPort\t0\tNAVD88', 'USGS\t424900073560001\tSchenectady well\t260\tNAVD88', 'USGS\t424100073490001\tSUNY well\t305\tNAVD88'].join('\n'), contentType: 'text/plain' });
    if (u.includes('waterservices.usgs.gov/nwis/stat')) return route.fulfill({ body: rdb, contentType: 'text/plain' });
    if (u.startsWith('http://localhost:8765') || u.includes('arcgisonline') || u.includes('openfreemap.org')) return route.continue();
    return route.abort();   // every other third-party call (Open-Meteo, eBird, iNat, fonts) — not under test
  });
  await page.goto('http://localhost:8765/signals.html');
  await page.waitForTimeout(6000);
  console.log('usgs:', await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/usgs/.test(n)).map(n=>n.replace(/^https:\/\/[^/]+/,'').slice(0,70)).join('\n  ')));
  console.log('panel-text:', await page.evaluate(()=>{ const p=[...document.querySelectorAll('.w7-panel')].find(x=>x.innerText.trim()); return p?p.innerText.replace(/\n/g,' / ').slice(0,500):'none'; }));

  const info = await page.evaluate(() => ({
    markers: document.querySelectorAll('.maplibregl-marker').length,
    pins: document.querySelectorAll('.wpin').length,
    canvas: !!document.querySelector('#water-map canvas'),
    mapH: document.getElementById('water-map') && document.getElementById('water-map').getBoundingClientRect().height,
    cards: document.querySelectorAll('.w7-block').length
  }));
  console.log(JSON.stringify(info));
  console.log(logs.filter(l => !/net::ERR|Failed to load resource/.test(l)).join('\n'));
  const pins = await page.$$('.wpin'); if (pins.length) { await pins[0].click({force:true}); await page.waitForTimeout(600); }
  const popTxt = await page.evaluate(() => { const p = document.querySelector('.maplibregl-popup-content'); if (!p) return 'NO POPUP'; const b = p.querySelector('.wpop b'); return getComputedStyle(b).color + ' | ' + p.innerText.slice(0, 80); });
  console.log('popup:', popTxt);
  await page.click('#w7-schoharie', {position:{x:600,y:100}}); await page.waitForTimeout(300); console.log('panel:', await page.evaluate(() => { const p=document.getElementById('w7-schoharie-panel'); return p.className+' || '+p.innerText.replace(/\n/g,' / ').slice(0,420)+' || hot='+document.querySelectorAll('.wpin.hot').length; }));
  console.log('status:', await page.evaluate(()=>(document.getElementById('sg-status')||{}).textContent||''));
  console.log('w7:', await page.evaluate(() => ['w7-schoharie','w7-mohawk','w7-hudson','w7-esopus','w7-tidal','w7-wells','w7-lakes'].map(id => id+'='+document.querySelectorAll('#'+id+' polyline').length).join(' ')));
  /* v978: step through the chain with the ‹ › buttons and report the order visited */
  console.log('step:', await page.evaluate(async()=>{ const p=document.getElementById('w7-schoharie-panel'); const seen=[]; for(let i=0;i<7;i++){ const b=p.querySelector('.wstep button:last-child'); if(!b) return 'no stepper'; b.click(); seen.push(p.getAttribute('data-site')); } const back=p.querySelector('.wstep button:first-child'); back.click(); seen.push('back→'+p.getAttribute('data-site')); return seen.join(' ')+' | pinned='+p.classList.contains('pinned'); }));
  const w7=await page.$('#w7-schoharie'); if(w7){ await w7.hover({position:{x:600,y:120}}); await page.waitForTimeout(300); console.log('w7tip:', await page.evaluate(()=>document.getElementById('w7-schoharie-tip').textContent)); await w7.screenshot({path:'w7.png'}); }
  console.log('picker:', await page.evaluate(() => { const s=document.getElementById('st-pick'); return s ? [s.value, s.options.length, [...s.options].slice(0,3).map(o=>o.textContent).join(' | ')] : 'NO PICKER'; }));
  console.log('ytd:', await page.evaluate(() => ['w-p','w-p-d','w-s','w-s-d','w-x','w-x-d','st-note'].map(id => document.getElementById(id).textContent).join(' || ')));
  console.log('leaderboard:', await page.evaluate(() => [...document.querySelectorAll('.inat-older .eb')].map(r => r.innerText.replace(/\n/g,' / ')).join(' || ')));
  const lb = await page.$('#inat-list'); if (lb) await lb.screenshot({ path: 'leaderboard.png' });
  const el = await page.$('#water-map');
  const sec = await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(x => /Water levels/.test(x.textContent)); return h ? h.getBoundingClientRect().top + window.scrollY : 0; });
  await page.evaluate((y)=>window.scrollTo(0,y-10), sec); await page.waitForTimeout(4000); await page.screenshot({ path: OUT });
  await browser.close(); srv.close();
})();
