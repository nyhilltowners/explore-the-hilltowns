/* ===== Fuel & comfort calculator — portable bundle (v8, 2026-10-06, Laurie) =======================
   "Which heat source is cheapest here." Compares fuels by the cost of one MMBtu of DELIVERED heat
   (price / energy-content / efficiency). The heat pump's efficiency is a SEASONAL COP computed from the
   centre point's own ERA5 daily-temperature distribution (Open-Meteo archive) against a COP-vs-temperature
   curve — place-specific, because a heat pump's COP falls with the outdoor temperature. Cooling is compared
   via CDD and SEER. Energy constants are physics; the COP curves and fallback prices are a stated model,
   shown in the method note. Prices are editable; with keys.eia set, electricity + natural gas prefill live
   from EIA for the configured state (best-effort — propane/oil stay editable defaults). Self-contained:
   fetches its own climatology, no dependency on anything else on the page.

   PORTABILITY: this reads window.FUEL_CONFIG first, then falls back to window.PLACE. On the Prophetstown
   atlas (which has window.PLACE) it works as-is. On any other page, define window.FUEL_CONFIG before this
   script loads — see fuel-config.example.js for the exact shape. The ONLY config keys it touches are
   center {lat,lng,short}, timezone, keys.eia, and the whole heating {} block. ================================= */
