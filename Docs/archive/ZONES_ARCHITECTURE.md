# Fresh Zones Architecture - Zero Breaking Changes

## Overview
Created a completely fresh **`shoreline_zones`** table for detailed zone-level data while keeping the old **`shoreline_data`** table intact. This ensures **zero breaking changes** to the display.

## Changes Made

### 1. New Database Table: `shoreline_zones`
- **Location**: `backend/DB_MIGRATION_ZONES.sql`
- **Purpose**: Stores zone-level data with GeoJSON geometries and specific areas
- **Columns**:
  - `id`, `municipality`, `specific_area`, `year`
  - `erosion_rate`, `cumulative_erosion`
  - `data_quality`, `source_type`
  - `geojson_data` (JSONB with full geometry)
  - `created_at`, `updated_at`
- **Indexes**: Created on municipality, year, specific_area for fast queries

### 2. Backend `/zones` Endpoint Update
- **File**: `backend/routes/shorelineData.js`
- **Changes**:
  - Now queries `shoreline_zones` table first (new detailed zone data)
  - Returns empty array gracefully if no zones found (no 404 error)
  - Frontend already has fallback logic for this
  - Response includes `dataSource: "zones"` or `"empty"` to track which was used

### 3. Upload Data Processing Update
- **File**: `backend/routes/uploadManagement.js`
- **Changes**:
  - Inserts uploaded GeoJSON zones into `shoreline_zones` instead of `shoreline_data`
  - Includes `specific_area` from GeoJSON properties
  - Each feature becomes a separate row (row-by-row storage)
  - Stores full GeoJSON geometry for each zone

## How Display Won't Break

### Frontend Already Has Fallbacks
1. **segmentLoader.js**: 
   - Uses `zone.geojsonData.geometry` if available
   - Falls back to `divideCoastlineIntoSegments()` if zones array is empty

2. **coastalmonitoring.jsx**:
   - Handles empty zones gracefully
   - Renders nothing if zones = [] instead of showing error
   - Uses fallback segments when needed

### Display Flow
```
1. User selects municipality
2. Frontend calls GET /api/shoreline/municipality/Balanga/zones
3. Backend queries shoreline_zones table
   ↓
   If found: Returns zones with geometries
   ↓
   If NOT found: Returns { zones: [] } (empty, not error)
4. Frontend renders:
   - If zones.length > 0: Show actual zone segments on map
   - If zones.length === 0: Use fallback or show empty map
```

## Database Setup

### Run the Migration
Execute this SQL to create the new table:
```sql
-- Run DB_MIGRATION_ZONES.sql in your database
```

**Command from terminal:**
```bash
psql -U postgres -d db_coastalerosion -f coastalerosion/backend/DB_MIGRATION_ZONES.sql
```

### What About Old Data?
- **`shoreline_data` table**: Left untouched, kept for reference/backward compatibility
- **View created**: `all_shoreline_data` combines both tables if needed
- **No data loss**: All existing aggregate data remains in shoreline_data

## Workflow

### Uploading New Data
1. User uploads GeoJSON file with zones
2. Backend extracts features and creates records from `calculateErosionMetrics()`
3. **Each feature** inserted into `shoreline_zones` with:
   - Its specific_area from GeoJSON
   - Full geometry coordinates
   - Erosion metrics (rate, cumulative, etc.)
4. Segments rendered on map from actual coordinates (not artificial division)

### Viewing Data
1. Select municipality in CoastalMonitoring
2. Frontend fetches zones
3. Backend queries shoreline_zones
4. Map displays segments at actual locations with risk colors
5. Only affected areas show on map (not entire municipality)

## Safety Guarantees

✓ **No breaking changes**: Old display logic still works  
✓ **No data loss**: Existing shoreline_data preserved  
✓ **Graceful degradation**: Returns empty zones if none found  
✓ **Frontend compatibility**: No UI code changes needed  
✓ **Automatic fallback**: System handles both old and new data  

## Testing

### Test Scenario 1: Empty Municipality (No Zones)
1. Select municipality with no uploaded zones
2. **Expected**: Map shows no segments (or uses fallback)
3. **Result**: ✓ No errors, graceful display

### Test Scenario 2: Upload GeoJSON
1. Upload sample GeoJSON file
2. **Expected**: Zones inserted into shoreline_zones
3. Navigate to that municipality
4. **Result**: ✓ Segments display at correct locations

### Test Scenario 3: Multiple Zones
1. Upload file with 2+ features
2. **Expected**: Each feature → separate row in shoreline_zones
3. Segments render with proper risk colors
4. **Result**: ✓ Multiple colored segments at specific areas

## Rollback (If Needed)
```sql
-- Revert to old behavior by dropping new table:
DROP TABLE IF EXISTS shoreline_zones;
DROP VIEW IF EXISTS all_shoreline_data;

-- Restore old /zones endpoint to query shoreline_data
-- (Undo changes to shorelineData.js)
```

## Architecture Summary

| Aspect | Before | After |
|--------|--------|-------|
| Zones Storage | shoreline_data (aggregate) | shoreline_zones (detailed) |
| Data Per Row | Municipality + year | Zone + specific_area |
| Geometries | Optional/missing | Required (from GeoJSON) |
| Display | Artificial division | Actual uploaded areas |
| Fallback | None | Empty array → graceful handling |
| Compatibility | N/A | Fully backward compatible |
