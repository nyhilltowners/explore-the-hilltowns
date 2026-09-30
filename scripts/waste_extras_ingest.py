"""Ingest four DEC exports into 'Waste & Contamination': Waste Tire Abatement Sites, Title V Emissions Inventory,
SPDES MSGP facilities, PWL estuary segments. Usage: python3 scripts/waste_extras_ingest.py v968
Idempotent by (name, rounded coords). Visibility: footprint bbox OR major class (tire dumps always; Title V by emission thresholds)."""
import csv,re,sys,collections,openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from shapely import wkt
csv.field_size_limit(10**9)
ver=sys.argv[1] if len(sys.argv)>1 else 'v968'; D='data/layers/dec_waste_extras/'
BOX=lambda lat,lon: 41.9<=lat<=43.2 and -75.1<=lon<=-73.3
cl=lambda s: ILLEGAL_CHARACTERS_RE.sub('',re.sub(r'\s+',' ',str(s or ''))).strip()
def num(x):
    try: return float(str(x).replace(',',''))
    except: return 0.0
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p); ws=wb['Waste & Contamination']; h={c.value:c.column for c in ws[1] if c.value}
existing={(str(ws.cell(r,2).value).lower(),round(float(ws.cell(r,h['Latitude']).value or 0),3)) for r in range(2,ws.max_row+1) if ws.cell(r,2).value}
stats=collections.Counter()
def add(name,tags,addr,lat,lon,glyph,notes,show,anchor='exact',phone=''):
    key=(name.lower(),round(lat,3))
    if key in existing: stats['skipped']+=1; return
    row=ws.max_row+1
    for k,v in {'Name':name,'Tags':tags,'Address':addr,'Latitude':round(lat,6),'Longitude':round(lon,6),'Phone':phone,'Glyph':glyph,'Notes':notes,'Display':show,'Anchor Type':anchor}.items(): ws.cell(row,h[k]).value=v
    existing.add(key); stats['added']+=1; stats['visible']+=show=='Yes'
prov=lambda src: f"2026-09-28: added per Laurie ({ver}) from NYSDEC {src} (data.ny.gov export 2026-09-28)."
# 1. Waste tire abatement sites — legacy dumps, all visible
for r in csv.DictReader(open(D+'Waste_Tire_Abatement_Sites_20260928.csv',encoding='utf-8-sig')):
    lat,lon=num(r['Latitude']),num(r['Longitude'])
    if not lat: continue
    tires=cl(r['Est. Number of Tires']); status=cl(r['Status'])
    flags=[k for k in ['Primary Aquifer','Stream','Wetland','Environmental Justice Areas','School','Hospital','Population Center'] if r[k]=='Yes']
    name=f"{cl(r['Noncompliant Site Name'])} — waste tire dump ({status.lower()}{', ~'+tires+' tires' if tires else ''})"
    tags='; '.join(['Waste & Contamination','Legacy Site','Waste Tire Dump',status,f"{cl(r['County'])} County",cl(r['City/Town']),'Major Facility','NYSDEC Tire Abatement']+[f'Near {f}' for f in flags])
    notes=prov('Waste Tire Abatement Sites (noncompliant tire dumps)')+f" Site ID {cl(r['Site ID'])}; est. {tires or 'unknown number of'} tires; status: {status}; DEC Region {cl(r['DEC Region'])}. Sensitive receivers nearby: {', '.join(flags) or 'none flagged'}. Display=Yes: legacy site statewide per Laurie 2026-09-28."
    add(name,tags,f"{cl(r['City/Town'])}, {cl(r['County'])} County, NY",lat,lon,'🚬',notes,'Yes')  # v1000: tire dumps use 🚬 (Laurie)
# 2. Title V — one pin per DEC ID, emissions history in notes
fac=collections.defaultdict(list)
for r in csv.DictReader(open(D+'Title_V_Emissions_Inventory_20260928.csv',encoding='utf-8-sig')): fac[r['DEC ID']].append(r)
POLS=['VOC','NOx','CO','CO2','Particulates','PM10','PM2.5','HAPS','SO2']
for did,R in fac.items():
    R.sort(key=lambda r:r['Year']); latest=R[-1]; m=re.match(r'POINT \((-?[\d.]+) (-?[\d.]+)\)',latest['Location'] or '')
    if not m: continue
    lon,lat=float(m.group(1)),float(m.group(2))
    mx={p:max(num(r[f'{p} (tons)']) for r in R) for p in POLS}
    major=mx['CO2']>=100000 or mx['NOx']>=100 or mx['SO2']>=100 or mx['HAPS']>=10 or mx['PM2.5']>=25
    inbox=BOX(lat,lon); show='Yes' if (inbox or major) else 'No'
    yrs=f"{R[0]['Year']}–{latest['Year']}"
    name=f"{cl(latest['Facility Name']).title()} — Title V air permit (reported {yrs})"
    hist='; '.join(f"{r['Year']}: NOx {num(r['NOx (tons)']):g}, SO2 {num(r['SO2 (tons)']):g}, PM2.5 {num(r['PM2.5 (tons)']):g}, VOC {num(r['VOC (tons)']):g}, HAPs {num(r['HAPS (tons)']):g}, CO2 {num(r['CO2 (tons)']):,.0f} t" for r in R)
    tags='; '.join(['Waste & Contamination','Air Emissions','Title V Facility',f"SIC {cl(latest['SIC Code'])}",f"{cl(latest['County']).title()} County",cl(latest['Municipality']).title()]+(['Major Facility','Major Air Emitter'] if major else [])+['NYSDEC Title V'])
    notes=prov('Title V Emissions Inventory (Beginning 2010)')+f" DEC ID {did}. Peak reported (tons/yr): "+', '.join(f"{p} {mx[p]:,.0f}" for p in POLS)+f". Year-by-year: {hist}. "+("Display=Yes: inside footprint." if inbox else ("Display=Yes: major air emitter statewide (peak-year ≥100k t CO2, ≥100 t NOx or SO2, ≥10 t HAPs, or ≥25 t PM2.5) per Laurie 2026-09-28." if major else "Display=No: outside footprint and below major-emitter thresholds — kept in master."))
    add(name,tags,f"{cl(latest['Municipality']).title()}, {cl(latest['County']).title()} County, NY",lat,lon,'🏭',notes,show)
