# Satellite Image Processing Implementation Guide

## Overview

This guide implements **GIS-level accurate satellite image processing** comparable to GeoJSON uploading, with these key features:

| Feature              | GeoJSON               | Satellite Image            |
| -------------------- | --------------------- | -------------------------- |
| Format Validation    | ✅ JSON schema        | ✅ GeoTIFF/JPG/PNG         |
| Georeferencing       | ✅ Built-in           | ✅ World files + embedded  |
| Boundary Extraction  | ✅ Features           | ✅ Edge detection          |
| Metric Calculation   | ✅ From properties    | ✅ From comparison         |
| Zone Storage         | ✅ Per-feature rows   | ✅ Per-segment rows        |
| Quality Tracking     | ✅ Data quality field | ✅ Confidence + assessment |
| Database Integration | ✅ Transaction-based  | ✅ Transaction-based       |

---

## Architecture Components

### 1. **imageGeoreference.js** - Coordinate System Mapping

Converts pixel coordinates to geographic coordinates (lat/lng)

**Methods:**

- `extractGeoreference(imagePath, metadata)` - Auto-detect georeferencing
- `readWorldFile(imagePath)` - Parse .tfw, .jgw world files
- `pixelToGeo(pixelX, pixelY, georeference)` - Convert coordinates
- `getImageBounds(georeference, width, height)` - Get bounding box

**Supported Input:**

```
Satellite Image (.tiff, .jpg, .png)
    ↓
Check for world file (.tfw/.jgw)
    OR
Check for embedded GeoTIFF metadata
    OR
Use manual bounds from metadata
    ↓
Georeference object ready
```

### 2. **imageCoastlineDetection.js** - Automated Boundary Finding

Uses image processing algorithms to extract coastlines

**Algorithms:**

- **RGB Detection**: Water/land classification using blue channel thresholding
- **Multispectral (NDWI)**: Normalized Difference Water Index for accurate water masking
- **Edge Detection**: Canny/Sobel operators to find sharp water-land boundaries
- **Polyline Simplification**: Ramer-Douglas-Peucker to reduce noise

**Output:**

```javascript
{
  coastlinePoints: [
    {x: 150, y: 200},  // Pixel coordinates
    {x: 151, y: 199},
    ...
  ],
  pointCount: 1245,
  confidence: 0.87,  // 0-1 scale
  method: 'RGB_water_classification'
}
```

### 3. **imageSatelliteAnalysis.js** - Metric Extraction

Compares detected coastlines with reference data to extract erosion metrics

**Key Functions:**

- `compareWithReferenceCoastline()` - Cross-reference comparison
- `calculateErosionFromDistances()` - Converts measurements to rates
- `assessQuality()` - Identifies issues and confidence
- `extractZoneMetrics()` - Divides coastline into 5km zones

**Output Metrics (matching GeoJSON format):**

```javascript
{
  erosionRatePerYear: 1.2,        // m/year
  netRetreatMeters: 10.5,         // Total change
  averageRetreatMeters: 12.3,     // Where erosion occurred
  confidenceLevel: 0.82,          // 0-1 scale
  dataPointsUsed: 256,
  qualityAssessment: 'High'
}
```

---

## Integration with Existing Upload System

### Current Flow (GeoJSON)

```
User uploads GeoJSON
    ↓
Parse + Validate
    ↓
Extract features per zone
    ↓
Calculate metrics from properties
    ↓
Store in shoreline_zones table (row per zone)
    ↓
Complete ✅
```

### New Flow (Satellite Image)

```
User uploads satellite image
    ↓
Extract georeferencing (world file or embedded)
    ↓
Detect coastline via edge detection
    ↓
Compare with reference (GeoJSON or previous year)
    ↓
Calculate erosion metrics
    ↓
Extract zone segments (5km intervals)
    ↓
Assess quality + confidence
    ↓
Store in shoreline_zones table (row per zone)
    ↓
Complete ✅
```

---

## Database Storage

When a satellite image is processed, it creates identical records to GeoJSON:

