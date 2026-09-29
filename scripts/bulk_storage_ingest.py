"""Ingest DEC Bulk Storage Facilities (PBS/CBS/MOSF; one pin per Program Number) into 'Waste & Contamination', and
enrich existing remediation pins with BCP Certificates of Completion. Usage: python3 scripts/bulk_storage_ingest.py v969
Master keeps: every site in the footprint bbox + statewide MOSF, CBS, or >=100,000 gal in service. (Per Laurie 2026-09-28 the
remaining ~60k ordinary PBS registrations statewide are NOT loaded — the full export is archived gzipped in data/layers/dec_waste_extras/.)
Visible: footprint sites that are Active or major; all major statewide."""
import csv,re,sys,gzip,collections,openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
csv.field_size_limit(10**9)
ver=sys.argv[1] if len(sys.argv)>1 else 'v969'; D='data/layers/dec_waste_extras/'
BOX=lambda lat,lon: 41.9<=lat<=43.2 and -75.1<=lon<=-73.3
cl=lambda s: ILLEGAL_CHARACTERS_RE.sub('',re.sub(r'\s+',' ',str(s or ''))).strip()
def gal(x):
    try: return float(str(x).replace(',',''))
    except: return 0.0
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p); ws=wb['Waste & Contamination']; h={c.value:c.column for c in ws[1] if c.value}
existing={(str(ws.cell(r,2).value).lower(),round(float(ws.cell(r,h['Latitude']).value or 0),3)) for r in range(2,ws.max_row+1) if ws.cell(r,2).value}
stats=collections.Counter()
# --- BCP COC enrichment
coc={r['BCP Site Number']:r for r in csv.DictReader(open(D+'BCP_Certificates_of_Completion_20260928.csv',encoding='utf-8-sig',errors='replace'))}
for r in range(2,ws.max_row+1):
    n=ws.cell(r,h['Notes']).value or ''
    m=re.search(r'program number (C\d+)',n)
    if m and m.group(1) in coc and 'Certificate of Completion' not in n:
        c=coc[m.group(1)]
        ws.cell(r,h['Notes']).value=n+f" 2026-09-28 ({ver}): BCP Certificate of Completion issued {cl(c['Year COC Issued'])} ({cl(c['Years from Application to COC'])} yrs from application); highest allowable future use: {cl(c['Highest Allowable Future Use'])}; {cl(c['Acreage'])} acres (NYSDEC BCP COC export 2026-09-28)."
        ws.cell(r,h['Tags']).value=(ws.cell(r,h['Tags']).value or '')+f"; COC Issued {cl(c['Year COC Issued'])}; Future use: {cl(c['Highest Allowable Future Use'])}"
        stats['coc enriched']+=1
# --- Bulk storage
sites=collections.defaultdict(list)
for r in csv.DictReader(gzip.open(D+'Bulk_Storage_Facilities_20260928.csv.gz','rt',encoding='utf-8-sig',errors='replace')): sites[r['Program Number']].append(r)
PROG={'PBS':'petroleum bulk storage','CBS':'chemical bulk storage','MOSF':'major oil storage facility'}
for pn,R in sites.items():
    lat=lon=None
    for r in R:
        m=re.match(r'POINT \((-?[\d.]+) (-?[\d.]+)\)',r['Georeference'] or '')
        if m: lon,lat=float(m.group(1)),float(m.group(2)); break
    if lat is None: stats['no coords']+=1; continue
    progs=sorted({r['Program Type'] for r in R}); r0=R[0]
    tanks=[r for r in R if cl(r['Tank Number'])]
    inserv=[t for t in tanks if t['Tank Status'] in ('In Service','Out of Service')]
    cap=sum(gal(t['Capacity in Gallons']) for t in inserv)
    closed_place=[t for t in tanks if t['Tank Status']=='Closed - In Place']; removed=[t for t in tanks if t['Tank Status'].startswith('Closed - Removed')]
    major=('MOSF' in progs) or ('CBS' in progs) or cap>=100000
    inbox=BOX(lat,lon)
    if not (inbox or major): stats['not loaded (ordinary PBS outside footprint)']+=1; continue
    active=any(r['Site Status Name']=='Active' for r in R)
    show='Yes' if (major or (inbox and active)) else 'No'
    mats=sorted({cl(t['Material Name']) for t in tanks if cl(t['Material Name'])})
    yrs=sorted({t['Install Date'][-4:] for t in tanks if re.search(r'\d{4}$',t['Install Date'] or '')})
    span=f"{yrs[0]}–{yrs[-1]}" if len(yrs)>1 else (yrs[0] if yrs else 'undated')
    g='🛢️' if 'MOSF' in progs else ('⚗️' if 'CBS' in progs else '⛽')
    status=cl(r0['Site Status Name'])
    name=f"{cl(r0['Program Facility Name']).title()} — {' & '.join(PROG[x] for x in progs)}, {status.lower()} ({len(inserv)} tank{'s' if len(inserv)!=1 else ''} in service, {cap:,.0f} gal; tanks installed {span})"
    tags='; '.join(['Waste & Contamination','Bulk Storage']+[f'DEC {x}' for x in progs]+[cl(r0['Site Type Name']),status,f"{cl(r0['County'])} County",cl(r0['Locality']).title()]+mats[:8]+(['Major Facility'] if major else [])+(['Legacy Site'] if closed_place else [])+['NYSDEC Bulk Storage'])
    notes=(f"2026-09-28: added per Laurie ({ver}) from NYSDEC Bulk Storage Facilities (data.ny.gov export 2026-09-28; {len(R)} tank rows rolled up). Program number {pn}; programs {', '.join(progs)}; site type {cl(r0['Site Type Name'])}; site status {status}; DEC Region {cl(r0['NYSDEC Region'])}. "
           f"Tanks: {len(inserv)} in/out of service ({cap:,.0f} gal), {len(closed_place)} closed in place, {len(removed)} closed-removed, {sum(1 for t in tanks if t['Tank Status'] not in ('In Service','Out of Service','Closed - In Place') and not t['Tank Status'].startswith('Closed - Removed'))} other. Materials: {'; '.join(mats) or '—'}. "
           f"Tank detail: "+'; '.join(f"#{cl(t['Tank Number'])} {gal(t['Capacity in Gallons']):,.0f} gal {cl(t['Material Name']) or '?'} {cl(t['Tank Type'])} {cl(t['Tank Location'])} {cl(t['Tank Status'])}{' inst. '+t['Install Date'][:10] if t['Install Date'] else ''}{' closed '+t['Close Date'][:10] if t['Close Date'] else ''}" for t in tanks[:40])+(f"; … {len(tanks)-40} more" if len(tanks)>40 else '')+". "
           +("Display=Yes: major facility (MOSF/CBS/≥100k gal in service)." if major else ("Display=Yes: active site inside footprint." if show=='Yes' else "Display=No: inside footprint but site inactive/closed — kept in master as legacy record.")))
    key=(name.lower(),round(lat,3))
    if key in existing: stats['skipped']+=1; continue
    row=ws.max_row+1
    for k,v in {'Name':name,'Tags':tags,'Address':', '.join(x for x in [cl(r0['Address 1']).title(),cl(r0['Locality']).title(),f"NY {cl(r0['ZIP Code'])[:5]}"] if x and x!='NY '),'Latitude':round(lat,6),'Longitude':round(lon,6),'Glyph':g,'Notes':notes[:32000],'Display':show,'Anchor Type':'exact'}.items(): ws.cell(row,h[k]).value=v
    existing.add(key); stats['added']+=1; stats['visible']+=show=='Yes'; stats[g]+=1
wb.save(p); print(dict(stats))
