SCHOHARIE-MONTGOMERY KARST SINKHOLES — carbonate-outcrop-hosted (30 cm)
=======================================================================
Same corrected method as the Albany-Schenectady layer.

verify codes (USGS P9AYMP94 metadata): 0=false positive (dropped),
  1=positively identified (confident), 2=unable to identify (ambiguous).
bedrock: Don=Onondaga Ls & Dhg=Helderberg Grp = carbonate/soluble;
  Dhm=Hamilton Grp (shale over Onondaga) = NOT outcrop carbonate.

INPUT: SchoMont_30cm closed depressions, verify 1 & 2 (62 tested).
RESULT:
  - 18 karst sinkholes on carbonate OUTCROP (Dhg 14, Don 4);
      verify: 16 positively identified (code 1), 2 ambiguous (code 2).
  - 6 covered-karst candidates on Dhm (Hamilton over buried Onondaga);
      verify: 5 code 1, 1 code 2  (file: schomont_covered_karst_candidates_*).
  - 38 off carbonate/covered -> not karst.

CONTEXT: Schoharie's verified depressions are more karst-concentrated than
Albany-Schenectady's (18/62 = 29% on carbonate vs 22/145 = 15%), consistent
with the Cobleskill Plateau / McFail's karst.

FILES: _polygons.geojson / _centroids.geojson / _centroids.csv.
  Fields: verify, verify_meaning, host_unit, area_m2, glyph (U+1F573).
  CRS: reprojected NAD83 UTM 18N -> WGS84. Treat verify=1 as the confident set.
PROVENANCE: USGS SIR 2021-5094 / data release DOI 10.5066/P9AYMP94 (v4.0, 2024).
