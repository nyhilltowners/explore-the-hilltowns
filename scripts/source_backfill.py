"""v975 (2026-09-29, Laurie): add a 'Source' column to every POI sheet and fill it for dataset-ingested rows.
Usage: python3 scripts/source_backfill.py
Each source = "<dataset name> — <URL of the page it was pulled from>"; several joined with " · ". Detection is by
the provenance phrases the ingest scripts wrote into Notes, so re-running is idempotent (a row is rewritten only when
its computed Source differs). Curated rows (restaurants, etc.) keep a blank Source — their provenance is Laurie's own
directory work, and any published citation already sits in Description as "Source: …"."""
import re,openpyxl,collections
SRC={
 'fires':      ('NYSDEC Forest Ranger Wildland Fire Reporting Database: Beginning 2008','https://data.ny.gov/d/miub-n5th'),
 'mrds':       ('USGS Mineral Resources Data System (MRDS)','https://mrdata.usgs.gov/mrds/'),
 'mined':      ('NYSDEC Mined Land Permits: Beginning 1974','https://data.ny.gov/d/va8e-9s3h'),
 'orphan':     ('NYSDEC Orphaned Wells','https://data.ny.gov/d/vgue-bamz'),
 'bulk':       ('NYSDEC Bulk Storage Facilities in New York State','https://data.ny.gov/d/pteg-c78n'),
 'remed':      ('NYSDEC Environmental Remediation Sites','https://data.ny.gov/d/c6ci-rzpg'),
 'bcp':        ('NYSDEC Brownfield Cleanup Program, Certificates of Completion','https://data.ny.gov/d/ir93-7qzi'),
 'msgp':       ('NYSDEC SPDES Multi-Sector General Permit (MSGP) Facilities','https://data.ny.gov/d/7hs3-2njf'),
 'swmf':       ('NYSDEC Solid Waste Management Facilities','https://data.ny.gov/d/2fni-raj8'),
 'wwtp':       ('NYSDEC Wastewater Treatment Plants','https://data.ny.gov/d/2v6p-juki'),
 'cso':        ('NYSDEC Combined Sewer Overflows (CSOs): Beginning 2013','https://data.ny.gov/d/ephi-ffu6'),
 'spills':     ('NYSDEC Spill Incidents','https://data.ny.gov/d/u44d-k5fk'),
 'tv_inv':     ('NYSDEC Title V Emissions Inventory: Beginning 2010','https://data.ny.gov/d/4ry5-tfin'),
 'tv_permit':  ('NYSDEC Issued Title V Facility Permits','https://data.ny.gov/d/4n3a-en4b'),
 'pwl':        ('NYSDEC Waterbody Inventory / Priority Waterbodies List — Estuary Segments','https://data.ny.gov/d/pq3j-ueav'),
 'tires':      ('NYSDEC Waste Tire Abatement Sites','https://data.ny.gov/d/dapt-ejhb'),
 'ewaste':     ('NYSDEC Electronic Waste Recycling Facilities List','https://data.ny.gov/d/bhia-729m'),
 'sedcap':     ('NYSDEC Sediment Caps (NYS GIS Clearinghouse)','https://data.gis.ny.gov/datasets/nysdec::sediment-caps'),
 'birding':    ('NYSDEC Birding Trail Locations','https://data.ny.gov/d/dpe3-6uw2'),
 'cdphp':      ('CDTA — CDPHP Cycle Station Locations & Rental Service Areas (NYS GIS Clearinghouse)','https://data.gis.ny.gov/datasets/capital-district-transportation-authority'),
 'places':     ('location resolved via Google Places','https://www.google.com/maps'),
 'karst':      ('USGS SIR 2021-5094 closed-depression inventory (data release DOI 10.5066/P9AYMP94)','https://doi.org/10.5066/P9AYMP94'),
 'landslide':  ('USGS Landslide Inventory / NASA Global Landslide Catalog','https://www.usgs.gov/tools/us-landslide-inventory'),
 'tornado':    ('Tornado Project (Grazulis) NY county list 1950–2012','https://www.tornadoproject.com/'),
}
# (key, regex against Notes)
RULES=[
 ('fires',r'Wildland Fire Reporting Database'),('mrds',r'from USGS MRDS'),('mined',r'Mined Land Permits|DEC Mined Land permit \d'),
 ('orphan',r'from NYSDEC Orphaned Wells'),('bulk',r'from NYSDEC Bulk Storage'),('remed',r'from NYSDEC Environmental Remediation Sites'),
 ('bcp',r'\(v969\): BCP Certificate of Completion'),('msgp',r'Multi-Sector General Permit'),('swmf',r'from NYSDEC Solid Waste Management Facilities'),
 ('wwtp',r'Wastewater Treatment Plants'),('cso',r'from NYSDEC Combined Sewer Overflows'),('spills',r'NYSDEC Spill Incidents'),
 ('tv_inv',r'Title V Emissions Inventory'),('tv_permit',r'Issued Title V Facility Permits'),('pwl',r'Priority Waterbodies List'),
 ('tires',r'from NYSDEC Waste Tire Abatement'),('ewaste',r'Electronic Waste Recycling Facilities'),('sedcap',r'DEC Sediment Caps'),
 ('birding',r'NYSDEC Birding Trail Locations'),('cdphp',r'CDPHP Cycle Station Locations'),
 ('karst',r"research chat's karst layer"),('landslide',r'USGS Landslide Inventories'),('tornado',r'Tornado Project \(Grazulis\)'),
 ('places',r'resolved through Google Places'),
]
p='data/points_of_interest.xlsx'; wb=openpyxl.load_workbook(p); tot=collections.Counter()
for ws in wb.worksheets:
    h={c.value:c.column for c in ws[1] if c.value}
    if 'Notes' not in h or 'Name' not in h or ws.title.startswith('EXAMPLE'): continue
    if 'Source' not in h:
        col=ws.max_column+1; ws.cell(1,col).value='Source'; ws.cell(1,col)._style=ws.cell(1,ws.max_column-1)._style; h['Source']=col
    n=0
    for r in range(2,ws.max_row+1):
        note=str(ws.cell(r,h['Notes']).value or '')
        keys=[k for k,rx in RULES if re.search(rx,note)]
        if not keys: continue
        val=' · '.join(f"{SRC[k][0]} — {SRC[k][1]}" for k in keys)
        if ws.cell(r,h['Source']).value!=val: ws.cell(r,h['Source']).value=val; n+=1
        for k in keys: tot[(ws.title,k)]+=1
    print(ws.title, 'filled/updated', n)
wb.save(p)
for k,v in sorted(tot.items()): print('  ',v,k)