# 3. SPDES MSGP — industrial stormwater; footprint only
for r in csv.DictReader(open(D+'SPDES_MSGP_Facilities_20260928.csv',encoding='utf-8-sig')):
    m=re.match(r'POINT \((-?[\d.]+) (-?[\d.]+)\)',r['Georeference'] or '')
    if not m: continue
    lon,lat=float(m.group(1)),float(m.group(2)); inbox=BOX(lat,lon)
    name=f"{cl(r['Name of Facility']).title()} — industrial stormwater permit ({cl(r['Status']).lower()}{', since '+r['Effective Date'][-4:] if r['Effective Date'] else ''})"
    tags='; '.join(['Waste & Contamination','Industrial Stormwater','SPDES MSGP',cl(r['Status']),f"Sector {cl(r['Sector Code'])}",cl(r['Primary Permit SIC Description']),f"{cl(r['County Name'])} County"]+([f"Discharges to {cl(r['Waterbody']).title()}"] if cl(r['Waterbody']) else [])+['NYSDEC SPDES'])
    notes=prov('SPDES Multi-Sector General Permit (MSGP) Facilities')+f" NPDES ID {cl(r['NPDES ID'])}; permittee {cl(r['Permit Issued to Name']).title()}; SIC {cl(r['Primary Permit SIC Code'])} {cl(r['Primary Permit SIC Description'])}; receiving waterbody: {cl(r['Waterbody']).title() or '—'}; MS4: {cl(r['Receiving MS4 Name']) or '—'}; effective {cl(r['Effective Date'])}; DEC Region {cl(r['DEC Region'])}. "+("Display=Yes: inside footprint." if inbox else "Display=No: outside footprint, minor class — kept in master.")
    add(name,tags,f"{cl(r['Location of Facility']).title()}, {cl(r['City of Facility']).title()}, NY {cl(r['Zip of Facility'])[:5]}",lat,lon,'🌧️',notes,'Yes' if inbox else 'No')
# 4. PWL estuary segments — centroid pins; footprint only visible
for r in csv.DictReader(__import__('gzip').open(D+'PWL_Estuary_Segments_20260928.csv.gz','rt',encoding='utf-8-sig')):
    g=wkt.loads(r['the_geom']); c=g.representative_point(); inbox=BOX(c.y,c.x)
    name=f"{cl(r['NAME'])}, {cl(r['DESCRIPT'])} — {cl(r['WBCATGRY']).replace('Seg','segment').lower()} (PWL {cl(r['UPDATE_YR'])})"
    tags='; '.join(['Waste & Contamination','Waterbody Segment','Impaired Waterbody' if 'Impaired' in r['WBCATGRY'] else cl(r['WBCATGRY']),cl(r['BASIN']),'303(d) listed' if r['ON303D']=='1' else 'Not 303(d)','NYSDEC PWL'])
    notes=prov('Waterbody Inventory / Priority Waterbodies List — estuary segments')+f" PWL ID {cl(r['PWL_ID'])}; WIN {cl(r['WIN'])}; {num(r['SEG_ACRES']):,.0f} acres; category {cl(r['WBCATGRY'])}; assessed {cl(r['UPDATE_YR'])}; 303(d): {'yes, parts '+cl(r['NYS303DPAR'])+' ('+cl(r['NYS303DYEA'])+')' if r['ON303D']=='1' else 'no'}. Pin is the segment's representative point — the segment is a reach/polygon, not a site. "+("Display=Yes: inside footprint." if inbox else "Display=No: outside footprint — kept in master.")
    add(name,tags,cl(r['BASIN']),c.y,c.x,'🚱',notes,'Yes' if inbox else 'No',anchor='approximate')
wb.save(p); print(dict(stats))
