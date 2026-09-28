"""Build the 'Mines & Quarries' sheet in data/points_of_interest.xlsx from a USGS MRDS state shapefile.
Usage: python3 scripts/mrds_ingest.py <path/to/mrds-fUS36 (no ext)> [--version v966]
Dedup: same normalised name within 400 m, or any records within 60 m → one row. Idempotent: refuses if the sheet exists."""
import shapefile,collections,re,math,openpyxl,copy,sys
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
src_path=sys.argv[1]; ver=sys.argv[2] if len(sys.argv)>2 else 'v966'
sf=shapefile.Reader(src_path); F=[f[0] for f in sf.fields[1:]]
d=[dict(zip(F,r)) for r in sf.records()]
cl=lambda s: ILLEGAL_CHARACTERS_RE.sub('',str(s or '')).strip()
def era(ref):
    r=ref.upper(); m=re.search(r'\b(18|19|20)\d\d\b',r)
    if 'MSHA' in r or 'MESA' in r: return 'attested 1978–81 (MSHA/MESA)'
    if 'MERRILL' in r and '1904' in r: return 'attested 1904 (Merrill map)'
    if 'MERRILL' in r and '1895' in r: return 'attested 1895 (Merrill)'
    if 'WHITLOCK' in r: return 'attested 1903 (Whitlock)'
    if 'GRAHAM' in r: return 'attested 1952 (Graham)'
    if 'LUEDKE' in r: return 'attested 1959 (Luedke)'
    if 'NEWLAND' in r: return 'attested c.1919 (Newland)'
    if 'CRIB' in r: return 'attested pre-1980 (CRIB record)'
    if m: return f'attested {m.group(0)}'
    return 'undated'
def norm(n):
    n=n.lower(); n=re.sub(r'\b(and|&)\s+(mill|cement plant|plant)\b','',n); n=re.sub(r'\b(quarry|quarries|pit|deposit|occurrence|prospect|mine|mines|no\.?\s*\d+|number \d+|general|construction|the|area)\b','',n)
    return re.sub(r'[^a-z]','',n)
def dist(a,b): return math.hypot((a['latitude']-b['latitude'])*111000,(a['longitude']-b['longitude'])*111000*math.cos(math.radians(a['latitude'])))
grid=collections.defaultdict(list); clusters=[]
for x in sorted(d,key=lambda x:x['site_name']):
    gk=(round(x['latitude'],2),round(x['longitude'],2)); placed=False
    for dx in (-0.01,0,0.01):
        for dy in (-0.01,0,0.01):
            for c in grid[(round(gk[0]+dx,2),round(gk[1]+dy,2))]:
                if any((norm(x['site_name'])==norm(y['site_name']) and norm(x['site_name']) and dist(x,y)<400) or dist(x,y)<60 for y in c):
                    c.append(x); placed=True; break
            if placed: break
        if placed: break
    if not placed: c=[x]; clusters.append(c); grid[gk].append(c)
print(len(d),'records →',len(clusters),'sites')
def glyph(c):
    com=' '.join(x['commod1'] for x in c).lower(); ops=' '.join(x['oper_type'] for x in c).lower(); dev=' '.join(x['dev_stat'] for x in c).lower()
    if 'underground' in ops: return '⛏️'
    if 'occurrence' in dev and not any(k in com for k in ['stone','clay','sand','limestone','flag']): return '💎'
    if 'clay' in com: return '🧱'
    if 'sand' in com: return '🐚'
    if any(k in com for k in ['stone','limestone','flag','slate','marble','granite','trap','dolomite','gypsum','talc']): return '🪨'
    return '⛏️'
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p)
if 'Mines & Quarries' in wb.sheetnames: raise SystemExit('sheet exists — remove it first')
src=wb['Geology']; ws=wb.create_sheet('Mines & Quarries', index=wb.sheetnames.index('Geology')+1)
for c in range(1,src.max_column+1):
    s=src.cell(1,c); t=ws.cell(1,c); t.value=s.value; t.font=copy.copy(s.font); t.alignment=copy.copy(s.alignment); t.fill=copy.copy(s.fill)
    L=openpyxl.utils.get_column_letter(c); ws.column_dimensions[L].width=src.column_dimensions[L].width
h={c.value:c.column for c in ws[1] if c.value}
KIND={'🐚':'Sand & Gravel Pit','🧱':'Clay Pit','🪨':'Quarry','💎':'Mineral Occurrence','⛏️':'Mine'}
n=0
for c in sorted(clusters,key=lambda c:(collections.Counter(x['county'] for x in c).most_common(1)[0][0],c[0]['site_name'])):
    names=list(collections.OrderedDict((cl(x['site_name']),1) for x in c)); best=max(c,key=lambda x:({'A':4,'B':3,'C':2}.get(x['score'],0),len(x['ref'])))
    eras=sorted({era(x['ref']) for x in c}); coms=list(collections.OrderedDict((cl(k),1) for x in c for k in [x['commod1'],x['commod2'],x['commod3']] if k))
    cnty=cl(collections.Counter(x['county'] for x in c).most_common(1)[0][0]); st=cl(best['state']); g=glyph(c)
    devs=sorted({cl(x['dev_stat']) for x in c if x['dev_stat']}); ops=sorted({cl(x['oper_type']) for x in c if x['oper_type'] not in ('Unknown','')})
    tags='; '.join(['Mines & Quarries',KIND[g]]+coms+devs+ops+[f'{cnty} County','USGS MRDS']+(['Coordinates Needed'] if best['score'] not in ('A','B','C') else []))
    name=f"{names[0]} ({'; '.join(e.split(' (')[0] for e in eras)})"
    refs=' | '.join(sorted({cl(x['ref']) for x in c if cl(x['ref'])}))
    extra=[]
    for k in ['dep_type','ore','gangue','hrock_unit','hrock_type','work_type','prod_size','yr_fst_prd','yr_lst_prd','disc_yr']:
        v=sorted({cl(x[k]) for x in c if x[k] not in (None,'',0)})
        if v: extra.append(f"{k}: {', '.join(v)}")
    notes=(f"2026-09-28: added per Laurie ({ver}) from USGS MRDS (NY extract Laurie supplied), {len(c)} MRDS record(s) merged: dep_id {', '.join(x['dep_id'] for x in c)}. "
           f"MRDS names: {' | '.join(names)}. Sources/era: {' | '.join(eras)}. Coordinate score {best['score'] or '—'} — MRDS locations are approximate (often rounded to the minute); Anchor approximate. "
           f"Refs: {refs}. {' '.join(extra)} MRDS: {best['url']}").strip()
    row=ws.max_row+1
    vals={'Name':name,'Tags':tags,'Address':f"{cnty} County, {st}" if cnty else st,'Latitude':round(best['latitude'],5),'Longitude':round(best['longitude'],5),'Glyph':g,'Notes':notes,'Display':'Yes','Anchor Type':'approximate'}
    for k,v in vals.items(): ws.cell(row,h[k]).value=v
    n+=1
wb.save(p); print('wrote',n,'rows to Mines & Quarries')
