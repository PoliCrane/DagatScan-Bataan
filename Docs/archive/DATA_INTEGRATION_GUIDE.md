# Coastal Erosion Data Integration Guide

## Overview

This guide explains how to use the integrated database data in your Erosion Analysis Card component. The system automatically fetches the latest coastal erosion data from the database and displays predictions.

---

## 1. EROSION ANALYSIS CARD FEATURES

### Automatic Database Integration

The `ErosionAnalysisCards` component now:

- ✅ Fetches data from `/api/shoreline/municipality/:municipality/analysis`
- ✅ Uses the **latest available year** of data (falls back to most recent if current year unavailable)
- ✅ Displays mapped database fields:
  - `coastline_length` → Coastline Length (km)
  - `affected_area` → Affected Land Area (m²)
  - `risk_level` → Risk Level (Low/Moderate/High)
  - `location` (municipality) → Location
  - `erosion_rate` → Projected EPR (m/year)

### Dynamic Prediction Calculations

```javascript
predictedYear = latest_year + 5 (configurable)
estimatedRetreat = erosionRate × (predictedYear - latestYear)
```

### Example Response Structure

```json
{
  "municipality": "Morong",
  "year": 2025,
  "analysisYear": 2025,
  "erosionRate": "0.95",
  "riskLevel": "Moderate",
  "affectedLandArea": 190,
  "zoneCount": 2,
  "epr": {
    "rate": 0.95,
    "confidence": 0.68,
    "method": "Linear",
    "dataPoints": 10
  }
}
```

---

## 2. ADMIN FEATURES: INSERT & UPLOAD DATA

### Option A: Insert Single Year Data

**Endpoint:** `POST /api/shoreline/admin/insert-yearly`

Insert a single year of erosion data without file upload.

**Request Body:**

```json
{
  "municipality": "Morong",
  "year": 2026,
  "erosion_rate": 1.2,
  "cumulative_erosion": 12.5,
  "specific_area": "Main Coastline",
  "data_quality": "Field Survey",
  "source_type": "Manual Entry"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:5000/api/shoreline/admin/insert-yearly \
  -H "Content-Type: application/json" \
  -d '{
    "municipality": "Morong",
    "year": 2026,
    "erosion_rate": 1.2,
    "cumulative_erosion": 12.5,
    "specific_area": "Main Coastline",
    "data_quality": "Field Survey",
    "source_type": "Manual Entry"
  }'
```

**Required Fields:**

- `municipality` (string)
- `year` (integer)
- `erosion_rate` (float) - Negative for erosion, positive for accretion

**Optional Fields:**

- `cumulative_erosion` - Total change over time
- `specific_area` - Zone name (default: "Main Coastline")
- `data_quality` - "Field Survey", "Satellite", "Simulated", etc.
- `source_type` - Data source identifier

**Response:**

```json
{
  "success": true,
  "message": "Added Morong data for year 2026",
  "action": "inserted",
  "data": {
    "id": 123,
    "municipality": "Morong",
    "year": 2026,
    "erosion_rate": 1.2
  }
}
```

---

### Option B: CSV Upload

**Endpoint:** `POST /api/admin/uploads/upload`

Upload multiple records via CSV file.

**CSV Format:**

```
municipality,year,erosion_rate,cumulative_erosion,specific_area,data_quality,source_type
Morong,2015,0.8,0.8,Main Coastline,Field Survey,Satellite
Morong,2016,0.9,1.7,Main Coastline,Field Survey,Satellite
Morong,2017,1.0,2.7,Main Coastline,Field Survey,Satellite
Bagac,2015,0.6,0.6,Main Coastline,Field Survey,Satellite
```

**Multipart Form Request:**

```bash
curl -X POST http://localhost:5000/api/admin/uploads/upload \
  -F "csv=@shoreline_data.csv" \
  -F "municipality=Morong" \
  -F "year=2025" \
  -F "description=2025 Annual Survey"
```

**Note:** CSV format supports 7 columns:

1. `municipality` - Municipality name (can override with form field)
2. `year` - Data year
3. `erosion_rate` - Erosion rate in m/year
4. `cumulative_erosion` - Total change (optional)
5. `specific_area` - Zone name (default: "Main Coastline")
6. `data_quality` - Data quality level
7. `source_type` - Data source

**Response:**

```json
{
  "success": true,
  "uploads": [
    {
      "type": "CSV",
      "success": true,
      "uploadId": 42,
      "message": "Inserted 11 records from CSV",
      "recordsProcessed": 11,
      "recordsInserted": 11
    }
  ],
  "uploadIds": [42]
}
```

