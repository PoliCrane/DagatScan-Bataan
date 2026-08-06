# EPR Calculation Test Data

This folder contains sample GeoJSON files and test scripts to validate the EPR (End-Point Rate) calculation system.

## Files

### GeoJSON Test Data

#### **Bagac Municipality**
- **bagac-2020.geojson** - Baseline shoreline data for year 2020
  - Northern Coastal Zone (baseline)
  - Central Beach Area (baseline)
  - Southern Cove (baseline)

- **bagac-2025.geojson** - Updated shoreline data for year 2025
  - Same zones with realistic coordinate shifts (2-6 meters)
  - Auto-calculation will compare 2020 → 2025 coordinates
  - Expected EPR: -0.3 to -1.2 m/year

#### **Morong Municipality**
- **morong-2020.geojson** - Baseline for year 2020
  - East Beach
  - Harbor Zone

- **morong-2025.geojson** - Updates for year 2025
  - Same zones with shifted coordinates

### Test Script
- **EPR_TEST_GUIDE.js** - Comprehensive test guide with 5 test scenarios

## Quick Test Procedure

### Step 1: Test Direct Function Call
```bash
node EPR_TEST_GUIDE.js
```

This runs tests 1-5 and shows:
- Actual EPR calculation results
- cURL command to test the API
- Upload workflow sequence
- Error handling

### Step 2: Test API Endpoint

Make sure server is running:
```bash
npm start  # from backend directory
```

Then test with curl:
```bash
curl -X POST http://localhost:5000/api/calculate-epr \
  -H "Content-Type: application/json" \
  -d '{
    "coords1": [[120.45, 14.75], [120.46, 14.76], [120.47, 14.77]],
    "coords2": [[120.448, 14.748], [120.458, 14.758], [120.468, 14.768]],
    "year1": 2020,
    "year2": 2025
  }'
```

### Step 3: Test Auto-Calculation During Upload

1. **Upload bagac-2020.geojson**
   - Go to admin upload panel
   - Select: Municipality = "Bagac", Year = 2020
   - Upload the GeoJSON file
   - Check database - records should be stored

2. **Upload bagac-2025.geojson**
   - Select: Municipality = "Bagac", Year = 2025
   - Upload the GeoJSON file
   - **System automatically calculates EPR** for all zones (no previous calculation exists)
   - Expected console output:
     ```
     ✅ Auto-calculated EPR for Bagac/Northern Coastal Zone: -0.50 m/year
     ✅ Auto-calculated EPR for Bagac/Central Beach Area: -0.30 m/year
     ✅ Auto-calculated EPR for Bagac/Southern Cove: -1.20 m/year
     ```

3. **Verify in Database**
   - Query shoreline_zones table
   - All three zones should now have erosionRate values calculated from 2020 → 2025
   - Check that values are ~-1.73 m/year (approximate)

## Expected Results

### EPR Calculations

**Realistic coordinate shifts (April 2026):**

All coordinates shifted ~5-30 meters between 2020-2025:

- **Northern Coastal Zone**: ~2.5m shift over 5 years = **-0.5 m/year**
- **Central Beach Area**: ~1.5m shift over 5 years = **-0.3 m/year**
- **Southern Cove**: ~6.0m shift over 5 years = **-1.2 m/year** (higher erosion)
- **East Beach**: ~4.0m shift over 5 years = **-0.8 m/year**
- **Harbor Zone**: ~2.25m shift over 5 years = **-0.45 m/year**

These values represent **realistic coastal erosion rates**.

### Database Records After Upload
```sql
SELECT municipality, specific_area, year, erosion_rate FROM shoreline_zones 
WHERE municipality IN ('Bagac', 'Morong')
ORDER BY municipality, specific_area, year;

-- Expected results (realistic values):
-- Bagac     | Central Beach Area | 2020 | NULL or 0
-- Bagac     | Central Beach Area | 2025 | -0.3 (auto-calculated)
-- Bagac     | Northern Coastal Zone | 2020 | NULL or 0
-- Bagac     | Northern Coastal Zone | 2025 | -0.5 (auto-calculated)
-- Bagac     | Southern Cove | 2020 | NULL or 0
-- Bagac     | Southern Cove | 2025 | -1.2 (auto-calculated)
-- Morong    | East Beach | 2020 | NULL or 0
-- Morong    | East Beach | 2025 | -0.8 (auto-calculated)
-- Morong    | Harbor Zone | 2020 | NULL or 0
-- Morong    | Harbor Zone | 2025 | -0.45 (auto-calculated)
```

## Troubleshooting

### Auto-Calculation Not Working
- Check that 2020 data was uploaded FIRST
- Verify municipality and specific_area names match exactly (case-insensitive)
- Check backend console for error messages
- Ensure `/api/calculate-epr` endpoint is registered in server.js

### API Endpoint Returns 400
- Verify all required fields: coords1, coords2, year1, year2
- Check that coordinates are [lon, lat] format
- Ensure year1 ≠ year2

### No Records in Database After Upload
- Check upload_history table for error_message
- Verify GeoJSON is valid (use a GeoJSON validator)
- Check that municipality and year parameters were provided
