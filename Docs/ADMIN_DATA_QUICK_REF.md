# Admin Quick Reference: Data Integration

## 🚀 Getting Started (2 Minutes)

### 1. Generate Sample Data (First Time)

```bash
curl -X POST http://localhost:5000/api/shoreline/seed \
  -H "Content-Type: application/json" \
  -d '{"municipality": "Morong", "startYear": 2015, "endYear": 2025}'
```

✅ Creates 11 records (2015-2025) with realistic erosion rates

---

## 📊 Adding New Data

### Quick: Single Record

```bash
curl -X POST http://localhost:5000/api/shoreline/admin/insert-yearly \
  -H "Content-Type: application/json" \
  -d '{
    "municipality": "Morong",
    "year": 2026,
    "erosion_rate": 1.15,
    "cumulative_erosion": 11.65
  }'
```

### Bulk: CSV File Upload

```bash
curl -X POST http://localhost:5000/api/admin/uploads/upload \
  -F "csv=@shoreline_2026.csv" \
  -F "municipality=Morong" \
  -F "year=2026"
```

**CSV Template:**

```
municipality,year,erosion_rate,cumulative_erosion,specific_area,data_quality,source_type
Morong,2026,1.15,11.65,Main Coastline,Field Survey,Annual Update
```

---

## 🗂️ Available Municipalities

Generated for all Bataan municipalities:

- Abucay, Bagac, Balanga, Dinalupihan, Hermosa, Limay, Mariveles,
  Morong, Orani, Orion, Pilar, Samal

---

## 📈 Data You'll See

| Field              | Sample   | Unit   |
| ------------------ | -------- | ------ |
| Coastline Length   | 2.5      | km     |
| Affected Land Area | 180      | m²     |
| Risk Level         | Moderate | -      |
| Projection (5yr)   | 5.8      | m      |
| Erosion Rate (EPR) | 1.15     | m/year |

---

## ✅ Verification Queries

### Check All Data

```bash
curl http://localhost:5000/api/shoreline/municipality/Morong
```

### Get Latest Year

```bash
curl http://localhost:5000/api/shoreline/municipality/Morong/latest
```

### Get Statistics

```bash
curl http://localhost:5000/api/shoreline/statistics/Morong
```

### Get Analysis (What Cards Display)

```bash
curl http://localhost:5000/api/shoreline/municipality/Morong/analysis
```

---

## 🔧 Common Tasks

### Add 2026 Data for All Municipalities

```bash
for municipality in "Abucay" "Bagac" "Balanga" "Dinalupihan" "Hermosa" "Limay" "Mariveles" "Morong" "Orani" "Orion" "Pilar" "Samal"; do
  curl -X POST http://localhost:5000/api/shoreline/admin/insert-yearly \
    -H "Content-Type: application/json" \
    -d "{\"municipality\": \"$municipality\", \"year\": 2026, \"erosion_rate\": 1.0, \"cumulative_erosion\": 10.0}"
done
```

### Validate CSV Before Upload

Python script to check CSV format:

```python
import csv

with open('shoreline_2026.csv', 'r') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader, 1):
        print(f"Row {i}: {row['municipality']} {row['year']} - Rate: {row['erosion_rate']}")
```

### Extract Statistics Range

```bash
curl http://localhost:5000/api/shoreline/statistics/Morong | \
  jq '.yearRange, .erosionStats'
```

---

## 🔍 Troubleshooting

| Problem                    | Solution                                        |
| -------------------------- | ----------------------------------------------- |
| "No data for municipality" | Run seed endpoint first                         |
| CSV import shows 0 records | Check CSV format matches template               |
| Cards show "Loading..."    | Check backend is running on port 5000           |
| Wrong erosion values?      | Verify negative = erosion, positive = accretion |
| Predictions seem off?      | Ensure year data covers 5+ year span            |

---

## 📋 Field Specifications

### erosion_rate (REQUIRED)

- **Type:** Decimal number
- **Range:** -5.0 to 5.0 realistic
- **Convention:** Negative = erosion, Positive = accretion
- **Example:** 1.2 (1.2m/year erosion), -0.5 (0.5m/year accretion)

### municipality (REQUIRED)

- **Type:** String, case-insensitive
- **Must exist:** Yes (in Bataan)
- **Example:** "Morong" or "morong" (both work)

### year (REQUIRED)

- **Type:** Integer
- **Range:** 1900-2100
- **Example:** 2026

### cumulative_erosion (OPTIONAL)

- **Type:** Decimal number
- **Definition:** Total change from baseline to current year
- **Example:** 11.65 (total retreat of 11.65m since 2015)

### specific_area (OPTIONAL)

- **Type:** String
- **Default:** "Main Coastline"
- **Example:** "Zone A", "Northern Shore", "Barangay X"

### data_quality (OPTIONAL)

- **Type:** String (any value)
- **Suggestions:** "Field Survey", "Satellite", "Calculated", "Estimated"
- **Default:** "Field Survey"

### source_type (OPTIONAL)

- **Type:** String (any value)
- **Suggestions:** "Manual Entry", "CSV Import", "GeoJSON Upload", "Simulation"
- **Default:** "Manual Entry"

---

## 🎯 Monthly Update Workflow

### Step 1: Collect Field Data

Get your latest measurements for all municipalities

### Step 2: Prepare CSV

Create file with format:

```
municipality,year,erosion_rate,cumulative_erosion,specific_area,data_quality,source_type
```

### Step 3: Upload

```bash
curl -X POST http://localhost:5000/api/admin/uploads/upload \
  -F "csv=@latest_survey.csv" \
  -F "year=2026" \
  -F "description=April 2026 Field Survey"
```

### Step 4: Verify

Check cards in UI show updated data (auto-refresh in 30s)

### Step 5: Archive

Keep backup of original CSV files for audit trail

---

## 📊 Interpretation Guide

### Risk Levels

- **Stable** - EPR < 0.3 m/year
- **Low** - EPR 0.3 to 0.7 m/year
- **Moderate** - EPR 0.7 to 1.5 m/year
- **High** - EPR ≥ 1.5 m/year

### Affected Area Calculation

```
Affected Area = Erosion Rate × Number of Zones × Factor
(Approximation: shown in m² for reference)
```

### Projection Accuracy

- **1-5 years:** High accuracy
- **5-10 years:** Good accuracy
- **10+ years:** Use with caution (climate/policy changes)

---

## 🚨 Important Notes

⚠️ **Before Mass Upload**

- Validate data accuracy
- Ensure consistent units (all in meters/year)
- Check municipality names match database
- Create backup of original files

✅ **Best Practices**

- Add data annually (calendar year or fiscal year)
- Keep metadata (data_quality, source_type) updated
- Archive CSV files for audit trail
- Review predictions for sanity checks

🔄 **Auto-Refresh**

- Cards refresh every 30 seconds when data changes
- No manual refresh needed in UI
- New data visible within 1 minute

---

## 📞 Support

For issues with:

- **Data format:** Check CSV template above
- **API errors:** Verify backend running on localhost:5000
- **Missing data:** Re-run seed endpoint
- **EPR calculations:** Ensure 10+ years of historical data
