"""Ingest DEC Environmental Remediation Sites (one pin per Program Number) and Combined Sewer Overflows (one pin per outfall)
into 'Waste & Contamination'. Usage: python3 scripts/remediation_cso_ingest.py v968
Visibility: footprint bbox for everything; statewide for State Superfund/RCRA sites (HW classes 01–04, C) and any site listing PFAS."""
import csv,re,sys,collections,openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
csv.field_size_limit(10**9)
ver=sys.argv[1] if len(sys.argv)>1 else 'v968'; D='data/layers/dec_waste_extras/'
BOX=lambda lat,lon: 41.9<=lat<=43.2 and -75.1<=lon<=-73.3
cl=lambda s: ILLEGAL_CHARACTERS_RE.sub('',re.sub(r'\s+',' ',str(s or ''))).strip()
PROG={'HW':'State Superfund','BCP':'Brownfield Cleanup','VCP':'Voluntary Cleanup','ERP':'Environmental Restoration','RCRA':'RCRA Corrective Action','SP':'Spill/State-funded','DWC':'Drinking Water Contamination'}
CLASS={'01':'class 01 — imminent danger','02':'class 02 — significant threat','03':'class 03 — no significant threat','04':'class 04 — closed, requires management','05':'class 05 — closed, no further action','A':'active','C':'completed','N':'no further action','P':'potential site','PR':'pre-registration'}
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p); ws=wb['Waste & Contamination']; h={c.value:c.column for c in ws[1] if c.value}
existing={(str(ws.cell(r,2).value).lower(),round(float(ws.cell(r,h['Latitude']).value or 0),3)) for r in range(2,ws.max_row+1) if ws.cell(r,2).value}
stats=collections.Counter()
def add(name,tags,addr,lat,lon,glyph,notes,show,anchor='exact'):
    key=(name.lower(),round(lat,3))
    if key in existing: stats['skipped']+=1; return
    row=ws.max_row+1
    for k,v in {'Name':name,'Tags':tags,'Address':addr,'Latitude':round(lat,6),'Longitude':round(lon,6),'Glyph':glyph,'Notes':notes,'Display':show,'Anchor Type':anchor}.items(): ws.cell(row,h[k]).value=v
    existing.add(key); stats['added']+=1; stats['visible']+=show=='Yes'