---

### Option C: GeoJSON Upload (Zoned Data)

**Endpoint:** `POST /api/admin/uploads/upload`

Upload GeoJSON with spatial boundary data.

**Multipart Form Request:**

```bash
curl -X POST http://localhost:5000/api/admin/uploads/upload \
  -F "geojson=@morong_2025.geojson" \
  -F "municipality=Morong" \
  -F "year=2025" \
  -F "description=2025 Satellite Analysis" \
  -F "specific_area=Zone A"
```

The system automatically extracts erosion metrics from GeoJSON features and stores them with zone identifiers.

---

## 3. SAMPLE DATA SEEDING

### Auto-Seed If Empty

**Endpoint:** `POST /api/shoreline/seed`

Automatically generates 10 years of realistic sample data if database is empty.

**Request Body:**

```json
{
  "municipality": "Morong",
  "startYear": 2015,
  "endYear": 2025,
  "skipIfExists": true
}
```

**Request Example:**

```bash
curl -X POST http://localhost:5000/api/shoreline/seed \
  -H "Content-Type: application/json" \
  -d '{
    "municipality": "Morong",
    "startYear": 2015,
    "endYear": 2025"
  }'
```

**Key Features:**

- ✅ Seeded randomness (same municipality = consistent values)
- ✅ Realistic erosion rates: 0.5-1.5 m/year
- ✅ Cumulative erosion tracking
- ✅ Marked as "Seed Data" for identification
- ✅ Skips if data already exists (configurable)

**Response:**

```json
{
  "success": true,
  "message": "Seeded Morong with 11 years of sample data (2015-2025)",
  "municipality": "Morong",
  "yearRange": {
    "start": 2015,
    "end": 2025
  },
  "recordCount": 11,
  "records": [
    {
      "year": 2015,
      "erosionRate": 0.73,
      "cumulativeErosion": 0.73,
      "recordId": 101
    },
    ...
  ]
}
```

---

## 4. FRONTEND INTEGRATION

### ErosionAnalysisCards Component

The component is already integrated with the database. Simply pass:

```jsx
<ErosionAnalysisCards
  selectedMunicipality={selectedMunicipality}
  predictedYear={2030}
  autoRefreshInterval={30000} // Auto-refresh every 30s
/>
```

### Component Props

- `selectedMunicipality` (string) - Municipality name
- `predictedYear` (number, optional) - Override predicted year (default: latest_year + 5)
- `autoRefreshInterval` (number, optional) - Refresh interval in ms (default: 30000)
- `municipalityStats` (object, optional) - Fallback simulated data
- `yearlyShorelineData` (array, optional) - Historical data array

### Features

- ✅ Auto-fetches latest data from API
- ✅ Error handling with user-friendly messages
- ✅ Loading state indicator
- ✅ Displays data source (Database vs Simulated)
- ✅ Auto-refresh when new data is uploaded
- ✅ Responsive risk level coloring

### Data Display

```
Erosion Analysis Card:
├─ Coastline Length: 2.5 km
├─ Affected Land Area: 190 m²
├─ Risk Level: Moderate
└─ Location: Morong
   └─ Data Year: 2025 • Database (Current Year)

Prediction Result Card:
├─ Predicted Year: 2030
├─ Estimated Retreat: 4.8 m (95 rate × 5 years)
├─ Projected EPR: 0.95 m/year
└─ Risk Level: Moderate
   └─ Based on 5-year projection from year 2025
```

---

## 5. DATABASE SCHEMA

### shoreline_zones Table

```sql
CREATE TABLE shoreline_zones (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(255) NOT NULL,
  specific_area VARCHAR(255) NOT NULL,
  year INTEGER NOT NULL,
  erosion_rate DECIMAL(10, 4) NOT NULL,
  cumulative_erosion DECIMAL(10, 4),
  data_quality VARCHAR(50),
  source_type VARCHAR(100),
  geojson_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### municipality_epr Table

```sql
CREATE TABLE municipality_epr (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100) UNIQUE NOT NULL,
  epr_rate DECIMAL(10,4) NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.75,
  base_year INTEGER DEFAULT 2026,
  calculation_method VARCHAR(50) DEFAULT 'Linear',
  data_points_used INTEGER,
  year_start INTEGER,
  year_end INTEGER,
  calculated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. API ENDPOINTS REFERENCE

