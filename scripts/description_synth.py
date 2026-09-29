"""v976 (2026-09-29, Laurie): synthesise a one-paragraph Description for every dataset-ingested pin whose Description is
blank, so the popup shows the record (date, cause, acres, permit years, contaminants…) and not just a label.
Usage: python3 scripts/description_synth.py
Reads the structured Notes each ingest script wrote and re-phrases the key facts in plain English. Never overwrites a
non-blank Description (curated text is Laurie's). Idempotent — re-running only fills rows still blank, and rows already
filled by this script are recognised by the trailing marker and regenerated (so template fixes propagate)."""
import re,openpyxl,collections
MARK='​'   # zero-width space appended to synthesised descriptions so re-runs can tell them from hand-written ones
p='data/points_of_interest.xlsx'
def g(rx,n,default=''):
    m=re.search(rx,n); return (m.group(1).strip() if m else default)
def dash(v): return v if v and v!='—' else ''
def yr_span(v): return v.replace('–','–')

def d_fires(n,name):
    start=g(r'start (\d{4}-\d\d-\d\d)',n); out=g(r'out (\d{4}-\d\d-\d\d|—)',n); cause=g(r'cause ([^;]+);',n); fuel=g(r'fuel model ([^;]+);',n)
    acres=g(r'; ([\d.,]+) acres',n); own=g(r'ownership ([^;]+);',n); loss=g(r'; ((?:no losses reported|losses[^;]+))',n); reg=g(r'DEC Region ([\w/]+)',n)
    fuel=re.sub(r'^\d+ - ','',fuel)
    s=f"Wildfire reported to NYSDEC Forest Rangers. Started {start}"+(f", declared out {out}" if out and out!='—' else '')+f"; cause: {cause.lower() if cause else 'not recorded'}; {acres} acres burned"
    if fuel: s+=f" in {fuel.lower()}"
    if own: s+=f" on {own.lower()}"+('' if re.search(r'property|land|area|park|forest|preserve',own,re.I) else ' land')
    s+='. '+(loss[0].upper()+loss[1:] if loss else '')+(f" (DEC Region {reg})." if reg else '.')
    return s.replace('..','.')
def d_mrds(n,name):
    names=g(r'MRDS names: ([^.]+)\.',n); era=g(r'Sources/era: ([^.]+?)\. Coordinate',n); score=g(r'Coordinate score (\w)',n); ht=g(r'hrock_type: ([^\n]+?) (?:prod_size|MRDS:)',n); ps=g(r'prod_size: (\w)',n)
    sizes={'S':'small','M':'medium','L':'large','Y':'producer (size not stated)','N':'no recorded production'}
    s=f"Historic mineral occurrence in the USGS Mineral Resources Data System"+(f", recorded as {names}" if names else '')+'.'
    if era: era=era.replace(' | ','; '); s+=f" {era[0].upper()+era[1:]}."
    if ps in sizes: s+=f" Production size: {sizes[ps]}."
    if ht: s+=f" Host rock: {ht.strip('. ')}."
    if score: s+=f" MRDS coordinates are approximate (score {score}; often rounded to the minute) — the pin marks the vicinity, not the workings."
    permit=g(r'(DEC Mined Land permit \d+: [^;]+; permittee [^;]+;[^.]*)',n)
    if permit: s+=' Matched to '+permit.replace('DEC Mined Land permit','NYSDEC Mined Land permit')+'.'
    return s
def d_mined(n,name):
    pid=g(r'DEC Mined Land permit (\d+):',n); comm=g(r'DEC Mined Land permit \d+: .+? — (.+?), status',n); status=g(r', status (.+?), permitted',n); yrs=g(r'permitted ([^;]+);',n)
    who=g(r'permittee ([^;]+);',n); where=g(r'permittee [^;]+; ([^;]+); acres',n); lom=g(r'life-of-mine ([\d.]+)',n); aff=g(r'affected ([\d.]+)',n); rec=g(r'reclaimed ([\d.]+)',n); recl=g(r'reclamation (\w+)',n); ug=g(r'underground (\w+)',n); insp=g(r'last inspected ([^.]+)\.',n)
    if not pid: return ''
    m=re.match(r'(\d{4})–(\d{4})$',yrs)
    if m and m.group(1)==m.group(2): yrs=m.group(1)
    if yrs=='undated': yrs='dates not recorded'
    comm=comm or 'Mineral'; who=who or 'permittee not recorded'
    RECL={'AGRI':'agriculture','GRAS':'grassland','FORE':'forest','WATE':'water body / pond','WETL':'wetland','RESI':'residential','COMM':'commercial','INDU':'industrial','RECR':'recreation','WILD':'wildlife habitat'}
    s=f"{comm} mine permitted by NYSDEC under the Mined Land Reclamation Law (permit {pid}), {yrs}; status {status or 'not recorded'}; permittee {who}"+(f"; {where}" if where else '')+'.'
    s+=f" Acreage: {aff} affected, {rec} reclaimed"+(f", {lom} life-of-mine" if lom not in ('0','0.0') else '')+'.'
    if recl in RECL: s+=f" Reclamation objective: {RECL[recl]}."
    if ug=='Yes': s+=' Underground workings.'
    if insp and insp!='—': s+=f" Last DEC inspection {insp}."
    return s