# --- Remediation
sites=collections.defaultdict(list)
for r in csv.DictReader(__import__('gzip').open(D+'Environmental_Remediation_Sites_20260928.csv.gz','rt',encoding='utf-8-sig',errors='replace')): sites[r['Program Number']].append(r)
for pn,R in sites.items():
    r0=R[0]
    try: lat,lon=float(r0['Latitude']),float(r0['Longitude'])
    except: stats['no coords']+=1; continue
    prog=cl(r0['Program Type']); sc=cl(r0['Site Class'])
    cont=sorted({cl(x['Contaminants']) for x in R if cl(x['Contaminants'])}); waste=sorted({cl(x['Waste Name']) for x in R if cl(x['Waste Name'])})
    proj=sorted({(cl(x['OU']),cl(x['Project Name']),cl(x['Project Completion Date'])) for x in R if cl(x['Project Name'])})
    yrs=sorted({d[-4:] for _,_,d in proj if re.search(r'\d{4}$',d)})
    owners=sorted({cl(x['Owner Name']) for x in R if cl(x['Owner Name'])}); ops=sorted({cl(x['Operator Name']) for x in R if cl(x['Operator Name'])})
    ctrl=sorted({cl(x['Control Type']) for x in R if cl(x['Control Type'])})
    pfas=any(re.search(r'PFAS|PFOA|PFOS|perfluoro|polyfluoro|fluoroalkyl|PFHxS|PFNA|GenX',c,re.I) for c in cont+waste)
    superfund=prog in ('HW','RCRA') and sc in ('01','02','03','04','C')
    inbox=BOX(lat,lon); major=superfund or pfas; show='Yes' if (inbox or major) else 'No'
    span=f"{yrs[0]}–{yrs[-1]}" if len(yrs)>1 else (yrs[0] if yrs else 'undated')
    name=f"{cl(r0['Program Facility Name'])} — {PROG.get(prog,prog)} site, {CLASS.get(sc,'class '+sc)} ({span})"
    glyph='☣️' if prog in ('HW','RCRA') else '🏚️'
    tags='; '.join(['Waste & Contamination','Remediation Site',PROG.get(prog,prog),f'Site Class {sc}',cl(r0['County'])+' County',cl(r0['Locality'])]+(['PFAS'] if pfas else [])+(['Legacy Site','Major Facility'] if major else [])+cont[:10]+['NYSDEC Remediation'])
    addr=', '.join(x for x in [cl(r0['Address1']),cl(r0['Locality']),f"NY {cl(r0['ZIPCode'])[:5]}"] if x and x!='NY ')
    notes=(f"2026-09-28: added per Laurie ({ver}) from NYSDEC Environmental Remediation Sites (data.ny.gov export 2026-09-28; {len(R)} rows rolled up). Program {prog} ({PROG.get(prog,prog)}), site class {sc} ({CLASS.get(sc,'?')}), DEC Region {cl(r0['DEC Region'])}, program number {pn}. "
           f"Contaminants: {'; '.join(cont) or '—'}. Waste: {'; '.join(waste) or '—'}. Institutional/engineering controls: {'; '.join(ctrl) or '—'}. Owners: {'; '.join(owners) or '—'}. Operators: {'; '.join(ops) or '—'}. "
           "Projects: "+('; '.join('OU%s %s (%s)'%(ou,nm,dt or 'no date') for ou,nm,dt in proj) or '—')+". "
           +("Display=Yes: inside footprint." if inbox else ("Display=Yes: State Superfund/RCRA legacy site statewide per Laurie 2026-09-28." if superfund else ("Display=Yes: PFAS site statewide per Laurie 2026-09-28." if pfas else "Display=No: outside footprint, brownfield/voluntary/potential class — kept in master."))))
    add(name,tags,addr,lat,lon,glyph,notes,show)
# --- CSOs
for r in csv.DictReader(open(D+'CSOs_Beginning_2013_20260928.csv',encoding='utf-8-sig')):
    try: lat,lon=float(r['Latitude']),float(r['Longtitude'])
    except: stats['cso no coords']+=1; continue
    inbox=BOX(lat,lon); ev=cl(r['Number of Overflow Events']); tf=cl(r['Timeframe of Overflow Events Information'])
    name=f"{cl(r['Facility Name'])} — CSO outfall {cl(r['Outfall Number'])} into {cl(r['Receiving Waterbody Name']) or 'unnamed waterbody'} ({ev or '?'} overflows, {tf or 'period unstated'})"
    tags='; '.join(['Waste & Contamination','Combined Sewer Overflow','Sewage','SPDES '+cl(r['SPDES Permit Number']),cl(r['County'])+' County',f"Discharges to {cl(r['Receiving Waterbody Name'])}" if cl(r['Receiving Waterbody Name']) else 'Receiving waterbody unstated','NYSDEC CSO'])
    notes=(f"2026-09-28: added per Laurie ({ver}) from NYSDEC Combined Sewer Overflows (Beginning 2013) (data.ny.gov export 2026-09-28). CSO ID {cl(r['CSO Identification Number'])}; owner {cl(r['Facility Owner Name'])}; {cl(r['Number of Permitted Outfalls'])} permitted outfalls at this facility; activation type {cl(r['Discharge Activation Type'])}; {ev or '?'} overflow events in {tf or '—'} (data as of {cl(r['Data as of'])}); real-time info: {cl(r['Link to Real-time Information']) or '—'}; DEC Region {cl(r['DEC Region'])}. "
           +("Display=Yes: inside footprint." if inbox else "Display=No: outside footprint — kept in master."))
    add(name,tags,f"{cl(r['County'])} County, NY",lat,lon,'🚽',notes,'Yes' if inbox else 'No')
wb.save(p); print(dict(stats))
