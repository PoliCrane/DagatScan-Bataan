# Tidal Correction — Status and How to Complete It

## What exists in code

`backend/services/tidalCorrection.js` implements the standard horizontal correction:

```
horizontal displacement = tide level (m, vs datum) / tan(beach slope)
correctShorelineToDatum(points, tideLevelMeters, beachSlopeDegrees)
```

It moves an observed waterline seaward/landward along the geographic seaward normal so
that waterlines observed at different tide stages become comparable at one datum.
Verified by unit tests (`backend/test/tidalCorrection.test.js`).

## Why it is NOT wired into the pipeline yet

The current pipeline extracts shorelines from **annual or dry-season median composites**,
which blend many acquisition times — a single tide level for the composite does not
exist. Correctly applying tidal correction requires two inputs the system does not have:

1. **Tide level per composite** — the median composite's effective water level.
   Reasonable proxy: the mean tide level (MTL) at the nearest station; the composite
   median approximates a mid-tide waterline, which is why the residual error is already
   bounded (~±10–20 m, see ERROR_BUDGET.md).
2. **Beach slope per area** — from field measurement (clinometer at the GPS validation
   visit — pairs perfectly with item C4) or estimated from published typology.

## What the group needs to do

1. Get tide predictions for Manila Bay (NAMRIA tide tables; the Manila South Harbor
   station is the reference for Bataan's east coast) and note MTL vs the chart datum.
2. Measure or estimate beach slope for each validated area (even 2-3 areas is enough
   for the thesis chapter).
3. Where a single-scene shoreline is used (not a composite), call
   `correctShorelineToDatum` with that scene's predicted tide level before storing.
4. In the thesis, report the correction formula, the slope values used, and the
   before/after positions for the validated areas.

Until per-scene processing exists, the honest statement for the panel is: "waterlines
come from annual median composites, which approximate mean tide; the residual tidal
uncertainty of ±10–20 m is included in our error budget, and the correction utility is
implemented for single-scene use."
