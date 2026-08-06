# Color Display Debugging Guide

The code has been updated with comprehensive logging. Follow these steps to identify why colors aren't showing:

## Quick Start

1. **Start the dev server** (if not running):

   ```bash
   cd frontend
   npm run dev
   ```

2. **Open browser DevTools**: Press `F12`

3. **Go to Console tab** and look for these messages after page loads

## What to Check (in order)

### 1. Data Generation (Main Page Load)

Look for: `"Coastline extracted:"`

```
Expected output:
{
  totalSegments: 50+ (not 0)
  totalLength: 200+ (not 0)
  datasetLength: 50+ (not 0, should match totalSegments)
  firstSegmentColor: "#22c55e" or other valid hex color
  colorCounts: {
    green: 5-10
    lime: 10-15
    yellow: 20-30
    amber: 10-15
    red: 10-15
    // etc - not all zeros
  }
}
```

**If this is missing or shows zeros:**

- Problem is in coastline extraction or data generation
- Check `/data/BATAAN.geojson` is loaded
- Check GeoJSON has valid Polygon features

### 2. Dataset Generation

Look for: `"Generated dataset:"`

```
Expected output - should show arrays with color values
{
  count: 50+
  colors: ["#22c55e", "#84cc16", "#eab308", ...] // actual colors, not null
  samples: [
    { segmentId: 0, color: "#22c55e", erosionRate: 1.23, ... },
    { segmentId: 1, color: "#f59e0b", erosionRate: 0.45, ... },
    ...
  ]
}
```

**If colors are null or undefined:**

- Problem is in `fakeDataset.js` color assignment
- Fix: Check `getErosionColor()` function returns hex values

### 3. Component Receives Data

Look for: `"CoastlineLayer received data:"`

```
Expected output:
{
  segmentsCount: 50+
  erosionDataCount: 50+ (should match segmentsCount)
  firstSegment: {
    id: 0
    coordinates: [[lat,lng], [lat,lng], ...] // array of positions
    centerPoint: [lat, lng]
    ...
  }
  firstErosionData: {
    segmentId: 0
    coordinates: [[lat,lng], ...] // same as segment
    color: "#22c55e" // should have color
    erosionRate: 1.23
    ...
  }
}
```

**If color is missing in firstErosionData:**

- Problem is fakeDataset not adding color to return object

### 4. Segment Rendering

Look for: `"Rendering segment 0:"`, `"Rendering segment 1:"`, `"Rendering segment 2:"`

```
Expected output (3 lines):
{
  color: "#22c55e"
  coordinatesCount: 10+
  erosionRate: 1.45
  riskLevel: "Low"
}
```

**If these don't appear (no logs):**

- CoastlineLayer.renderSegment() not being called
- Check guard clauses are not returning null

## If Colors STILL Don't Show on Map

Even if all console logs look good, colors might not be rendering due to:

1. **CSS/Styling Issues**
   - Check that Polyline color prop is not being overridden
   - Verify no global CSS is setting all lines to gray/black

2. **Leaflet/React-Leaflet Issue**
   - Try setting explicit `pathOptions={{ color: '#22c55e' }}`
   - Check if Polyline accepts `color` or needs `pathOptions.color`

3. **Missing Dependencies**
   - Verify `@turf/turf` is installed: `npm list @turf/turf`
   - Verify `react-leaflet` version is 5.0.0+

## Color Codes Reference

- `#22c55e` = Green (Accretion - land growing)
- `#84cc16` = Lime (Stable - no change)
- `#eab308` = Yellow (Low erosion)
- `#f59e0b` = Amber (Moderate erosion)
- `#ef4444` = Red (High erosion)

## If Everything Looks Fine but Still No Colors

Add this to CoastlineLayer.jsx `renderSegment()` function:

```javascript
console.error("SEGMENT RENDERING:", {
  segmentId: segmentData.segmentId,
  color: segmentData.color,
  coordinates: segmentData.coordinates,
  positions: segmentData.coordinates,
  polylineProps: {
    color: segmentData.color,
    weight: weight,
    opacity: opacity,
  },
});
```

Then check each segment that renders - verify color is being passed to Polyline.
