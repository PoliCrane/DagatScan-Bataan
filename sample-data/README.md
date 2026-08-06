# Sample GeoJSON Files for Testing

## Overview
These sample GeoJSON files contain realistic coastal erosion data for different municipalities in Bataan. They're ready to upload to the Data Upload Center to test the system functionality.

## Files Included

### 1. **balanga-2024-erosion.geojson**
**Municipality**: Balanga  
**Year**: 2024  
**Records**: 3 shoreline segments

Contains erosion data for:
- Northern Shoreline: -2.3 m/year (Measured)
- Central Shoreline: -1.8 m/year (Measured)
- Mangrove Zone: -1.5 m/year (Estimated)

**Use for testing**: Complete GeoJSON with all fields

---

### 2. **bagac-2024-erosion.geojson**
**Municipality**: Bagac  
**Year**: 2024  
**Records**: 2 shoreline segments

Contains erosion data for:
- Military Zone Outer Coast: -3.1 m/year
- Inner Bay: -2.8 m/year

**Use for testing**: Satellite imagery sourced data (Sentinel-2, Landsat 8)

---

### 3. **bataan-2024-erosion.geojson**
**Municipality**: Bataan  
**Year**: 2024  
**Records**: 3 shoreline segments

Contains erosion data for:
- Port Area: -0.9 m/year (GPS Survey)
- Industrial Zone: -1.2 m/year  
- Protected Area: -1.6 m/year

**Use for testing**: Multiple data sources (GPS, aerial, satellite)

---

### 4. **dinalupihan-2024-erosion.geojson**
**Municipality**: Dinalupihan  
**Year**: 2024  
**Records**: 2 shoreline segments

Contains erosion data for:
- Bay Shoreline: -2.0 m/year
- Agricultural Zone: -1.7 m/year

**Use for testing**: Alternative field naming (`change_meters` instead of `erosionRate`)

---

## GeoJSON Structure

Each file follows this structure:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[lon, lat], [lon, lat], ...]
      },
      "properties": {
        "erosionRate": -2.3,            // Required (or use change_meters)
        "area": "Zone Name",             // Optional but recommended
        "name": "Feature Name",          // Optional
        "source": "Data Source",         // Optional
        "data_quality": "Measured",      // Optional
        "cumulativeChange": -15.8        // Optional
      }
    }
  ]
}
```

## Testing Workflow

### Step 1: Upload Basic Data
1. Navigate to Admin → Data Upload
2. Drag `balanga-2024-erosion.geojson` to the Dataset zone
3. Fill in:
   - Municipality: **Balanga**
   - Specific Area: **Balanga Main Coastal Zone**
   - Year: **2024**
4. Click **Upload Files**
5. Verify: Should see success with 3 records processed

### Step 2: Test Different Data Source
1. Upload `bagac-2024-erosion.geojson`
2. Fill in:
   - Municipality: **Bagac**
   - Specific Area: **Bagac Military Zone**
   - Year: **2024**
3. Verify: GPS and Satellite imagery sources properly handled

### Step 3: Test Error Handling (Optional)
- Try modifying a GeoJSON to remove `erosionRate` field
- System should reject with error message

### Step 4: Test Multiple Uploads
- Upload different municipalities to test filtering
- Query `/api/admin/uploads` to see upload history

## Key Features Being Tested

✅ GeoJSON format validation  
✅ Erosion metric extraction  
✅ Geographic coordinate bounds calculation  
✅ Database insertion with transactions  
✅ Upload history tracking  
✅ Form validation (municipality, area, year)  
✅ Data quality assessment  
✅ Multiple source attribution  

## Expected Results After Upload

**Database Records Created**:
- `shoreline_data` table gets new records with erosion metrics
- `upload_history` table tracks the upload
- Geographic bounds calculated and stored

**Available for Use In**:
- Coastal Monitoring visualization
- Erosion Analysis reports
- Historical trend analysis

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid GeoJSON" | Ensure file is valid JSON (use JSON validator) |
| "erosionRate field required" | Add `erosionRate` or `change_meters` to properties |
| "Municipality is required" | Select municipality from dropdown |
| "Specific Area is required" | Enter a coastal zone name |
| File too large | Keep GeoJSON under 50MB |

## Real-World Data Sources

For actual coastal erosion data, consider:
- **Satellite Imagery**: Sentinel-2, Landsat 8, Planet Labs
- **Field Surveys**: GPS measurements, drone imagery
- **Government Data**: DENR, LGU coastal monitoring programs
- **Research**: University studies, NGO programs

---

**Ready to test?** Upload one of these files to the Data Upload Center and watch the system in action! 🚀