| Method   | Endpoint                                               | Purpose                          |
| -------- | ------------------------------------------------------ | -------------------------------- |
| `GET`    | `/api/shoreline/municipality/:municipality/analysis`   | Get latest analysis data         |
| `GET`    | `/api/shoreline/municipality/:municipality/latest`     | Get latest year record           |
| `GET`    | `/api/shoreline/municipality/:municipality`            | Get all years of data            |
| `GET`    | `/api/shoreline/municipality/:municipality/year/:year` | Get specific year data           |
| `GET`    | `/api/shoreline/statistics/:municipality`              | Get aggregated statistics        |
| `POST`   | `/api/shoreline/seed`                                  | Seed with sample data            |
| `POST`   | `/api/shoreline/admin/insert-yearly`                   | Insert single year               |
| `POST`   | `/api/admin/uploads/upload`                            | Upload CSV/GeoJSON/Satellite     |
| `POST`   | `/api/admin/uploads/validate`                          | Validate file before upload      |
| `DELETE` | `/api/shoreline/municipality/:municipality`            | Delete all data for municipality |

---

## 7. QUICK START WORKFLOW

### Step 1: Seed Sample Data (First Time)

```bash
curl -X POST http://localhost:5000/api/shoreline/seed \
  -H "Content-Type: application/json" \
  -d '{
    "municipality": "Morong",
    "startYear": 2015,
    "endYear": 2025
  }'
```

### Step 2: Select Municipality in UI

- Open the map interface
- Click on "Morong" in the municipality list

### Step 3: View Analysis Cards

- Erosion Analysis Card shows: Coastline, Land Area, Risk Level, Location
- Prediction Card shows: 2030 Predictions, Estimated Retreat, EPR, Risk Level

### Step 4: Add New Data (Annual Update)

Option A (Single Record):

```bash
curl -X POST http://localhost:5000/api/shoreline/admin/insert-yearly \
  -H "Content-Type: application/json" \
  -d '{
    "municipality": "Morong",
    "year": 2026,
    "erosion_rate": 1.1,
    "cumulative_erosion": 11.65
  }'
```

Option B (CSV Upload):

```bash
curl -X POST http://localhost:5000/api/admin/uploads/upload \
  -F "csv=@data_2026.csv" \
  -F "municipality=Morong" \
  -F "year=2026"
```

### Step 5: Cards Auto-Update

- Component auto-refreshes every 30 seconds
- New data immediately reflects in predictions
- Data source shows "Database (Current Year)"

---

## 8. TROUBLESHOOTING

### No Data Shows in Card

1. Check if municipality exists in database:
   ```bash
   SELECT DISTINCT municipality FROM shoreline_zones ORDER BY municipality;
   ```
2. Seed sample data using endpoint in Step 1
3. Check browser console for API errors

### Error: "Failed to load data"

- Verify backend is running on `localhost:5000`
- Check CORS configuration in `server.js`
- Ensure municipality name matches database (case-insensitive query)

### CSV Import Not Working

- Verify CSV format matches specification
- Check file encoding is UTF-8
- Ensure numeric values are valid numbers
- Submit via `/api/admin/uploads/upload` with `csv` form field

### EPR Values Not Showing

- EPR is calculated from historical data (10+ years recommended)
- If insufficient data, system uses simulated fallback
- Check `municipality_epr` table for calculated values

---

## 9. DATA VALIDATION

### Accepted Values

- **erosion_rate**: Any decimal number
  - Negative = erosion (e.g., -0.95)
  - Positive = accretion (e.g., 0.5)
  - Range: -5.0 to 5.0 m/year realistic
- **year**: Integer between 1900 and 2100

- **municipality**: Required, case-insensitive match

- **data_quality**: Free text (suggestions: "Field Survey", "Satellite", "Calculated")

---

## 10. KEEPING EXISTING SYSTEM

✅ **No Breaking Changes**

- All existing endpoints still work
- Existing components can use fallback data
- GeoJSON/Satellite upload paths unchanged
- EPR calculations preserved
- Historical data migration optional

✅ **Backward Compatible**

- Old API responses still supported
- New fields are optional additions
- Existing pages continue to function
- Admin features are extensions, not replacements

---

## Notes

- Replace sample/simulated data with actual survey data as it becomes available
- Regular backups recommended before uploading large CSV files
- Annual updates recommended for best predictions (5+ year dataset)
- Contact admin for EPR calculation updates as new data accumulates
