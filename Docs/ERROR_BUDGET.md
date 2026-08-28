# Shoreline Measurement Error Budget

Quantifies every known source of positional error in the satellite shoreline pipeline, so
accuracy claims can be defended and the minimum detectable erosion signal is explicit.
Belongs in the thesis methodology/limitations chapter.

## Error sources

### 1. Sensor resolution — ±10 m
Sentinel-2 B3/B8 are 10 m/pixel. A shoreline position derived from any single pixel is
uncertain by roughly one pixel.

### 2. Processing grid downsampling — the dominant term
`imageCNNDetection.js` resamples every image to a 256×256 grid (`TRACE_SIZE`) before
masking and tracing. The effective pixel size becomes `extent / 256`:

| Bounding box width | Effective grid pixel |
|---|---|
| 3 km | ~12 m |
| 5 km | ~20 m |
| 10 km | ~39 m |
| 15 km | ~59 m |

For typical municipality-scale boxes (5–15 km), grid quantization alone contributes
**±20–60 m** of position uncertainty. Mitigations: keep NDWI generation boxes as tight as
possible around the coast (biggest immediate lever), or implement sub-pixel contour
extraction at native resolution (planned enhancement; would cut this term to ~±3–5 m).
Note: raising `TRACE_SIZE` requires retraining the CNN — its input layer is fixed at
256×256 and persisted weights would be invalidated.

### 3. Tidal stage — ±10–70 m on gentle beaches, uncorrected
The instantaneous waterline moves horizontally by `tidal range / tan(beach slope)`.
Manila Bay's tidal range is roughly 1–1.2 m; for beach slopes of 1°–5° that is a
horizontal excursion of ~14–70 m between low and high tide. The pipeline applies **no
tidal correction**. The annual median composite (`earthEngineService.js`) averages many
tide states, which centers the waterline near a mean state but leaves residual uncertainty
estimated at **±10–20 m** and does not reference a vertical datum (MSL/MHW).

### 4. Compositing and season — ±5–15 m
The annual median composite mixes wet/dry season beach states and residual cloud/shadow
pixels (scenes are pre-filtered to <20% cloud). Seasonal beach profile change on exposed
coasts can be meters to tens of meters.

### 5. Mask and trace processing — ±1–2 grid pixels
Median filtering, morphological close/open, moving-average smoothing (k=4), and
Ramer-Douglas-Peucker simplification (ε=0.8 px) each shift the traced line by up to a
pixel or two of the processing grid — i.e., **±20–120 m** at municipality-scale boxes,
partially overlapping term 2.

### 6. Georeferencing — small
NDWI GeoTIFFs are exported in EPSG:4326 with Earth Engine's native alignment; linear
interpolation across the stated bounds adds sub-pixel error. Negligible next to terms 2–3.

## Total budget (uncorrelated RSS estimate)

For a typical 10 km box, annual median composite, no tidal correction:

- Grid + trace processing: ~±40 m
- Tide residual: ~±15 m
- Season/composite: ~±10 m
- Sensor: ~±10 m

**Root-sum-square ≈ ±45 m per yearly shoreline position.**

## What this means for erosion rates

The rate is a regression slope across N yearly positions, which suppresses independent
per-year noise by roughly √N and grows with the time span. With position noise σ ≈ 45 m:

| Years of data | Approx. detectable rate (95%) |
|---|---|
| 5 (2020–2024) | ~±9 m/yr — only extreme change detectable |
| 10 (2015–2024) | ~±3 m/yr — Very High tier detectable |
| 30 (Landsat-extended) | ~±0.7 m/yr — typical erosion detectable |

This is why the system enforces a 3-year minimum for publishing a trend, uses the median
of per-point changes (robust to trace defects), reports signal-to-noise-based confidence
(`imageSatelliteAnalysis.js`), and validates against held-out years
(`scripts/runHindcastValidation.js`) instead of claiming theoretical accuracy.

## Highest-impact reductions (in order)

1. Tighter NDWI bounding boxes per area (free — reduces term 2 immediately).
2. Sub-pixel shoreline extraction at native 10 m resolution (removes term 2).
3. Landsat time-series extension to ~30 years (shrinks rate uncertainty by ~6× vs 10 years).
4. Tidal correction using NAMRIA predictions + estimated beach slope (removes most of term 3).
5. Dry-season-only composites (reduces term 4).
