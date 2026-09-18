import openpyxl, re, unicodedata, datetime
def norm(s):
    if s is None: return ''
    s=unicodedata.normalize('NFKD',str(s)); s=''.join(c for c in s if not unicodedata.combining(c))
    s=s.lower().strip(); s=re.sub(r'\s*-.*$','',s); s=re.sub(r'[^a-z0-9]+',' ',s).strip()
    return re.sub(r'\s+',' ',s)
def isnum(v):
    try: float(v); return True
    except: return False
stamp=datetime.date.today().isoformat()

# Verified coords keyed by normalized venue name.
# 2 from POI master (Coxsackie, Medusa) + verified-via-Places from the earlier ingestor brief.
COORDS={
 'coxsackie farmers market':(42.352136,-73.794919,'POI master'),
 'medusa volunteer fire company':(42.436337,-74.129812,'POI master'),
 'knox town calendar':(42.6699633,-74.1189475,'Knox Town Hall, Places-verified'),
 'town of rensselaerville':(42.456871,-74.1369323,'Rensselaerville Town Hall, Places-verified'),
 'maverick concerts':(42.014389,-74.117897,'Maverick Concert Hall, Places-verified'),
 'regional food bank':(42.7644287,-73.814088,'Regional Food Bank Latham, Places-verified'),
 'troy atrium':(42.7318827,-73.6898645,'Frear Bldg / Troy Atrium, Places-verified'),
 'super-stories':(42.3955207,-73.6976052,'Super-Stories Kinderhook, POI master (feed had wrong Catskill coord)'),
 'super stories':(42.3955207,-73.6976052,'Super-Stories Kinderhook, POI master (feed had wrong Catskill coord)'),
 'return brewing':(42.2480372,-73.7815525,'Return Brewing Hudson, POI master (feed geocodes 725 State St to Manhattan)'),   # 2026-09-17 Laurie
}
# NOT patched (no reliable coord): Mid-Hudson Astronomical Association, Hunter Stone Carving Seminar

wb=openpyxl.load_workbook('data/events.xlsx')
ws=wb['Events']; hdr=[c.value for c in next(ws.iter_rows(min_row=1,max_row=1))]
H={h:i+1 for i,h in enumerate(hdr) if h}
def key_for(nm,ven):
    for k in COORDS:
        if k in norm(ven) or k in norm(nm): return k
    return None
patched={}; skipped_filled=0
for r in range(2, ws.max_row+1):
    nm=ws.cell(row=r,column=H['Event Name']).value
    if not nm or not str(nm).strip(): continue
    disp=str(ws.cell(row=r,column=H['Display']).value or '').strip().lower()
    if disp in ('no','n','false'): continue
    la=ws.cell(row=r,column=H['Latitude']).value; lo=ws.cell(row=r,column=H['Longitude']).value
    ven=ws.cell(row=r,column=H['Venue']).value or ''
    is_super = 'super-stories' in str(ven).lower() or 'super stories' in str(ven).lower()
    is_return = 'return brewing' in str(ven).lower() and ('725 state' in str(ws.cell(row=r,column=H['Address']).value or '').lower())
    if isnum(la) and isnum(lo):  # normally only patch EMPTY rows
        # EXCEPTION: Super-Stories comes through with a wrong Catskill coord — override it
        if is_super and abs(float(la)-42.221514)<0.01 and abs(float(lo)+73.866586)<0.01:
            pass  # fall through to patch
        # EXCEPTION (2026-09-17): Return Brewing's 725 State St geocodes to State St, Manhattan (40.72, -74.00)
        elif is_return and float(la) < 41.5:
            pass  # fall through to patch
        else:
            continue
    ven=ws.cell(row=r,column=H['Venue']).value or ''
    k=key_for(str(nm),str(ven))
    if not k: continue
    lat,lng,src=COORDS[k]
    ws.cell(row=r,column=H['Latitude']).value=lat
    ws.cell(row=r,column=H['Longitude']).value=lng
    # provenance in Notes if column exists
    if 'Notes' in {h:1 for h in hdr}:
        ni=H['Notes']; ex=ws.cell(row=r,column=ni).value
        ws.cell(row=r,column=ni).value=(str(ex).rstrip()+' | ' if ex else '')+f'{stamp}: coords patched by cartographer ({src}) — stopgap until ingestor venue-coord join resolves.'
    patched[k]=patched.get(k,0)+1
wb.save('data/events.xlsx')
print('patched rows by venue:')
for k,c in sorted(patched.items(), key=lambda x:-x[1]): print(f'  {c:3d}  {k}')
print('total patched:', sum(patched.values()))