def d_swmf(n,name):
    act=g(r'Activities: ([^.]+?)\. Waste types',n) or g(r'Activities: ([^.]+?)\.',n); wt=g(r'Waste types: ([^.]+?)\. Owner',n); own=g(r'Owner: ([^.]+?)\. DEC',n); reg=g(r'DEC Region (\d+)',n)
    s='Solid waste management facility regulated by NYSDEC'+(f" — {act}" if act else '')+'.'
    if dash(wt): s+=f" Waste types handled: {wt}."
    if own: s+=f" Owner: {own}."
    if reg: s+=f" DEC Region {reg}."
    return s
def d_tires(n,name):
    sid=g(r'Site ID ([\w-]+)',n); cnt=g(r'est\. ([^;]+) tires',n); st=g(r'status: ([^;]+);',n); rec=g(r'Sensitive receivers nearby: ([^.]+)\.',n)
    s=f"Noncompliant waste-tire dump on NYSDEC's abatement list (site {sid})."
    if cnt and 'unknown' not in cnt: s+=f" Estimated {cnt} tires."
    if st: s+=f" Status: {st}."
    if rec and rec!='none flagged': s+=f" Sensitive receivers nearby: {rec}."
    return s
def d_tvinv(n,name):
    peak=g(r'Peak reported \(tons/yr\): (.+?)\. Year-by-year',n); yrs=re.findall(r'(\d{4}): NOx',n)
    s='Facility holding a Title V (major-source) air permit, reporting emissions to NYSDEC'+(f" {yrs[0]}–{yrs[-1]}" if yrs else '')+'.'
    if peak:
        parts=[x.strip() for x in peak.split(',')]; keep=[x for x in parts if not re.search(r' 0$',x)]
        s+=f" Peak reported emissions (tons/yr): {', '.join(keep) if keep else 'none above zero'}."
    tvp=g(r'current Title V permit ([^;]+; issued [^;]+; expires [^;]+)',n) or g(r'current Title V permit ([^;]+) issued ([^,]+), expires ([^;]+);',n)
    m=re.search(r'current Title V permit ([\w/-]+) issued ([\d/]+), expires ([\d/]+); permit text: (\S+)',n)
    if m: s+=f" Current permit {m.group(1)} issued {m.group(2)}, expires {m.group(3)}; permit text: {m.group(4)}."
    return s
def d_msgp(n,name):
    nid=g(r'NPDES ID (\w+)',n); who=g(r'permittee ([^;]+);',n); sic=g(r'SIC (\d+ [^;]+);',n); wb=dash(g(r'receiving waterbody: ([^;]+);',n)); eff=g(r'effective ([\d/]+)',n)
    s=f"Industrial stormwater discharger covered by NYSDEC's SPDES Multi-Sector General Permit (NPDES {nid})"+(f"; permittee {who}" if who else '')+'.'
    if sic: s+=f" Sector: {sic}."
    if wb: s+=f" Receives: {wb}."
    if eff: s+=f" Coverage effective {eff}."
    return s
def d_pwl(n,name):
    pid=g(r'PWL ID ([\w-]+)',n); acres=g(r'; ([\d,.]+) acres',n); cat=g(r'category ([^;]+);',n); yr=g(r'assessed (\d{4})',n); tmdl=g(r'303\(d\): ([^.]+)\.',n)
    s=f"Estuary segment in NYSDEC's Waterbody Inventory / Priority Waterbodies List (PWL {pid})"+(f", {acres} acres" if acres else '')+'.'
    if cat: s+=f" Assessment category: {cat}"+(f" ({yr})" if yr else '')+'.'
    if tmdl: s+=f" Clean Water Act 303(d) impaired-waters listing: {tmdl}."
    s+=' The pin is the segment\'s representative point — the water body itself is a reach or polygon.'
    return s
