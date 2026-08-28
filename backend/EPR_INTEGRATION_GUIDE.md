# EPR Auto-Calculation Integration Guide

## Summary

The system now automatically calculates shoreline erosion rates (End-Point Rate) when uploading GeoJSON data that's missing `erosionRate` values.

## Architecture

### Files Created/Modified

1. **[backend/services/eprCalculator.js](../services/eprCalculator.js)**
   - Core haversine distance calculation
   - Validates inputs and handles edge cases
   - Returns: `{ erosionRate, distanceChange, yearsApart }`

2. **[backend/services/eprAutoCalculator.js](../services/eprAutoCalculator.js)** ✨ NEW
   - High-level service for automatic EPR calculation
   - Queries previous year data from database
   - Extracts coordinates from GeoJSON geometries
   - Integrates with upload workflow

3. **[backend/routes/uploadManagement.js](./uploadManagement.js)** (MODIFIED)
   - Added import: `const { autoCalculateErosionRates } = require("../services/eprAutoCalculator");`
   - Calls auto-calculation before saving features to database
   - All logging and error handling built-in

## How It Works

```
1. User uploads GeoJSON file for municipality/year
   ↓
2. Parse GeoJSON features
   ↓
3. FOR EACH FEATURE:
   - Check if feature.properties.erosionRate exists
   - If YES → Keep it, skip calculation
   - If NO → Query database for previous year's same zone
     → Extract previous coordinates
     → Compare with current coordinates using haversine formula
     → Attach calculated erosionRate to feature properties
   ↓
4. Save all features (with calculated/provided erosionRate) to database
```

## Integration Code

### Import in uploadManagement.js:
```javascript
const { autoCalculateErosionRates } = require("../services/eprAutoCalculator");
```

### Call in processGeoJSONFile():
```javascript
// Before saving features to database:
await autoCalculateErosionRates(client, parseResult.features, municipality, year);

// Then proceed with calculateErosionMetrics and database insert
const records = calculateErosionMetrics(parseResult.features, municipality, year);
```

## API: autoCalculateErosionRates

```javascript
async function autoCalculateErosionRates(client, features, municipality, year)
```

**Parameters:**
- `client` - PostgreSQL database client (from `pool.connect()`)
- `features` - Array of GeoJSON Feature objects
- `municipality` - Municipality name (string, case-insensitive)
- `year` - Current year (number)

**Behavior:**
- Modifies `features` array in-place, adding `erosionRate` to properties
- Skips features that already have `erosionRate` value
- Logs all operations to console (debugging)
- Silently skips if previous data not found
- Throws errors on database issues (caught and logged)

**Feature Properties After Calculation:**
```javascript
{
  erosionRate: -0.32,           // meters/year (negative = retreat)
  distanceChange: 1.6,           // meters between years
  calculatedFrom: {
    previousYear: 2020,
    currentYear: 2025,
    method: "haversine_epr"
  }
}
```

## Haversine Formula

The EPR is calculated using:

1. **Distance Calculation**: For each point in the newer shoreline, find the closest point in the older shoreline
2. **Average Distance**: Mean of all distance calculations
3. **Erosion Rate**: `-(avgDistance / yearsApart)`
   - Negative = shoreline retreat/erosion
   - Positive = shoreline advance/accretion

Formula uses Earth's radius = 6,371 km (6,371,000 meters)

## Database Query

```sql
SELECT year, geojson_data FROM shoreline_zones 
WHERE LOWER(municipality) = LOWER($1) 
  AND LOWER(specific_area) = LOWER($2)
  AND year < $3
ORDER BY year DESC
LIMIT 1
```

This finds the most recent previous year's data for the same zone.

## Geometry Support

Supports multiple GeoJSON geometry types:
- **LineString** - Direct coordinate array
- **MultiLineString** - Uses longest line
- **Polygon** - Uses outer ring
- **MultiPolygon** - Uses outer ring of first polygon

## Edge Cases Handled

✅ No previous year data → Skipped silently
✅ Invalid coordinates → Skipped with warning
✅ Database errors → Logged, continues with other features
✅ EPR calculation errors → Logged, feature keeps original erosionRate (if any)
✅ Year as string in DB → Converted to number with `parseInt()`
✅ erosionRate = 0 → Treated as valid value, NOT recalculated

## Testing

See [backend/sample-test-data/README.md](../sample-test-data/README.md) for complete test workflow.

**Quick Test:**
1. Upload `bagac-2020.geojson` (3 zones, no erosionRate)
2. Upload `bagac-2025.geojson` (3 zones, no erosionRate)
3. Check console output - should show:
   ```
   ✅ Northern Coastal Zone: EPR = -X.XX m/year
   ✅ Central Beach Area: EPR = -X.XX m/year
   ✅ Southern Cove: EPR = -X.XX m/year
   ```
4. Query database - erosionRate should be populated

## Console Logging

During upload, you'll see:
```
🚀 PROCESSING UPLOAD - AUTO-CALCULATION PHASE
   Municipality: Bagac, Year: 2025, Features: 3

📋 Auto-calculating EPR for Bagac (2025) - 3 features
  Checking Northern Coastal Zone...
  🔍 Searching for previous Northern Coastal Zone data in Bagac...
  Found 1 previous record(s) for Northern Coastal Zone
    Previous year: 2020
    Calculating EPR: 5 prev coords vs 5 current coords
  ✅ Northern Coastal Zone: EPR = -1.73 m/year (distance: 123.4m)

📊 CALCULATING METRICS FROM FEATURES
   Records extracted: 3
   [0] Northern Coastal Zone: erosionRate=-1.73
   [1] Central Beach Area: erosionRate=-1.73
   [2] Southern Cove: erosionRate=-1.73
```

## Error Codes

| Log Message | Meaning | Action |
|-------------|---------|--------|
| `ℹ️ No previous year data found` | First upload for this zone | Normal, skip auto-calc |
| `⚠️ No valid coordinates found` | Geometry missing/invalid | Check GeoJSON format |
| `⚠️ Previous coordinates could not be extracted` | DB data corrupt | Contact admin |
| `❌ EPR calculation failed` | haversine formula error | Check coordinate format |
| `⚠️ Database query error` | Connection issue | Check DB connection |

## Production Deployment

✅ Ready for production use
✅ No external dependencies beyond existing eprCalculator.js
✅ Uses existing database connection pool
✅ Comprehensive error handling and logging
✅ Reusable across any municipality/year combination
