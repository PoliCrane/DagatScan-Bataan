# Risk Tier Thresholds — Sources and Citation Status

## Current thresholds

Defined in `backend/services/riskClassification.js` (backend source of truth) and mirrored
in `frontend/src/utils/segmentData.js`, applied to the shoreline change rate in m/year
(negative = erosion, positive = accretion):

| Tier | Rate (m/year) |
|---|---|
| Very High | rate ≤ −5 |
| High | −5 < rate ≤ −1 |
| Moderate | −1 < rate < 1 |
| Low | 1 ≤ rate < 5 |
| Very Low | rate ≥ 5 |

Shoreline status (separate from risk tiers) uses a ±0.5 m/year stable band:
|rate| < 0.5 = Stable, otherwise Erosion (negative) or Accretion (positive).

## Citation status — ACTION REQUIRED before defense

The code previously attributed these thresholds to "MGB Table 1" with no document
reference. As of 2026-08-16, no publicly accessible MGB (Mines and Geosciences Bureau,
DENR) document listing these exact m/year thresholds could be located online. What is
verifiable:

- MGB conducts Coastal Geohazard Assessments nationwide and uses a 5-rank vulnerability
  scale (1–5: Very Low, Low, Moderate, High, Very High) across assessment parameters.
  Reports are distributed through the MGB Central Database Portal:
  http://databaseportal.mgb.gov.ph (Coastal Geohazard Assessment Report section) and
  regional offices (e.g., https://region2.mgb.gov.ph/coastal-geohazard-assessment-reports/).
- The closest internationally citable standard is the **USGS Coastal Vulnerability Index**
  (Thieler, E.R. & Hammar-Klose, E.S., 1999, USGS Open-File Report 99-593), which ranks
  shoreline change rate as: Very Low > +2.0; Low +1.0 to +2.0; Moderate −1.0 to +1.0;
  High −1.1 to −2.0; Very High < −2.0 m/year. The system's Moderate band (−1 to +1)
  matches the CVI exactly; the ±5 outer thresholds do not (CVI uses ±2).

## What the group must do (pick one)

1. **Obtain the actual MGB document** — request the Coastal Geohazard Assessment report
   for Bataan (or the national methodology manual) from the MGB portal or the MGB Region
   III office, confirm the thresholds, and cite the document (title, year, table number)
   in the thesis; or
2. **Recast the citation as USGS CVI** — cite Thieler & Hammar-Klose (1999) and either
   (a) adjust the outer thresholds from ±5 to ±2 m/year to match the CVI exactly, or
   (b) explicitly state in the methodology that the outer bounds were widened to ±5 m/year
   for local conditions, with justification.

Do not present "MGB Table 1" to the panel without the physical document in hand.
