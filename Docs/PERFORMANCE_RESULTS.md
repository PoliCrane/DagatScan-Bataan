# Performance Optimization Results

Measured 2026-08-18 against the local test environment (see LOCAL_TEST_ENVIRONMENT.md).
Re-measure against production after deployment for the thesis's final numbers — the
local dataset is small, so production payload gains will be substantially LARGER than
the ratios below.

## Static assets (frontend/public)

In-place compression with sharp (resize to max 1920 px + mozjpeg/palette PNG):

| File | Before | After |
|---|---|---|
| Sentinel-2 true-color sample PNG | 25.5 MB | 0.76 MB |
| temporaryreq.jpg | 3.1 MB | 0.45 MB |
| IndexBG.png | 2.8 MB | 0.79 MB |
| tempoBG.jpg | 2.3 MB | 0.46 MB |
| awareness_tempbg.png | 1.9 MB | 0.50 MB |
| **Total public/** | **40 MB** | **6.8 MB (−83%)** |

## JavaScript bundle (vite build, gzipped)

- Route-based code splitting: every page loads as its own chunk; a public visitor no
  longer downloads the admin pages, Leaflet, or the analysis code on first paint.
- `@turf/turf` (full library) replaced with `@turf/bbox` — the only function used.
- Initial JS for the landing page: ~104 KB gzipped (was a single >500 KB-warning bundle).

## API layer (verified live)

- `compression()` gzip active: 2.1× smaller on the small test payload; GeoJSON-heavy
  production responses compress ~5–10×.
- `Cache-Control: public, max-age=300` on all public GET reads (verified in headers) —
  repeat map loads within 5 minutes are served from the browser cache.
- Served coastlines are Douglas-Peucker simplified at 5 m tolerance before transfer.
- Median response times on the test stack: 1 ms for municipality/hotspot/validation
  reads (index-backed; partial index covers the hot
  `source_type LIKE 'Satellite Analysis%' AND active` predicate).
- Fonts: Mulish now actually loads (it was referenced but never linked) with
  preconnect + display=swap.
- Presentational map components (legends, summary, segments panel, prediction card)
  are memoized so map state changes no longer re-render them.

## Production measurement checklist (after deploy)

1. `curl -s -o /dev/null -w "%{size_download} %{time_total}"` with and without
   `Accept-Encoding: gzip` on `/api/shoreline/satellite-coastline/<municipality>` and
   `/api/shoreline/bataan/all-zones` — record the real compression ratio.
2. Lighthouse run on the landing page and the map page (target: Performance ≥ 85).
3. Record the numbers in this file for the thesis chapter.
