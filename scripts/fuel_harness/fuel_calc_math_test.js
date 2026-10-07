// Unit-test the fuel/comfort math core in isolation before wiring any UI.
// Physics constants are exact; COP curves are a stated model.
var BTU_PER_KWH=3412.14, KWH_PER_MMBTU=1e6/BTU_PER_KWH;        // 293.07
var THERMS_PER_MMBTU=10;                                        // 1 therm = 1e5 BTU
var MMBTU_PER_GAL_PROPANE=0.091452, MMBTU_PER_GAL_OIL=0.1385;  // #2 fuel oil
var GAL_PROPANE_PER_MMBTU=1/MMBTU_PER_GAL_PROPANE;             // 10.934
var GAL_OIL_PER_MMBTU=1/MMBTU_PER_GAL_OIL;                     // 7.220

// $ per MMBtu of DELIVERED heat
function costHeatPump(elecPerKwh, scop){ return elecPerKwh*KWH_PER_MMBTU/scop; }
function costResistance(elecPerKwh){ return elecPerKwh*KWH_PER_MMBTU/1.0; }
function costGas(perTherm, afue){ return perTherm*THERMS_PER_MMBTU/afue; }
function costPropane(perGal, afue){ return perGal*GAL_PROPANE_PER_MMBTU/afue; }
function costOil(perGal, afue){ return perGal*GAL_OIL_PER_MMBTU/afue; }

// COP vs outdoor temperature (°F), piecewise-linear from anchor points, clamped.
var COP_CURVES={
  standard:[[47,3.3],[35,2.7],[17,2.1],[5,1.6],[-5,1.2]],
  cold:    [[47,3.8],[35,3.2],[17,2.6],[5,2.1],[-5,1.7],[-15,1.4]]
};
function copAt(curve, tF){
  var a=COP_CURVES[curve];
  if(tF>=a[0][0]) return a[0][1];
  if(tF<=a[a.length-1][0]) return Math.max(1.0, a[a.length-1][1]);
  for(var i=0;i<a.length-1;i++){ var hi=a[i], lo=a[i+1];
    if(tF<=hi[0] && tF>=lo[0]){ var f=(tF-lo[0])/(hi[0]-lo[0]); return Math.max(1.0, lo[1]+f*(hi[1]-lo[1])); } }
  return 1.0;
}
// Seasonal COP: energy-weighted over the heating degree-day distribution.
// dist: array of {t:midpointF, days:count}. base: heating base temp (°F). switchover: below this, resistance backup (COP→blends to 1).
function seasonalCOP(dist, curve, base, switchover){
  var demand=0, elec=0;
  dist.forEach(function(b){
    var dd=Math.max(0, base-b.t); if(dd<=0) return;
    var cop=copAt(curve, b.t);
    if(switchover!=null && b.t<switchover) cop=1.0;    // pure resistance backup below switchover
    demand += dd*b.days;
    elec   += (dd*b.days)/cop;
  });
  return elec>0 ? demand/elec : copAt(curve, base);
}
// Cooling: SEER (BTU/Wh) → $ per MMBtu of cooling removed.
function costCoolingPerMMBtu(elecPerKwh, seer){ return (1000/seer)*elecPerKwh; }  // kWh/MMBtu = 1e6/seer/1000

// ---- tests ----
function approx(a,b,tol,label){ var ok=Math.abs(a-b)<=tol; console.log((ok?'ok  ':'FAIL')+' '+label+'  got '+a.toFixed(3)+' exp ~'+b); if(!ok) process.exitCode=1; }
approx(KWH_PER_MMBTU,293.07,0.01,'kWh/MMBtu');
approx(GAL_PROPANE_PER_MMBTU,10.934,0.01,'gal propane/MMBtu');
approx(GAL_OIL_PER_MMBTU,7.220,0.01,'gal oil/MMBtu');
approx(costHeatPump(0.14,2.5),16.42,0.05,'HP $0.14/2.5');
approx(costResistance(0.14),41.03,0.05,'resistance $0.14');
approx(costGas(1.20,0.95),12.63,0.05,'gas $1.20/.95');
approx(costPropane(2.50,0.90),30.37,0.05,'propane $2.50/.90');
approx(costOil(3.80,0.85),32.28,0.05,'oil $3.80/.85');
approx(copAt('standard',47),3.3,0.001,'cop std 47');
approx(copAt('standard',26),2.4,0.001,'cop std 26 (interp 35->17)');
approx(copAt('standard',-20),1.2,0.001,'cop std -20 (clamped)');
approx(copAt('cold',5),2.1,0.001,'cop cold 5');
// SCOP on a synthetic distribution: mild winter (most days 30-45F) vs cold (lots <20F)
var mild=[{t:42,days:40},{t:35,days:40},{t:28,days:30},{t:20,days:15},{t:10,days:5}];
var cold=[{t:42,days:15},{t:35,days:30},{t:28,days:35},{t:20,days:40},{t:10,days:25},{t:0,days:15},{t:-10,days:5}];
var sMild=seasonalCOP(mild,'cold',65,null), sCold=seasonalCOP(cold,'cold',65,null);
console.log('SCOP cold-climate HP: mild winter',sMild.toFixed(2),'| cold winter',sCold.toFixed(2));
if(!(sMild>sCold)) { console.log('FAIL: milder climate should give higher SCOP'); process.exitCode=1; } else console.log('ok   milder climate -> higher SCOP');
// break-even elec price where HP ties gas
var scop=sCold, gas=costGas(1.20,0.95);
var be=gas*scop/KWH_PER_MMBTU;
console.log('break-even $/kWh vs $1.20 gas at SCOP',scop.toFixed(2),'=',be.toFixed(3));
approx(costHeatPump(be,scop),gas,0.02,'break-even identity');
approx(costCoolingPerMMBtu(0.14,15),9.33,0.05,'cooling SEER15 $0.14');
console.log('exit',process.exitCode||0);