(function(){
  var host=document.getElementById('fuel-ui'); if(!host) return;
  var P=window.FUEL_CONFIG||window.PLACE||{}, H=P.heating||{}, C=P.center||{lat:0,lng:0,short:'here'};
  var PR=(H.prices||{}), EQ=(H.equipment||{}), BASE=H.base_f||65, INST=(H.install||{});
  var EIA_KEY=(P.keys&&P.keys.eia)||'', EIA_STATE=H.eia_state||'';
  // physics
  var KWH_PER_MMBTU=1e6/3412.14, THERMS_PER_MMBTU=10, GAL_PROPANE=1/0.091452, GAL_OIL=1/0.1385;
  var COP_CURVES={ standard:[[47,3.3],[35,2.7],[17,2.1],[5,1.6],[-5,1.2]],
                   cold:    [[47,3.8],[35,3.2],[17,2.6],[5,2.1],[-5,1.7],[-15,1.4]] };
  function copAt(curve,t){ var a=COP_CURVES[curve]||COP_CURVES.cold;
    if(t>=a[0][0]) return a[0][1];
    if(t<=a[a.length-1][0]) return Math.max(1,a[a.length-1][1]);
    for(var i=0;i<a.length-1;i++){ var hi=a[i],lo=a[i+1]; if(t<=hi[0]&&t>=lo[0]){ var f=(t-lo[0])/(hi[0]-lo[0]); return Math.max(1,lo[1]+f*(hi[1]-lo[1])); } }
    return 1; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var DIST=null, HDD=null, CDD=null, YEARS=0, climateErr=null;   // temperature histogram + degree days
  function buildClimate(daily){
    var t=daily.time||[], mx=daily.temperature_2m_max||[], mn=daily.temperature_2m_min||[];
    var bins={}, hdd=0, cdd=0, days=0, y={};
    for(var i=0;i<t.length;i++){ if(mx[i]==null||mn[i]==null) continue;
      var meanC=(mx[i]+mn[i])/2, meanF=meanC*9/5+32;
      var b=Math.round(meanF/2)*2; bins[b]=(bins[b]||0)+1; days++;
      hdd+=Math.max(0,BASE-meanF); cdd+=Math.max(0,meanF-BASE); y[t[i].slice(0,4)]=1; }
    YEARS=Object.keys(y).length||1;
    DIST=Object.keys(bins).map(function(k){ return {t:+k, days:bins[k]}; }).sort(function(a,b){return a.t-b.t;});
    HDD=hdd/YEARS; CDD=cdd/YEARS;
  }
  function seasonalCOP(curve, switchover){
    var dem=0, el=0; if(!DIST) return copAt(curve,BASE);
    DIST.forEach(function(b){ var dd=Math.max(0,BASE-b.t); if(dd<=0) return;
      var cop=copAt(curve,b.t); if(switchover!=null && b.t<switchover) cop=1;
      dem+=dd*b.days; el+=dd*b.days/cop; });
    return el>0?dem/el:copAt(curve,BASE);
  }

  // ---- fuels (cost per MMBtu delivered) ----
  function val(id,dflt){ var e=document.getElementById(id); var v=e?parseFloat(e.value):NaN; return isFinite(v)?v:dflt; }
  function fuels(){
    var elec=val('f-elec',PR.elec_kwh), gas=val('f-gas',PR.gas_therm), prop=val('f-prop',PR.propane_gal), oil=val('f-oil',PR.oil_gal);
    var gA=val('f-gasafue',EQ.gas_afue)/100 || EQ.gas_afue, pA=val('f-propafue',EQ.propane_afue)/100||EQ.propane_afue, oA=val('f-oilafue',EQ.oil_afue)/100||EQ.oil_afue;
    var type=(document.getElementById('f-hptype')||{}).value||EQ.hp_type||'cold';
    var sw=val('f-switch', EQ.hp_switchover_f);
    var scop=seasonalCOP(type, sw);
    var incent=val('f-incent', INST.incentive_hp||0);
    var hpInst=Math.max(0, val('f-inst-hp', (type==='cold'?INST.hp_cold:INST.hp_standard)||0) - incent);
    var rows=[
      {key:'hp', label:(type==='cold'?'Cold-climate heat pump':'Air-source heat pump'), note:'seasonal COP '+scop.toFixed(2), cost:elec*KWH_PER_MMBTU/scop, kind:'elec', inst:hpInst},
      {key:'gas', label:'Natural gas furnace', note:(gA*100).toFixed(0)+'% AFUE', cost:gas*THERMS_PER_MMBTU/gA, kind:'gas', inst:val('f-inst-gas',INST.gas||0)},
      {key:'prop', label:'Propane furnace', note:(pA*100).toFixed(0)+'% AFUE', cost:prop*GAL_PROPANE/pA, kind:'prop', inst:val('f-inst-prop',INST.propane||0)},
      {key:'oil', label:'Fuel-oil furnace', note:(oA*100).toFixed(0)+'% AFUE', cost:oil*GAL_OIL/oA, kind:'oil', inst:val('f-inst-oil',INST.oil||0)},
      {key:'res', label:'Electric resistance', note:'baseboard / strip, COP 1', cost:elec*KWH_PER_MMBTU, kind:'elec', inst:val('f-inst-res',INST.resistance||0)}
    ];
    rows.sort(function(a,b){return a.cost-b.cost;});
    return {rows:rows, scop:scop, elec:elec, gas:gas, gA:gA, prop:prop, pA:pA, oil:oil, oA:oA, type:type, incent:incent};
  }
  var COLOR={hp:'#1b9e77',gas:'#d95f02',prop:'#7570b3',oil:'#8a5a2a',res:'#b25b45'};

  function render(){
    var F=fuels(); var max=Math.max.apply(null,F.rows.map(function(r){return r.cost;}))||1;
    var bars=F.rows.map(function(r){ var w=Math.max(2,Math.round(r.cost/max*100));
      var inst=(r.inst>0)?(' · ~$'+Math.round(r.inst).toLocaleString()+' installed'):'';
      return '<div class="fuel-bar"><div class="fuel-lab">'+esc(r.label)+' <span class="fuel-sub">'+esc(r.note)+inst+'</span></div>'
        +'<div class="fuel-track"><div class="fuel-fill" style="width:'+w+'%;background:'+COLOR[r.key]+'"></div>'
        +'<span class="fuel-amt">$'+r.cost.toFixed(0)+'<small>/MMBtu</small></span></div></div>'; }).join('');
    var cheapest=F.rows[0];
    // break-even electricity price vs the cheapest fossil option
    var fossils=F.rows.filter(function(r){return r.kind!=='elec';}).sort(function(a,b){return a.cost-b.cost;});
    var be='';
    if(fossils.length){ var cf=fossils[0]; var bePrice=cf.cost*F.scop/KWH_PER_MMBTU;
      be='<p class="sg-det" style="margin:10px 0 0">At a seasonal COP of <b>'+F.scop.toFixed(2)+'</b>, the heat pump matches '+esc(cf.label.toLowerCase())
        +' when electricity is <b>$'+bePrice.toFixed(3)+'/kWh</b> (it’s '+ (F.elec<bePrice?'cheaper':'dearer') +' at your $'+F.elec.toFixed(3)+').</p>'; }
    // cooling
    var seer=val('f-seer',EQ.seer); var coolPerMM=(1000/seer)*F.elec;
    var cool='<div class="fuel-cool"><h3 class="sg-h3" style="margin-top:16px">Cooling</h3>'
      +'<p class="sg-det" style="margin:0">At SEER '+seer.toFixed(0)+' and $'+F.elec.toFixed(3)+'/kWh, removing one MMBtu of heat costs <b>$'+coolPerMM.toFixed(2)+'</b>. '
      +'A heat pump cools at this same efficiency, so switching to one changes your heating bill, not your cooling bill. '+esc(C.short)+' averages about <b>'+Math.round(CDD).toLocaleString()+' cooling degree-days</b> a year.</p></div>';
    // optional seasonal estimate + payback
    var loadMM=val('f-load',NaN); var seasonal='', payback='';
    if(isFinite(loadMM)&&loadMM>0){
      seasonal='<div class="fuel-season"><h3 class="sg-h3" style="margin-top:16px">Your winter, estimated</h3><div class="fuel-slist">'
        +F.rows.map(function(r){ return '<div class="fuel-srow"><span>'+esc(r.label)+(r.inst>0?' <span class="fuel-sub">~$'+Math.round(r.inst).toLocaleString()+' to install</span>':'')+'</span><b>$'+Math.round(r.cost*loadMM).toLocaleString()+'/yr</b></div>'; }).join('')
        +'</div><p class="sg-det" style="margin:6px 0 0">Running cost for a '+loadMM+' MMBtu heating season (your number). The softest figure here — it rides on that load estimate.</p></div>';
      // simple payback of the heat pump vs each other method
      var hp=F.rows.filter(function(r){return r.key==='hp';})[0];
      if(hp){ var lines=F.rows.filter(function(r){return r.key!=='hp';}).map(function(r){
          var extra=hp.inst-r.inst, save=(r.cost-hp.cost)*loadMM;   // $/yr the HP saves vs r
          var verdict;
          if(save<=0) verdict='costs more to run than '+esc(r.label.toLowerCase())+' here — no payback';
          else if(extra<=0) verdict='cheaper to install <em>and</em> run than '+esc(r.label.toLowerCase());
          else { var yrs=extra/save; verdict='pays back its $'+Math.round(extra).toLocaleString()+' higher install vs '+esc(r.label.toLowerCase())+' in <b>'+(yrs<100?yrs.toFixed(1):'100+')+' yr</b>'; }
          return '<div class="fuel-srow"><span>vs '+esc(r.label)+'</span><span>'+verdict+'</span></div>'; }).join('');
        payback='<div class="fuel-pay"><h3 class="sg-h3" style="margin-top:16px">Switching to the heat pump</h3><div class="fuel-slist">'+lines
          +'</div><p class="sg-det" style="margin:6px 0 0">Simple payback = extra install cost ÷ annual running-cost saving (no discounting, no fuel-price drift, no maintenance). Install figures are rough editable defaults, not quotes.</p></div>';
      }
    }
    document.getElementById('fuel-results').innerHTML=
      '<div class="fuel-bars">'+bars+'</div>'
      +'<p class="sg-det fuel-head" style="margin:10px 0 0">Cheapest to run here: <b style="color:'+COLOR[cheapest.key]+'">'+esc(cheapest.label)+'</b> at $'+cheapest.cost.toFixed(0)+'/MMBtu delivered.</p>'
      +be+cool+seasonal+payback;
    var live=(window.__FUEL_SRC||{});
    document.getElementById('fuel-note').innerHTML='<b>Method.</b> Cost of delivered heat = price &divide; energy content &divide; efficiency; energy contents are exact (1 kWh = 3,412 BTU; 1 therm = 100,000 BTU; propane 91,452 BTU/gal; #2 oil 138,500 BTU/gal). '
      +'Seasonal COP is energy-weighted over '+esc(C.short)+'’s daily mean temperatures ('+YEARS+'-year Open-Meteo ERA5 archive, base '+BASE+'°F, '+Math.round(HDD).toLocaleString()+' HDD/yr) against a '+(F.type==='cold'?'cold-climate':'standard')+' COP curve — a model, adjustable above. '
      +'Prices: '+(live.elec?'electricity and natural gas from EIA ('+esc(EIA_STATE)+', '+esc(live.date||'latest')+')':'editable defaults ('+esc(PR.as_of||'')+')')+'; propane and fuel oil are editable defaults. Equipment efficiencies are yours to set. Installed costs are rough US ballparks ('+esc(INST.as_of||'')+'), editable — real installs vary widely by home and contractor, so get local quotes; there is no live source for them. The federal 25C heat-pump credit expired after 2025, so the rebate field defaults to $0. The running-cost ranking is exact for the prices and efficiencies shown; the COP curve, install costs and any seasonal-dollar or payback figure are estimates.';
  }

  function num(id,v,step,min,max){ return '<input id="'+id+'" type="number" value="'+v+'" step="'+step+'"'+(min!=null?' min="'+min+'"':'')+(max!=null?' max="'+max+'"':'')+' inputmode="decimal">'; }
  function build(){
    host.innerHTML=
      '<div class="fuel-grid">'
      +'<label>Electricity <span>$/kWh</span>'+num('f-elec',PR.elec_kwh,0.001,0)+'</label>'
      +'<label>Natural gas <span>$/therm</span>'+num('f-gas',PR.gas_therm,0.01,0)+'</label>'
      +'<label>Propane <span>$/gal</span>'+num('f-prop',PR.propane_gal,0.01,0)+'</label>'
      +'<label>Fuel oil <span>$/gal</span>'+num('f-oil',PR.oil_gal,0.01,0)+'</label>'
      +'<label>Heat pump <span>type</span><select id="f-hptype"><option value="cold"'+(EQ.hp_type!=='standard'?' selected':'')+'>Cold-climate</option><option value="standard"'+(EQ.hp_type==='standard'?' selected':'')+'>Standard</option></select></label>'
      +'<label>HP backup below <span>°F</span>'+num('f-switch',EQ.hp_switchover_f,1)+'</label>'
      +'<label>Gas furnace <span>% AFUE</span>'+num('f-gasafue',Math.round(EQ.gas_afue*100),1,50,100)+'</label>'
      +'<label>Propane <span>% AFUE</span>'+num('f-propafue',Math.round(EQ.propane_afue*100),1,50,100)+'</label>'
      +'<label>Fuel oil <span>% AFUE</span>'+num('f-oilafue',Math.round(EQ.oil_afue*100),1,50,100)+'</label>'
      +'<label>Central AC/HP <span>SEER</span>'+num('f-seer',EQ.seer,0.5,8)+'</label>'
      +'<label>Your heating load <span>MMBtu/yr (optional)</span>'+num('f-load','',1,0)+'</label>'
      +'</div>'
      +'<details class="fuel-install"><summary>Installed costs &amp; incentives (editable &mdash; rough US ballparks, '+esc(INST.as_of||'')+')</summary><div class="fuel-grid">'
      +'<label>Heat pump <span>$ installed</span>'+num('f-inst-hp',(EQ.hp_type==='standard'?INST.hp_standard:INST.hp_cold)||0,100,0)+'</label>'
      +'<label>Heat-pump rebate <span>$ (25C expired after 2025)</span>'+num('f-incent',INST.incentive_hp||0,100,0)+'</label>'
      +'<label>Gas furnace <span>$ installed</span>'+num('f-inst-gas',INST.gas||0,100,0)+'</label>'
      +'<label>Propane furnace <span>$ installed</span>'+num('f-inst-prop',INST.propane||0,100,0)+'</label>'
      +'<label>Fuel-oil furnace <span>$ installed</span>'+num('f-inst-oil',INST.oil||0,100,0)+'</label>'
      +'<label>Electric resistance <span>$ installed</span>'+num('f-inst-res',INST.resistance||0,100,0)+'</label>'
      +'</div></details>'
      +'<div id="fuel-results"></div>';
    host.querySelectorAll('input,select').forEach(function(el){ el.addEventListener('input', render); el.addEventListener('change', render); });
    render();
  }

  // EIA best-effort prefill (electricity + natural gas), then defaults either way.
  function eiaPrefill(done){
    if(!EIA_KEY || !EIA_STATE){ done(); return; }
    window.__FUEL_SRC={};
    var k=encodeURIComponent(EIA_KEY), st=encodeURIComponent(EIA_STATE), got=0, want=2, date='';
    function fin(){ if(++got>=want) done(); }
    // electricity residential, cents/kWh -> $/kWh
    fetch('https://api.eia.gov/v2/electricity/retail-sales/data/?api_key='+k+'&frequency=monthly&data[0]=price&facets[stateid][]='+st+'&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=1')
      .then(function(r){return r.ok?r.json():null;}).then(function(j){ try{ var row=j.response.data[0]; if(row&&row.price){ PR.elec_kwh=+(row.price/100).toFixed(3); window.__FUEL_SRC.elec=1; date=row.period||date; } }catch(e){} fin(); }, fin);
    // natural gas residential $/Mcf -> $/therm (1 Mcf ~ 10.37 therm)
    fetch('https://api.eia.gov/v2/natural-gas/pri/sum/data/?api_key='+k+'&frequency=monthly&data[0]=value&facets[process][]=PRS&facets[duoarea][]=S'+st+'&sort[0][column]=period&sort[0][direction]=desc&length=1')
      .then(function(r){return r.ok?r.json():null;}).then(function(j){ try{ var row=j.response.data[0]; if(row&&row.value){ PR.gas_therm=+(row.value/10.37).toFixed(3); window.__FUEL_SRC.gas=1; date=row.period||date; } }catch(e){} window.__FUEL_SRC.date=date; fin(); }, fin);
  }

  var lat=(C.lat||0).toFixed(3), lng=(C.lng||0).toFixed(3);
  var end=new Date(Date.now()-3*86400000), start=new Date(end.getTime()-20*365.25*86400000);
  var iso=function(d){ return d.toISOString().slice(0,10); };
  var arch='https://archive-api.open-meteo.com/v1/archive?latitude='+lat+'&longitude='+lng
    +'&start_date='+iso(start)+'&end_date='+iso(end)+'&daily=temperature_2m_max,temperature_2m_min&temperature_unit=celsius&timezone='+encodeURIComponent(P.timezone||'UTC');
  fetch(arch).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(j){ if(!j.daily||!j.daily.time||!j.daily.time.length) throw new Error('no climate data'); buildClimate(j.daily); eiaPrefill(build); })
    .catch(function(e){ climateErr=(e&&e.message)||'fetch failed';
      var el=document.getElementById('fuel-loading'); if(el) el.textContent='The heating-climate data (Open-Meteo archive) couldn’t load just now ('+climateErr+') — the fuel comparison needs it; it will work on the live site or on reload.'; });
})();
