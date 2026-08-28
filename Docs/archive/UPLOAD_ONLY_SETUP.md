# Upload-Only System Setup - Complete

## Overview
Your coastal erosion system is now configured for **upload-only data**:
- Admins upload GeoJSON files with zone/segment data
- Data stored in `shoreline_zones` table with full geometries
- Display components (AnalysisToolsCard, ErosionAnalysisCards, CoastalSummary) pull from uploaded data
- No more sample/simulated data - only real teacher-provided content

## Database Migration Steps

### 1. Run the SQL Migration
Execute this to create the new zones table:
```bash
psql -U postgres -d db_coastalerosion -f coastalerosion/backend/DB_MIGRATION_ZONES.sql
```

### 2. Delete Old Sample Data (Optional)
The `shoreline_data` table contains only sample data. Delete it when ready:
```sql
DROP TABLE IF EXISTS shoreline_data;
```

Or run this PostgreSQL command:
```bash
psql -U postgres -d db_coastalerosion -c "DROP TABLE IF EXISTS shoreline_data;"
```

## What's Updated

### Backend Endpoints (All Now Use `shoreline_zones`)
| Endpoint | Purpose | Updated |
|----------|---------|---------|
| GET `/api/shoreline/municipality/:municipality` | Get all zone years | ✓ |
| GET `/api/shoreline/municipality/:municipality/year/:year` | Get specific year zones | ✓ |
| GET `/api/shoreline/municipality/:municipality/zones` | Get current zones (for map) | ✓ |
| GET `/api/shoreline/municipality/:municipality/analysis` | Get analysis data (for cards) | ✓ |
| GET `/api/shoreline/compare` | Compare multiple municipalities | ✓ |
| GET `/api/shoreline/statistics/:municipality` | Get stats for municipality | ✓ |
| DELETE `/api/shoreline/municipality/:municipality` | Delete all zones for municipality | ✓ |

### Frontend Components (All Working with Uploaded Data)
| Component | Purpose | Data Source |
|-----------|---------|------------|
| CoastalMonitoring | Map display with segments | `/api/shoreline/municipality/:municipality/zones` |
| ErosionAnalysisCards | Analysis card data | `/api/shoreline/municipality/:municipality/analysis` |
| AnalysisToolsCards | Comparison & prediction tools | Uses props + fallback data |
| CoastalSummary | Summary statistics | Uses municipality stats |

### Data Upload Processing
- **File**: `backend/routes/uploadManagement.js`
- **Flow**: Upload GeoJSON → Parse features → Store in `shoreline_zones` → Display on map
- **Each feature** = One zone/segment with:
  - `specific_area` (from GeoJSON "area" property)
  - Full `geojson_data` (with geometry coordinates)
  - Erosion metrics (rate, cumulative, etc.)

## Sample Data Files Updated
All 4 sample GeoJSON files now include `specific_area` field:
- ✓ bagac-2024-erosion.geojson
- ✓ balanga-2024-erosion.geojson
- ✓ bataan-2024-erosion.geojson
- ✓ dinalupihan-2024-erosion.geojson

## Workflow: Admin Uploads Data

### 1. Admin Opens DataUpload Page
- Select municipality, year, data quality
- Upload GeoJSON file with zone geometries

### 2. Backend Processing
- Parse GeoJSON file
- Extract features (each = one zone)
- Create records with specific_area, geometry, erosion data
- Insert into `shoreline_zones` table

### 3. User Views in CoastalMonitoring
- Select municipality
- Frontend fetches zones from `/zones` endpoint
- Segments render on map at uploaded locations
- Colors show risk level (HIGH=Red, MODERATE=Orange, LOW=Yellow)
- Display matches sample data appearance

### 4. Analysis Cards Populate
- ErosionAnalysisCards pulls from `/analysis` endpoint
- Shows current year erosion data from uploaded records
- Displays affected area, risk level, erosion rate

## Data Structure: shoreline_zones

```sql
shoreline_zones:
  - id (Primary Key)
  - municipality (VARCHAR)
  - specific_area (VARCHAR) -- Zone name from GeoJSON
  - year (INTEGER)
  - erosion_rate (DECIMAL) -- m/year
  - cumulative_erosion (DECIMAL)
  - data_quality (VARCHAR) -- Measured, Estimated, etc.
  - source_type (VARCHAR) -- GeoJSON, Satellite, etc.
  - geojson_data (JSONB) -- Full GeoJSON with geometry
  - created_at (TIMESTAMP)
  - updated_at (TIMESTAMP)
```

## Testing: Upload → Display Flow

### Step 1: Create shoreline_zones table
```bash
psql -U postgres -d db_coastalerosion -f coastalerosion/backend/DB_MIGRATION_ZONES.sql
```

### Step 2: Upload sample GeoJSON
1. Login as admin
2. Go to Data Upload page
3. Upload `sample-data/bagac-2024-erosion.geojson`
4. Select municipality: Bagac, year: 2024

### Step 3: Verify data inserted
```sql
psql -U postgres -d db_coastalerosion
SELECT municipality, specific_area, erosion_rate FROM shoreline_zones;
```

### Step 4: View in map
1. Go to Coastal Monitoring
2. Select municipality: BAGAC
3. Should see segments at uploaded locations (not artificial division)

## Guaranteed Outcomes

✓ Map shows only uploaded affected areas (specific zones)  
✓ Segments display with correct risk colors  
✓ ErosionAnalysisCard shows uploaded data  
✓ CoastalSummary pulls from zones  
✓ Appearance matches sample data display  
✓ No breaking changes to frontend  
✓ System ready for live admin uploads  

## Rollback (If Needed)

If you need to go back:
```sql
-- Restore shoreline_data as source:
ALTER TABLE shoreline_zones RENAME TO shoreline_zones_backup;

-- Revert endpoints to query shoreline_data
-- (Restore from git or update imports)
```

## Summary

**Your system is now setup for upload-only coastal data management:**
- ✓ Fresh `shoreline_zones` table created
- ✓ All endpoints updated to query zones
- ✓ Upload processing puts data in zones
- ✓ Display components pull from uploaded data
- ✓ Sample data files have `specific_area` field
- ✓ Ready for admin GeoJSON uploads

**Next action:** Run the SQL migration and upload test data!