```sql
INSERT INTO shoreline_zones (
  municipality,
  specific_area,        -- "Zone_1", "Zone_2", etc.
  year,
  erosion_rate,         -- m/year (calculated from comparison)
  cumulative_erosion,   -- Total retreat in meters
  data_quality,         -- Quality assessment result
  source_type,          -- "Satellite_Image"
  geojson_data          -- Stores detected coastline GeoJSON
) VALUES (...)
```

Example record:

```json
{
  "municipality": "Balanga",
  "specific_area": "Zone_1_SeaFacing",
  "year": 2026,
  "erosion_rate": 1.24,
  "cumulative_erosion": 12.4,
  "data_quality": "High",
  "source_type": "Satellite_Image",
  "geojson_data": {
    "type": "Feature",
    "geometry": {
      "type": "LineString",
      "coordinates": [[120.5, 14.4], ...]
    }
  }
}
```

---

## Setup Instructions

### 1. Install Required Dependencies

```bash
cd backend
npm install sharp geojson-validation geotiff
```

**Packages:**

- `sharp` - Fast image processing
- `geojson-validation` - (Already used)
- `geotiff` - For GeoTIFF support (optional, for advanced features)

### 2. Prepare World Files (if using JPG/PNG)

For any satellite image WITHOUT embedded georeferencing, create a world file:

**Example: balanga_2026.jpg → balanga_2026.jgw**

```
0.00001              # Pixel width (degrees per pixel)
0                    # Rotation
0                    # Rotation
-0.00001             # Pixel height (negative)
120.45678            # West boundary longitude
14.55432             # North boundary latitude
```

[Calculator tool available online to create world files from image corners]

### 3. Provide Reference Coastline

For accurate erosion rate calculation, upload reference coastline in one of two ways:

**Option A: Use existing GeoJSON**

```javascript
// When uploading satellite image, provide metadata:
{
  referenceCoastline: geoJsonCoastlinePoints,
  referenceYear: 2020,
  year: 2026
}
```

**Option B: Use previous year satellite image**

```javascript
// System automatically fetches last year's detected coastline
// Compares 2025 vs 2026 satellite images
```

**Option C: No reference (detection only)**

```javascript
// If no reference provided, returns:
{
  detectedCoastline: [...],
  confidence: 0.87,
  message: "Coastline detected. Upload reference for erosion metrics."
}
```

### 4. Configure Quality Thresholds

Edit `imageSatelliteAnalysis.js` assessQuality() function to adjust:

- Min confidence: `0.6` → increase for stricter validation
- Min data points: `50` → increase for more detailed analysis
- Outlier threshold: `3 * stdDev` → adjust sensitivity

---

## Usage Example

### Frontend (React Component)

```javascript
import { useState } from "react";

export function SatelliteUploadForm() {
  const [satelliteFile, setSatelliteFile] = useState(null);
  const [referenceGeojson, setReferenceGeojson] = useState(null);
  const [municipality, setMunicipality] = useState("Balanga");
  const [year, setYear] = useState(2026);

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append("satellite", satelliteFile);
    formData.append("municipality", municipality);
    formData.append("year", year);

    // Include reference for comparison
    if (referenceGeojson) {
      formData.append("referenceCoastline", JSON.stringify(referenceGeojson));
      formData.append("referenceYear", 2023);
    }

    const response = await fetch("/api/admin/uploads/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    console.log(
      "Detected coastline:",
      result.uploads[0].detection.coastlinePoints,
    );
    console.log(
      "Erosion rate:",
      result.uploads[0].analysis.erosionMetrics.erosionRatePerYear,
    );
    console.log("Quality:", result.uploads[0].analysis.quality.overallQuality);
  };

  return (
    <div>
      <input
        type="file"
        accept=".tif,.jpg,.png"
        onChange={(e) => setSatelliteFile(e.target.files[0])}
      />
      <button onClick={handleUpload}>Analyze Satellite Image</button>
    </div>
  );
}
```

### Backend Route Usage

The existing `/api/admin/uploads/upload` route already handles satellite files:

