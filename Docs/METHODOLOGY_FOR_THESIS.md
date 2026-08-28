# System Methodology — Thesis-Ready Summary

The manuscript's methodology chapter must describe THIS system, not the pre-improvement
one. Every paragraph below maps to code the panel can be shown. Use it to update the
methodology, results, and limitations chapters — and as the group's review guide for the
`improvements` branch.

## 1. Shoreline extraction

Sentinel-2 Level-2A imagery (2015–present; Landsat 5/7/8 Collection 2 for 1990–2014) is
composited per year (median, cloud-filtered via the SCL band / QA_PIXEL bits; an optional
Nov–Apr dry-season mode holds seasonal state constant). The McFeeters NDWI
(Green−NIR)/(Green+NIR) separates water (positive) from land (negative); MNDWI
(Green−SWIR) is available for turbid water. The water/land threshold is chosen per image
by Otsu's method with a plausibility fallback, replacing a fixed 0.0 cut. The shoreline
is then extracted at native raster resolution by marching-squares contouring with linear
interpolation, giving sub-pixel positional precision (unit-tested to ±0.25 px); a
256-pixel CNN-refined trace is the fallback path. *(Code: `earthEngineService.js`,
`imageThresholds.js`, `subpixelContour.js`, `imageCNNDetection.js`.)*

Honest CNN statement: the CNN refines the classical threshold's pseudo-labels
(self-supervised). Do not claim a standalone CNN accuracy unless the group completes the
labeled-mask evaluation (`Docs/CNN_EVALUATION_GUIDE.md`); report whichever extractor the
evaluation favors.

## 2. Shoreline change measurement

Yearly shorelines are compared to the earliest year (End Point Rate methodology) by
arc-length-fraction matching, with all distances computed on a latitude-corrected metric
(cos-latitude longitude scaling — no flat-earth constant). Change is SIGNED: the seaward
direction is resolved geographically (away from the Bataan peninsula interior), making
results independent of digitization or trace direction, and allowing both erosion
(negative) and accretion (positive) to be detected. The per-point median (not the mean)
gives the net change, so single defective trace regions cannot skew the rate; rates
beyond ±20 m/yr are rejected as implausible traces. *(Code: `geoUtils.js`,
`eprCalculator.js`, `imageSatelliteAnalysis.js`.)*

DSAS-compatible transect statistics (EPR, LRR, WLR, NSM, SCE at configurable spacing)
are available per area for direct comparison with the standard USGS methodology.
*(Code: `transectAnalysis.js`.)*

## 3. Trend estimation and prediction

Rates come from least-squares regression (LRR) over all available years (minimum 3),
with outlier rejection (standardized residual > 2.5, n ≥ 5). Each trend carries real
uncertainty: r², the slope's 95% confidence interval (t-distribution), and a two-tailed
significance p-value — stored and displayed, never clamped. Predictions extrapolate the
trend with a widening 95% confidence cone on the map and a "± CI" retreat estimate on
the card; horizons are capped at half the observed record length. Predictions are framed
as continuing-trend projections that refit yearly — storms, sea-level acceleration, and
coastal construction are explicitly out of model. *(Code: `eprCalculator.js`
`calculateLRR`/`calculateRobustLRR`, `cacheService_FK_Version.js`, the prediction UI.)*

## 4. Validation (the accuracy claim)

Accuracy is measured, not asserted, by hindcasting: the trend is fitted on all but the
last two years of each area's record, predicts those held-out years, and is scored
against observation — reporting position MAE/RMSE, Erosion/Accretion/Stable status
accuracy, risk-tier accuracy (exact and within-one-tier), leave-one-year-out MAE, and
accuracy per lead time (1–5+ years ahead). Every run is compared against a no-change
baseline to demonstrate skill. Results are stored and publicly displayed at
`/validation`. The pipeline itself was verified end-to-end against synthetic shorelines
with known rates (−2.0 and +1.2 m/yr recovered exactly; 100% status accuracy vs 0%
baseline). *(Code: `hindcastValidation.js`, `scripts/runHindcastValidation.js`.)*

State the metric in one sentence: "We report the percentage of coastal areas where the
predicted shoreline status of held-out years matched what was actually observed, against
a no-change baseline."

## 5. Risk classification and context

Rates classify into five tiers (±1, ±5 m/yr bounds; negative = erosion) with a ±0.5 m/yr
stable band — cite per `Docs/RISK_TIER_SOURCES.md` (obtain the MGB document or cite the
USGS CVI and justify the ±5 outer bounds). Year-to-year anomalies are contextualized
with typhoon passages (NOAA IBTrACS), ENSO state (CPC ONI), and wave climate
(Open-Meteo/ERA5), shown in-app per compared year. *(Code: `riskClassification.js`,
`scripts/fetchEventContext.js`.)*

## 6. Error budget and limitations (chapter material)

Summarize `Docs/ERROR_BUDGET.md`: sensor resolution, grid/processing, uncorrected tidal
stage (utility implemented, wiring needs field-measured beach slope —
`Docs/TIDAL_CORRECTION_GUIDE.md`), and compositing; what each mitigation in the pipeline
addresses; and the resulting minimum detectable rates per record length.

## 7. Software quality (one paragraph for the thesis)

The computation core is covered by 43 automated tests (backend `node --test`, frontend
vitest) including a risk-tier synchronization test; role-based access control is enforced
server-side with database-backed session checks; and the full system was verified
end-to-end on a local environment with a known-truth dataset before deployment.
