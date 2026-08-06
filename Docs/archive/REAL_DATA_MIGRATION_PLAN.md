# Real Data Migration Plan - DagatScan Coastal Erosion Monitoring

## 📋 Overview

Transition from fake datasets to real database-driven data while maintaining 100% UI compatibility. The upload system is pre-structured for future GeoJSON/Image uploads.

---

## 🏗️ Architecture Changes

### Current State

```
Frontend (React)
    ↓
    Generates Fake Data via fakeDataset.js
    ↓
    UI Components Display Data
```

### Target State

```
Admin Upload Panel (Future)
    ↓ (GeoJSON/Images)
Backend Upload Processor (Future)
    ↓
Database (PostgreSQL)
    ↓ (API Requests)
Frontend (React)
    ↓
    UI Components Display Data (SAME LOOK)
```

---

## 📊 Database Schema

### New Tables

#### `shoreline_data`

```sql
CREATE TABLE shoreline_data (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  erosion_rate DECIMAL(10, 4),           -- meters/year
  cumulative_erosion DECIMAL(10, 4),     -- total meters
  data_quality VARCHAR(50),              -- "Measured", "Simulated", "Estimated"
  source_type VARCHAR(50),               -- "GeoJSON", "Satellite", "Survey"
  geojson_data JSONB,                    -- Full shoreline GeoJSON
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(municipality, year, source_type)
);
```

#### `upload_history`

```sql
CREATE TABLE upload_history (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id),
  upload_type VARCHAR(50),               -- "GeoJSON", "Satellite_Image"
  municipality VARCHAR(100),
  year INTEGER,
  file_name VARCHAR(255),
  file_path VARCHAR(500),
  file_size INTEGER,                     -- bytes
  process_status VARCHAR(50),            -- "Pending", "Processing", "Complete", "Failed"
  error_message TEXT,
  processed_records INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `satellite_imagery`

```sql
CREATE TABLE satellite_imagery (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100),
  year INTEGER,
  image_url VARCHAR(500),
  image_path VARCHAR(500),
  capture_date DATE,
  resolution VARCHAR(50),                -- "High", "Medium", "Low"
  source VARCHAR(100),                   -- "Sentinel-2", "Landsat", "Custom"
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(municipality, year)
);
```

---

## 🔌 Backend API Endpoints (New)

### Data Retrieval

#### `GET /api/shoreline/municipality/:municipality`

Returns yearly shoreline data for municipality

```json
{
  "municipality": "Balanga",
  "data": [
    {
      "year": 2015,
      "erosionRate": 1.2,
      "cumulativeErosion": 1.2,
      "dataQuality": "Calculated",
      "shoreline": [[14.657, 120.500], ...]
    },
    ...
  ]
}
```

#### `GET /api/shoreline/municipality/:municipality/year/:year`

Get specific year data

```json
{
  "year": 2024,
  "shoreline": [...],
  "stats": { "erosionRate": 1.2, ... }
}
```

#### `GET /api/shoreline/compare`

Compare multiple municipalities

```
?municipalities=Balanga,Morong&startYear=2015&endYear=2024
```

#### `GET /api/satellite/:municipality/:year`

Get satellite imagery

```json
{
  "imagePath": "/uploads/satellite/Balanga_2024.jpg",
  "resolution": "High"
}
```

### Admin Endpoints (Upload Structure - No Implementation Yet)

#### `POST /api/admin/upload/validate`

Validates file before upload (GeoJSON/Image)

```json
{
  "fileType": "GeoJSON",
  "fileSize": 50000,
  "expectedRecords": 100
}
```

#### `POST /api/admin/upload/process`

Process uploaded file

```json
{
  "uploadId": 123,
  "municipality": "Balanga",
  "year": 2024,
  "sourceType": "GeoJSON"
}
```

#### `GET /api/admin/uploads`

List all uploads and their status

#### `GET /api/admin/uploads/:id/status`

Check processing status

---

## 🎨 Frontend Changes

### New Service Layer: `src/api/shorelineData.js`

```javascript
// Fetch from database (real data)
export const fetchMunicipalityData = async (municipality) => { ... }

// Fallback to fake data if database empty
export const getFallbackData = (coastlinePoints, municipality) => { ... }

// Compare multiple municipalities
export const compareMunicipalities = async (...) => { ... }
```

### Updated Components

#### `coastalmonitoring.jsx`

```javascript
// OLD: generateYearlyShorelineData(smoothedCoastline, 2015, 2026)
// NEW: await fetchMunicipalityData(selectedMunicipality)
```

#### `erosionanalysis.jsx`

```javascript
// OLD: generateYearlyShorelineData(...)
// NEW: await fetchMunicipalityData(...) + compareMunicipalities(...)
```

#### `DataUpload.jsx`

Pre-structured for future development:

- Validates GeoJSON/Image format
- Shows upload progress
- Displays processing status
- Currently shows placeholder messages

---

## ✅ Implementation Checklist

### Phase 1: Database Setup

- [ ] Create migrations for new tables
- [ ] Add indexes on municipality, year
- [ ] Seed with sample data from fake generator

### Phase 2: Backend API

- [ ] Create data retrieval endpoints
- [ ] Add database queries with caching
- [ ] Create admin endpoint stubs
- [ ] Add error handling

### Phase 3: Frontend Service Layer

- [ ] Create shorelineData.js service
- [ ] Add fallback logic
- [ ] Cache API responses

### Phase 4: Component Updates

- [ ] Update coastalmonitoring.jsx
- [ ] Update erosionanalysis.jsx
- [ ] Update ErosionAnalysisCards component
- [ ] Test UI appearance (should be 100% same)

### Phase 5: Admin Upload Structure

- [ ] Create upload validation endpoints (no file processing)
- [ ] Update DataUpload.jsx UI
- [ ] Document upload specs for future dev

### Phase 6: Fallback & Testing

- [ ] Ensure fake data works if database empty
- [ ] Test switching between real/fake
- [ ] Performance testing

---

## 🔄 Data Flow Example

### Current (Fake)

```
User selects municipality "Balanga"
    ↓
coastalmonitoring.jsx calls generateYearlyShorelineData()
    ↓
Fake data generated for 2015-2026
    ↓
UI displays fake data
```

### After Migration (Real)

```
User selects municipality "Balanga"
    ↓
coastalmonitoring.jsx calls fetchMunicipalityData('Balanga')
    ↓
API request: GET /api/shoreline/municipality/Balanga
    ↓
Backend queries database
    ↓
Returns real data for 2015-2024
    ↓
If empty, fallback to fake data
    ↓
UI displays same (but real data)
```

---

## 📝 Upload System Structure (Ready for Development)

```
/uploads
  /shoreline
    /GeoJSON
      /Balanga
        2024_v1.json
        2024_v2.json
      /Morong
    /Satellite
      /Balanga
        2024_sentinel2.tif
        2024_landsat.tif
  /processing
    upload_123_processing.json
    upload_124_error.log
```

---

## 🎯 Benefits

1. **UI Unchanged**: 100% visual compatibility
2. **Gradual Migration**: Works with real data immediately, but has fallback
3. **Upload Ready**: Structure built, implementation easy later
4. **Scalable**: Database design supports multiple data sources
5. **No Breaking Changes**: New endpoints don't affect existing code

---

## 🚀 Next Steps

1. Create database migration file
2. Implement backend API endpoints
3. Create frontend service layer
4. Update components to use new API
5. Test and validate
