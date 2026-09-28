"""Ingest DEC 'Solid Waste Management Facilities' (data.ny.gov) into the 'Waste & Contamination' sheet.
Usage: python3 scripts/swmf_ingest.py data/layers/dec_swmf/Solid_Waste_Management_Facilities_20260928.csv v967
One pin per facility site (same name within 100 m); activities merged into Tags/Notes. Existence-guard on (name, coords)."""
import csv,re,math,sys,copy,collections,openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from pyproj import Transformer
src,ver=sys.argv[1],(sys.argv[2] if len(sys.argv)>2 else 'v967')
utm=Transformer.from_crs('EPSG:26918','EPSG:4326',always_xy=True)
BOX=lambda lat,lon: 41.9<=lat<=43.2 and -75.1<=lon<=-73.3
MAJOR_ACT=re.compile(r'^(Landfill(?! - land clearing)|Waste combustion|Combustion - permit|Composting - biosolids|Composting/other processing - biosolids|Land application - biosolids|Storage - biosolids|Anaerobic digestion - permit|RMW - permit|Regulated medical waste|Used oil - permit|Waste oil storage|HHW collection|Household hazardous|MSW processing - permit|Nonspecific facility - permit)',re.I)
MAJOR_WT=re.compile(r'Biosolids|Sewage Treatment Plant Sludge|Sludge \((Industrial|Papermill|Paper mill)\)|Papermill Sludge|Asbestos|Ash \(|Ash MSW|Petroleum Contaminated Soil|Oil/Gas Drilling Waste|Regulated Medical Waste|Non-hazardous Waste',re.I)
def glyph(acts,wts):
    a=' | '.join(acts).lower(); w=' | '.join(wts).lower()
    if 'landfill' in a: return '🗑️'
    if 'combustion' in a or 'wte' in a: return '🔥'
    if re.search(r'biosolid|septage|sludge|rmw|medical|used oil|waste oil|hazardous|anaerobic',a) or re.search(r'biosolid|sludge|asbestos|ash \(|ash msw|petroleum contaminated|medical',w): return '🧪'
    if re.search(r'vdf|vehicle|crusher|motor vehicle',a): return '🚗'
    if re.search(r'tire|wthrf',a): return '🛞'
    if re.search(r'transfer',a): return '🚛'
    if re.search(r'rhrf|c&d|cddhrf|scrap|mulch|compost|recycl|organics|cooking oil|animal feed|land application|storage - manure|storage - recognizable',a): return '♻️'
    return '🏭'
KIND={'🗑️':'Landfill','🔥':'Waste Combustion','🧪':'Sludge, Biosolids & Hazardous Handling','🚗':'Vehicle Dismantling','🛞':'Waste Tires','🚛':'Transfer Station','♻️':'Recycling & Processing','🏭':'Waste Facility'}
cl=lambda s: ILLEGAL_CHARACTERS_RE.sub('',re.sub(r'\s+',' ',str(s or ''))).strip()
def phone(p):
    d=re.sub(r'\D','',p or '')
    return f'+1 {d[:3]}-{d[3:6]}-{d[6:]}' if len(d)==10 else ''
rows=list(csv.DictReader(open(src,encoding='utf-8-sig')))
sites=[]
for r in rows:
    lat=lon=None; how='DEC georeference'
    m=re.match(r'POINT \((-?\d+\.?\d*) (-?\d+\.?\d*)\)',r.get('Georeference') or '')
    if m: lon,lat=float(m.group(1)),float(m.group(2))
    else:
        try:
            e,n=float(r['East Coordinate']),float(r['North Coordinate'])
            if e>0 and n>0: lon,lat=utm.transform(e,n); how='converted from DEC UTM 18N easting/northing'
        except: pass
    if lat is None or not (40<lat<46 and -80<lon<-71): continue
    name=cl(r['Facility Name']).replace(';',',')
    for s in sites:
        if s['name'].lower()==name.lower() and math.hypot((s['lat']-lat)*111000,(s['lon']-lon)*82000)<100:
            s['recs'].append(r); break
    else: sites.append({'name':name,'lat':round(lat,6),'lon':round(lon,6),'how':how,'recs':[r]})