def d_remed(n,name):
    prog=g(r'Program \w+ \(([^)]+)\)',n); cls=g(r'site class \w+ \(([^)]+)\)',n); pn=g(r'program number ([\w-]+)',n); cont=dash(g(r'Contaminants: ([^.]+?)\. Waste',n)); waste=dash(g(r'Waste: ([^.]+?)\. Institutional',n))
    ctl=dash(g(r'Institutional/engineering controls: ([^.]+?)\. Owners',n)); own=dash(g(r'Owners: ([^.]+?)\. Operators',n)); proj=g(r'Projects: ([^.]+?)\. Display',n)
    s=f"NYSDEC environmental remediation site — {prog or 'program not recorded'}"+(f", {cls}" if cls else '')+(f" (site {pn})" if pn else '')+'.'
    if cont: s+=f" Contaminants of concern: {cont}."
    if waste: s+=f" Waste: {waste}."
    if ctl: s+=f" Controls in place: {ctl}."
    if own: s+=f" Owner: {own}."
    if proj and proj!='—':
        items=[x.strip() for x in proj.split(';')]; s+=f" Project milestones: {'; '.join(items[:4])}"+(f" (+{len(items)-4} more)" if len(items)>4 else '')+'.'
    bcp=g(r'\(v969\): (BCP Certificate of Completion issued \d{4}[^;]*; highest allowable future use: [^;]+(?:; [\d.]+ acres)?)',n)
    if bcp: s+=' '+bcp+'.'
    sc=g(r'Sediment cap \(DEC Sediment Caps layer, export [\d-]+\): (status [^.]+\. Cap: [^.]+)\.',n)
    if sc: s+=' Contaminated sediment: '+sc+'.'
    return s
def d_cso(n,name):
    cid=g(r'CSO ID ([\w-]+)',n); own=g(r'owner ([^;]+);',n); cnt=g(r'(\d+) permitted outfalls',n); act=dash(g(r'activation type ([^;]+);',n)); ev=g(r'(\d+ overflow events in [^;]+)',n); rt=dash(g(r'real-time info: ([^;]+);',n))
    s=f"Combined sewer overflow outfall ({cid})"+(f", owned by {own}" if own else '')+" — in heavy rain, untreated sewage mixed with stormwater discharges here rather than going to the treatment plant."
    if cnt: s+=f" One of {cnt} permitted outfalls at this facility."
    if act: s+=f" Activation monitoring: {act.lower()}."
    if ev: s+=f" {ev[0].upper()+ev[1:]}."
    if rt: s+=f" Real-time notifications: {rt}."
    return s
def d_bulk(n,name):
    pn=g(r'Program number ([\w-]+)',n); progs=g(r'programs ([^;]+);',n); st=g(r'site type ([^;]+);',n); ss=g(r'site status ([^;]+);',n); tanks=g(r'Tanks: ([^.]+?)\. Materials',n); mat=g(r'Materials: ([^.]+?)\. Tank detail',n)
    P={'PBS':'petroleum bulk storage','CBS':'chemical bulk storage','MOSF':'major oil storage facility'}
    pl=' & '.join(P.get(x.strip(),x.strip()) for x in progs.split(',')) if progs else 'bulk storage'
    s=f"Registered {pl} site (NYSDEC {pn})"+(f" — {st}" if st else '')+(f"; status {ss.lower()}" if ss else '')+'.'
    if tanks: s+=f" Tanks: {tanks}."
    if mat: s+=f" Materials stored: {mat}."
    return s
def d_wwtp(n,name):
    sp=g(r'SPDES (\w+)',n); flow=g(r'average design hydraulic flow ([\d.]+) MGD',n); to=g(r'discharges to (\w+) water',n); muni='municipal' in n.split('SPDES')[0].lower() or 'Municipal WWTP' in n
    kind='Municipal sewage treatment plant' if ('municipal;' in n or 'Municipal' in n) else 'Industrial wastewater treatment plant'
    s=f"{kind} with a NYSDEC SPDES discharge permit ({sp})."
    if flow: s+=f" Average design flow {flow} million gallons/day"+(f", discharging to {to} water" if to else '')+'.'
    s+=' Source coordinates are rounded to about 1 km — the pin is approximate.'
    return s
def d_orphan(n,name):
    api=g(r'API (\d+)',n); op=g(r'last operator ([^;]+);',n); ty=g(r'type ([^;]+);',n); st=g(r'status ([^;]+);',n); ver=g(r'location verified: (\w+)',n)
    s=(f"Orphaned {ty} well" if ty and ty!='not listed' else 'Orphaned well (type not listed)')+f" on NYSDEC's plugging inventory (API {api}) — no responsible operator remains"+(f"; last operator {op}" if op and op!='Unknown' else '')+'.'
    if st: s+=f" Status: {st}."
    if ver: s+=' Location '+('verified by DEC.' if ver.upper()=='YES' else 'not field-verified — approximate.')
    return s
