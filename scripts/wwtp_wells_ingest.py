"""Municipal WWTPs (Plant Type=Municipal) and DEC Orphaned Wells -> 'Waste & Contamination'. Usage: python3 scripts/wwtp_wells_ingest.py v969
WWTP visible: footprint or >=1 MGD statewide. Orphaned wells: legacy class, all visible where DEC has a coordinate."""
import csv,re,sys,collections,openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
ver=sys.argv[1] if len(sys.argv)>1 else 'v969'; D='data/layers/dec_waste_extras/'
BOX=lambda lat,lon: 41.9<=lat<=43.2 and -75.1<=lon<=-73.3
cl=lambda s: ILLEGAL_CHARACTERS_RE.sub('',re.sub(r'\s+',' ',str(s or ''))).strip()
def num(x):
    try: return float(str(x).replace(',',''))
    except: return 0.0
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p); ws=wb['Waste & Contamination']; h={c.value:c.column for c in ws[1] if c.value}
existing={(str(ws.cell(r,2).value).lower(),round(float(ws.cell(r,h['Latitude']).value or 0),3)) for r in range(2,ws.max_row+1) if ws.cell(r,2).value}
stats=collections.Counter()
def add(name,tags,addr,lat,lon,glyph,notes,show,anchor):
    key=(name.lower(),round(lat,3))
    if key in existing: stats['dup']+=1; return
    row=ws.max_row+1
    for k,v in {'Name':name,'Tags':tags,'Address':addr,'Latitude':round(lat,6),'Longitude':round(lon,6),'Glyph':glyph,'Notes':notes,'Display':show,'Anchor Type':anchor}.items(): ws.cell(row,h[k]).value=v
    existing.add(key); stats['added']+=1; stats['visible']+=show=='Yes'
for r in csv.DictReader(open(D+'Wastewater_Treatment_Plants_20260928.csv',encoding='utf-8-sig',errors='replace')):
    if r['Plant Type']!='Municipal': continue
    lat,lon=num(r['Latitude']),num(r['Longitude'])
    if not lat: stats['wwtp no coords']+=1; continue
    flow=num(r['Average Design Hydraulic Flow']); inbox=BOX(lat,lon); major=flow>=1.0; show='Yes' if (inbox or major) else 'No'
    name=f"{cl(r['Facility Name']).title()} — municipal sewage treatment plant, discharge to {cl(r['Ground or Surface']).lower() or '?'} water ({flow:g} MGD design flow)"
    tags='; '.join(['Waste & Contamination','Sewage Treatment Plant','Municipal WWTP','Biosolids Source','SPDES '+cl(r['SPDES Permit Number']),f"Discharge to {cl(r['Ground or Surface'])} Water"]+(['Major Facility','Major Discharger'] if major else [])+['NYSDEC SPDES'])
    notes=(f"2026-09-28: added per Laurie ({ver}) from NYSDEC Wastewater Treatment Plants (data.ny.gov export 2026-09-28). SPDES {cl(r['SPDES Permit Number'])}; municipal; average design hydraulic flow {flow:g} MGD; discharges to {cl(r['Ground or Surface']).lower()} water. Source coordinates rounded to 0.01° (~1 km) — Anchor approximate. "
           +("Display=Yes: inside footprint." if inbox else ("Display=Yes: ≥1 MGD sewage plant statewide per Laurie 2026-09-28." if major else "Display=No: outside footprint, <1 MGD — kept in master.")))
    add(name,tags,', '.join(x for x in [cl(r['Street']).title(),cl(r['City']).title(),f"NY {cl(r['Zip Code'])[:5]}"] if x and x!='NY '),lat,lon,'🧫',notes,show,'approximate')
WT={'NL':'not listed','OD':'oil development','GD':'gas development','IW':'injection','DW':'dry hole','DH':'dry hole','ST':'storage','BR':'brine','SW':'stratigraphic','GS':'gas storage','MW':'monitoring','OE':'oil extension','GE':'gas extension'}
WS={'UL':'unknown, located','UM':'unknown, not located (mapped)','UN':'unknown, not located'}
for r in csv.DictReader(open(D+'Orphaned_Wells_20260928.csv',encoding='utf-8-sig',errors='replace')):
    lat,lon=num(r['SURFACE LATITUDE']),num(r['SURFACE LONGITUDE'])
    if not lat: stats['wells no coords']+=1; continue
    ver_loc=r['VERIFIED LOCATION']=='YES'
    name=f"{cl(r['WELL NAME']) or 'Unnamed well'} — orphaned {WT.get(r['WELL TYPE CODE'],r['WELL TYPE CODE']).replace(' development','')} well (API {cl(r['API WELL NUMBER'])}; {WS.get(r['WELL STATUS'],r['WELL STATUS'])})"
    tags='; '.join(['Waste & Contamination','Orphaned Well','Legacy Site','Oil & Gas',WT.get(r['WELL TYPE CODE'],r['WELL TYPE CODE']).title(),f"{cl(r['COUNTY'])} County",cl(r['TOWN']),'Major Facility','NYSDEC Orphaned Wells']+([] if ver_loc else ['Coordinates Needed']))
    notes=(f"2026-09-28: added per Laurie ({ver}) from NYSDEC Orphaned Wells (data.ny.gov export 2026-09-28). API {cl(r['API WELL NUMBER'])}; last operator {cl(r['COMPANY NAME'])}; type {WT.get(r['WELL TYPE CODE'],r['WELL TYPE CODE'])}; status {WS.get(r['WELL STATUS'],r['WELL STATUS'])}; DEC Region {cl(r['REGION'])}; location verified: {r['VERIFIED LOCATION']}. Display=Yes: legacy site statewide per Laurie 2026-09-28.")
    add(name,tags,f"{cl(r['TOWN'])}, {cl(r['COUNTY'])} County, NY",lat,lon,'⚫',notes,'Yes','exact' if ver_loc else 'approximate')
wb.save(p); print(dict(stats))
