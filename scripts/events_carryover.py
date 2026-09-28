#!/usr/bin/env python3
"""Re-apply atlas-side fixes to a fresh events drop-in.  v950 (2026-09-28).

usage:  python3 scripts/events_carryover.py <new_events.xlsx> [--apply]
  without --apply: prints the diff of curated columns (current master vs drop-in) and which fixes would land
  with    --apply: copies the drop-in over data/events.xlsx and applies scripts/events_carryover.json,
                   appending a dated provenance line to Notes for every changed row (never overwriting Notes)

Rules honoured: column-by-name; read_only for read-backs; never delete rows; provenance on every change.
"""
import sys, json, shutil, datetime, collections, openpyxl
ROOT=__file__.rsplit('/scripts/',1)[0]
MASTER=ROOT+'/data/events.xlsx'; FIXES=ROOT+'/scripts/events_carryover.json'
CUR=['Display','Agenda','Latitude','Longitude','Venue','Address','Glyph','Show on timeline']
def rows_of(path):
    wb=openpyxl.load_workbook(path, read_only=True); ws=wb['Events']
    it=ws.iter_rows(values_only=True); h=[str(x) if x is not None else '' for x in next(it)]
    idx={n:i for i,n in enumerate(h) if n}
    return [ {n:(r[i] if i<len(r) else None) for n,i in idx.items()} for r in it if r and any(v is not None for v in r) ], idx
def key(r): return (str(r.get('Event Name') or '').strip().lower(), str(r.get('Start Date') or '')[:10], str(r.get('Venue') or '').strip().lower())
def diff(newp):
    new,_=rows_of(newp); old,_=rows_of(MASTER)
    ko=collections.defaultdict(list); [ko[key(r)].append(r) for r in old]
    kn=collections.defaultdict(list); [kn[key(r)].append(r) for r in new]
    print(f'master {len(old)} rows · drop-in {len(new)} rows · new keys {len(set(kn)-set(ko))} · pruned keys {len(set(ko)-set(kn))}')
    for k in sorted(set(ko)&set(kn)):
        if len(ko[k])!=1 or len(kn[k])!=1: continue
        o,n=ko[k][0],kn[k][0]
        for c in CUR:
            if c not in o: continue
            ov,nv=o.get(c),n.get(c)
            if (ov in (None,'')) and (nv in (None,'')): continue
            if isinstance(ov,float) and isinstance(nv,float) and abs(ov-nv)<1e-6: continue
            if str(ov).strip()!=str(nv).strip(): print(f'  DIFF {c:9s} | {o.get("Event Name")!s:60.60s} | master={ov!r} drop-in={nv!r}')
def apply(newp):
    shutil.copyfile(newp, MASTER)
    fixes=json.load(open(FIXES))['fixes']
    wb=openpyxl.load_workbook(MASTER); ws=wb['Events']
    hdr={ (c.value if c.value is not None else ''):c.column for c in ws[1] }
    stamp=datetime.date.today().isoformat(); changed=0
    for row in ws.iter_rows(min_row=2):
        name=str(row[hdr['Event Name']-1].value or '').strip().lower(); venue=str(row[hdr['Venue']-1].value or '').strip().lower()
        for f in fixes:
            if f['name'].strip().lower()!=name: continue
            if f.get('venue','*')!='*' and f['venue'].strip().lower()!=venue: continue
            did=[]
            for col,val in f['set'].items():
                if col not in hdr: continue
                cell=row[hdr[col]-1]
                cur=cell.value
                same = (isinstance(cur,(int,float)) and isinstance(val,(int,float)) and abs(cur-val)<1e-6) or (str(cur).strip()==str(val).strip())
                if not same: cell.value=val; did.append(f'{col}: {cur!r} → {val!r}')
            if did:
                nc=row[hdr['Notes']-1]; nc.value=((nc.value or '')+('\n' if nc.value else '')+f'[{stamp} carry-over] '+'; '.join(did)+' — '+f.get('why','')).strip(); changed+=1
    wb.save(MASTER); print(f'applied: {changed} row(s) changed; master replaced with {newp}')
if __name__=='__main__':
    if len(sys.argv)<2: print(__doc__); sys.exit(1)
    diff(sys.argv[1])
    if '--apply' in sys.argv: apply(sys.argv[1])
