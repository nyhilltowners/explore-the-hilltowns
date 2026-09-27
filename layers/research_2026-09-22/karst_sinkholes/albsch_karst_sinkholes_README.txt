ALBANY-SCHENECTADY KARST SINKHOLES (CORRECTED) — carbonate-outcrop-hosted
==========================================================================

*** CORRECTION (supersedes earlier version) ***
Two attribute meanings were undocumented in the Albany shapefile and were
inferred wrongly. The Schoharie-Montgomery metadata (USGS P9AYMP94 v4.0)
supplies the authoritative definitions:

1) verify codes (were guessed; now official):
     0 = false-positive feature identification   (dropped)
     1 = positively identified  (a REAL depression)  <- confident tier
     2 = unable to identify     (ambiguous; NOT "confirmed")
   Earlier notes called code 2 the "confirmed" tier. That was backwards:
   code 1 is the positively-identified tier; code 2 is ambiguous.

2) bedrock symbol Dhm:
     Don = Onondaga Limestone            (carbonate / soluble)
     Dhg = Helderberg Group              (carbonate / soluble)
     Dhm = Hamilton Group over Onondaga  (SHALE - NOT carbonate)
   The earlier count of 30 karst sinks wrongly treated Dhm as carbonate.

CORRECTED RESULT (145 verified depressions tested):
  - 22 on carbonate OUTCROP (Don 8, Dhg 14) -> karst sinkholes.
      verify: 19 positively identified (code 1), 3 ambiguous (code 2).
  - 8 on Dhm (Hamilton over Onondaga) -> possible COVERED/mantled karst
      (soluble Onondaga is buried, so cover-collapse is possible but the
      surface rock is non-carbonate). Delivered separately as
      albsch_covered_karst_candidates_*.  verify: 7 code 1, 1 code 2.
  - 115 off all mapped bedrock units -> not karst.

FILES:
  albsch_karst_sinkholes_polygons.geojson / _centroids.geojson / _centroids.csv
     = the 22 carbonate-outcrop karst sinkholes (primary layer).
  albsch_covered_karst_candidates_*  = the 8 Hamilton-over-Onondaga features.
  Fields: verify, verify_meaning, host_unit, area_m2, glyph (U+1F573).
  CRS: reprojected NAD83 UTM 18N -> WGS84.

RECOMMENDATION: treat verify=1 as your confident set; carry verify=2 as
flagged/ambiguous. For the tightest karst layer, use the 22 outcrop sinks;
consider the 8 covered-karst candidates a separate, lower-certainty class.

PROVENANCE: USGS SIR 2021-5094 / data release DOI 10.5066/P9AYMP94 (v4.0,
2024; Sporleder, DeMott, Fisher, Keto, Fisher) + 2018 verified depression set.