def d_ewaste(n,name):
    reg=g(r'Registration (\w+)',n); site=g(r'site (https?://\S+)',n)
    s=f"Electronic-waste recycling facility registered with NYSDEC under the NYS Electronic Equipment Recycling and Reuse Act (registration {reg})."
    if site: s+=f" {site}"
    return s
def d_spills(n,name):
    cnt=g(r'(\d+) spill record\(s\)',n); mats=g(r'Materials: ([^.]+?)\. Spills:',n); sp=g(r'Spills: (.+)$',n)
    s=f"Hazardous-material spill site — {cnt} incident{'s' if cnt!='1' else ''} in NYSDEC's spill database at this address."
    if mats: s+=f" Materials: {mats}."
    if sp:
        items=[x.strip() for x in re.split(r' \| ',sp)]; s+=' '+'; '.join(items[:3])+(f" (+{len(items)-3} more)" if len(items)>3 else '')+'.'
    s+=' Location resolved from the DEC street address via Google Places.'
    return s
def d_birding(n,name):
    adm=g(r'administered by ([^;]+);',n); birds=g(r'birds to observe: ([^;]+);',n); bca=g(r'Bird Conservation Area: (\w+)',n)
    s='Site on the NYS Birding Trail'+(f", administered by {adm}" if adm else '')+'.'
    if birds: s+=f" Birds to look for: {birds}."
    if bca=='yes': s+=' Designated Bird Conservation Area.'
    return s
def d_cdphp(n,name):
    raw=g(r'raw name "([^"]+)"',n)
    return 'CDPHP Cycle! bike-share hub (CDTA). Pedal and e-bikes, rented through the app, in season April–November, any hour. The pin is the centre of the hub\'s geofence, not a surveyed dock.'
GEN=[('fires',r'Wildland Fire Reporting Database',d_fires),('mined',r'from NYSDEC Mined Land Permits',d_mined),('mrds',r'from USGS MRDS',d_mrds),
     ('swmf',r'from NYSDEC Solid Waste Management Facilities',d_swmf),('tires',r'from NYSDEC Waste Tire Abatement',d_tires),('tv_inv',r'from NYSDEC Title V Emissions Inventory',d_tvinv),
     ('msgp',r'Multi-Sector General Permit',d_msgp),('pwl',r'Priority Waterbodies List',d_pwl),('remed',r'from NYSDEC Environmental Remediation Sites',d_remed),
     ('cso',r'from NYSDEC Combined Sewer Overflows',d_cso),('bulk',r'from NYSDEC Bulk Storage',d_bulk),('wwtp',r'Wastewater Treatment Plants',d_wwtp),
     ('orphan',r'from NYSDEC Orphaned Wells',d_orphan),('ewaste',r'Electronic Waste Recycling Facilities',d_ewaste),('spills',r'NYSDEC Spill Incidents',d_spills),
     ('birding',r'NYSDEC Birding Trail Locations',d_birding),('cdphp',r'CDPHP Cycle Station Locations',d_cdphp),
     ('sedcap_only',r'DEC Sediment Caps export — no matching',lambda n,nm:'Contaminated-sediment site in NYSDEC\'s Sediment Caps layer with no matching remediation pin; '+g(r'(status [^.]+\. Cap: [^.]+)',n)+'.')]
if __name__=='__main__':
    wb=openpyxl.load_workbook(p); tot=collections.Counter(); skipped=collections.Counter()
    for ws in wb.worksheets:
        h={c.value:c.column for c in ws[1] if c.value}
        if 'Notes' not in h or 'Description' not in h or ws.title.startswith('EXAMPLE'): continue
        for r in range(2,ws.max_row+1):
            n=str(ws.cell(r,h['Notes']).value or ''); cur=ws.cell(r,h['Description']).value
            if cur and not str(cur).endswith(MARK):
                if any(re.search(rx,n) for k,rx,f in GEN): skipped[ws.title]+=1
                continue
            for k,rx,f in GEN:
                if re.search(rx,n):
                    d=f(n,ws.cell(r,h['Name']).value)
                    if d: ws.cell(r,h['Description']).value=re.sub(r'\.\.(?!\.)','.',re.sub(r'\s+',' ',d)).strip()+MARK; tot[(ws.title,k)]+=1
                    break
    wb.save(p)
    for k,v in sorted(tot.items()): print(v,k)
    print('left alone (hand-written Description present):',dict(skipped))