print(len(rows),'rows →',len(sites),'sites')
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p)
if 'Waste & Contamination' not in wb.sheetnames:
    g=wb['Geology']; ws=wb.create_sheet('Waste & Contamination',index=wb.sheetnames.index('Mines & Quarries')+1)
    for c in range(1,g.max_column+1):
        s=g.cell(1,c); t=ws.cell(1,c); t.value=s.value; t.font=copy.copy(s.font); t.alignment=copy.copy(s.alignment); t.fill=copy.copy(s.fill)
        L=openpyxl.utils.get_column_letter(c); ws.column_dimensions[L].width=g.column_dimensions[L].width
ws=wb['Waste & Contamination']; h={c.value:c.column for c in ws[1] if c.value}
existing={(str(ws.cell(r,2).value).lower(),round(float(ws.cell(r,h['Latitude']).value or 0),3)) for r in range(2,ws.max_row+1) if ws.cell(r,2).value}
n=vis=0; kinds=collections.Counter()
for s in sorted(sites,key=lambda s:(s['recs'][0]['County'],s['name'])):
    R=s['recs']; acts=sorted({cl(r['Activity Desc']) for r in R}); wts=sorted({cl(t) for r in R for t in (r['Waste Types'] or '').split(';') if cl(t)})
    g=glyph(acts,wts); kinds[g]+=1
    major=any(MAJOR_ACT.search(a) for a in acts) or any(MAJOR_WT.search(w) for w in wts)
    inbox=BOX(s['lat'],s['lon']); show='Yes' if (inbox or major) else 'No'
    r0=R[0]; cnty=cl(r0['County']); addr=', '.join(x for x in [cl(r0['Location Address']),cl(r0['City']),f"NY {cl(r0['Zip Code'])[:5]}"] if x and x!='NY ')
    tags='; '.join(['Waste & Contamination',KIND[g]]+acts+wts[:12]+([f'{cnty} County'] if cnty else [])+(['Major Facility'] if major else [])+['NYSDEC SWMF','Active']+(['Coordinates Needed'] if s['how']!='DEC georeference' else []))
    auth=' | '.join(sorted({f"{cl(r['Activity Number'])} {cl(r['Authorization Number'])} (issued {cl(r['Authorization Issue Date']) or '—'}, expires {cl(r['Expiration Date']) or '—'})".strip() for r in R}))
    owner=' | '.join(sorted({f"{cl(r['Owner Name'])} ({cl(r['Owner Type'])})".replace(' ()','') for r in R if cl(r['Owner Name'])}))
    acc=' | '.join(sorted({cl(r['Accuracy Code']) for r in R if cl(r['Accuracy Code'])})) or 'not stated'
    notes=(f"2026-09-28: added per Laurie ({ver}) from NYSDEC Solid Waste Management Facilities (data.ny.gov export 2026-09-28; {len(R)} activity record(s) merged). Activities: {'; '.join(acts)}. Waste types: {'; '.join(wts) or '—'}. Owner: {owner or '—'}. DEC Region {cl(r0['Region'])}. Authorizations: {auth}. Coordinate: {s['how']}; DEC accuracy code {acc}. "
           + ("Display=Yes: inside footprint." if inbox else ("Display=Yes: major-polluter class statewide per Laurie 2026-09-28." if major else "Display=No: outside footprint and not a major-polluter class (hidden per Laurie 2026-09-28) — kept in master.")))
    key=(s['name'].lower(),round(s['lat'],3))
    if key in existing: continue
    row=ws.max_row+1
    for k,v in {'Name':s['name'],'Tags':tags,'Address':addr,'Latitude':s['lat'],'Longitude':s['lon'],'Phone':phone(r0['Phone Number']),'Glyph':g,'Notes':notes,'Display':show,'Anchor Type':'exact' if s['how']=='DEC georeference' else 'approximate'}.items():
        ws.cell(row,h[k]).value=v
    n+=1; vis+=show=='Yes'
wb.save(p); print('wrote',n,'visible',vis,dict(kinds))