```bash
# Upload satellite image with automatic processing
curl -X POST http://localhost:5000/api/admin/uploads/upload \
  -F "satellite=@batanga_2026.tif" \
  -F "municipality=Balanga" \
  -F "year=2026" \
  -F "referenceCoastline=@reference_2023.geojson" \
  -F "referenceYear=2023"

# Returns:
{
  "success": true,
  "uploads": [
    {
      "type": "Satellite_Image",
      "success": true,
      "detection": {
        "coastlinePoints": 1245,
        "confidence": 0.87
      },
      "analysis": {
        "erosionMetrics": {
          "erosionRatePerYear": 1.24,
          "confidenceLevel": 0.82
        }
      },
      "zones": [
        {
          "zoneId": "Zone_1",
          "length": 5.2  // km
        }
      ]
    }
  ]
}
```

---

## Matching Accuracy with GeoJSON

### Accuracy Factors

| Factor              | GeoJSON                      | Satellite                     |
| ------------------- | ---------------------------- | ----------------------------- |
| Georeferencing      | Built-in properties          | World file + detection        |
| Coastline source    | Manual digitization          | Automated edge detection      |
| Metric accuracy     | ±0.1 m (if precise features) | ±2-5 m (resolution dependent) |
| Confidence tracking | Data quality field           | Calculated from consistency   |
| Zone division       | Feature-based                | Distance-based (5km)          |

### Resolution Impact

Satellite image accuracy depends on **spatial resolution**:

| Source           | Resolution | Accuracy |
| ---------------- | ---------- | -------- |
| GeoJSON (manual) | N/A        | ±0.5 m   |
| Worldview-3      | 0.31 m     | ±2-3 m   |
| Sentinel-2       | 10 m       | ±15-20 m |
| Landsat 8        | 30 m       | ±30-50 m |
| Google Maps      | 1-10 m     | ±5-15 m  |

### Quality Validation

Detected coastlines are validated against:

1. **Consistency**: Are all points roughly the same distance from reference?
2. **Connectivity**: Do points form continuous line?
3. **Confidence**: Statistical measure based on edge clarity
4. **Comparison**: Cross-check with GeoJSON if available

---

## Testing Checklist

- [ ] World file correctly created for test image
- [ ] Satellite image successfully georeferenced
- [ ] Coastline detected with reasonable point count (>100)
- [ ] Comparison with reference produces erosion rate
- [ ] Confidence > 0.7 for good quality images
- [ ] Zone extraction creates 5km segments
- [ ] Database records created with correct structure
- [ ] Quality assessment properly identifies issues
- [ ] Error handling works for malformed images

---

## Next Steps

1. **Testing**: Validate with real satellite imagery (Sentinel-2, Worldview)
2. **Calibration**: Adjust detection thresholds based on actual results
3. **Performance**: Optimize for large images (>100MB)
4. **UI**: Create satellite upload form with preview
5. **Automation**: Schedule periodic satellite image downloads
6. **Comparison**: Implement automated GeoJSON comparison workflow

---

## Troubleshooting

### Image Not Georeferenced

- **Error**: "No georeferencing data found"
- **Fix**: Create world file or provide bounds in metadata
- **Tool**: Use QGIS or online tools to create world file

### Low Confidence Coastline

- **Issue**: `confidence < 0.6`
- **Cause**: Image too cloudy, unclear water-land boundary
- **Fix**: Use higher resolution image or different date

### Mismatch with GeoJSON

- **Issue**: Satellite and GeoJSON coastlines differ significantly
- **Cause**: Different reference years or mapping methods
- **Fix**: Ensure same year, check for manual digitization errors

---

## References

- [Edge Detection (Canny/Sobel)](https://en.wikipedia.org/wiki/Canny_edge_detector)
- [NDWI Index](https://en.wikipedia.org/wiki/Normalized_difference_water_index)
- [World File Format](https://en.wikipedia.org/wiki/World_file)
- [GeoTIFF Specification](https://www.cogeo.org/)
- [Haversine Distance Formula](https://en.wikipedia.org/wiki/Haversine_formula)
