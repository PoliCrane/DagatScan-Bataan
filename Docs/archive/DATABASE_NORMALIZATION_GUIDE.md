## Database Normalization - Implementation Guide

### Optimized 5-Table Schema

---

## Overview

Your database is transitioning from a single denormalized table to a **clean, logical 5-table structure**:

```
municipalities (12 rows)
    ↓
specific_areas (~20 rows)  ← "Where" data
    ↓
shoreline_data (500 rows)  ← "What" (metrics)
    ├─→ data_sources ← "How" (source + quality)

shoreline_geometries ← "Shape" (location geometry)
    └─→ specific_areas
```

**Key principle:** Separate concerns:

- **Where:** municipalities → specific_areas (location)
- **What:** shoreline_data (metrics: year, erosion_rate, etc.)
- **How:** data_sources (measurement method + quality)
- **Shape:** shoreline_geometries (geography, versioned)

---

## Schema Definition

### 1. municipalities

```sql
CREATE TABLE municipalities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL
);
```

- **Purpose:** Single source of truth for municipality names
- **Why:** Prevents "Balanga" vs "BALANGA" duplicates
- **Example:** 1 row per municipality (Balanga, Orani, Mariveles, etc.)

### 2. specific_areas

```sql
CREATE TABLE specific_areas (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
  name VARCHAR(255) NOT NULL,
  UNIQUE(municipality_id, name)  ← One area name per municipality
);
```

- **Purpose:** Define coastal zones/areas within each municipality
- **Relationship:** 1 Municipality → Many Areas
- **Example:** Balanga has {Bagac Beach, Mariveles, Ilanin Beach}

### 3. shoreline_data

```sql
CREATE TABLE shoreline_data (
  id SERIAL PRIMARY KEY,
  specific_area_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  erosion_rate DECIMAL(10,4),
  cumulative_erosion DECIMAL(10,4),
  source_id INTEGER REFERENCES data_sources(id),
  UNIQUE(specific_area_id, year, source_id)  ← Prevents duplicates
);
```

- **Purpose:** Time-series erosion metrics
- **Relationship:** 1 Area → Many Years of Data
- **Example:** Bagac Beach has records for years 2020, 2021, 2022

### 4. data_sources

```sql
CREATE TABLE data_sources (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(100),           ← "GeoJSON", "Satellite", "Survey"
  data_quality VARCHAR(50),           ← "High", "Medium", "Low"
  UNIQUE(source_type, data_quality)   ← One combo per entry
);
```

- **Purpose:** Reference table for measurement method + quality
- **Relationship:** 1 Source → Many shoreline_data records
- **Example:** (GeoJSON, High) is one source type, (Satellite, Medium) is different

### 5. shoreline_geometries

```sql
CREATE TABLE shoreline_geometries (
  id SERIAL PRIMARY KEY,
  specific_area_id INTEGER NOT NULL,
  geojson_data JSONB NOT NULL,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,  ← NULL = current geometry
);
```

- **Purpose:** Store geography once per area (not repeated per year/source)
- **Relationship:** 1 Area can have multiple geometries over time
- **Key insight:** Geometry is a property of location, NOT of measurement
- **Example:** Bagac Beach geometry recorded in 2020, updated in 2023

---

## Migration Steps

### Step 1: Backup & Execute SQL (30 minutes)

```bash
# Backup first!
pg_dump coastalerosion > backup_$(date +%Y%m%d).sql 2>/dev/null

# Run migration
psql -U postgres -d coastalerosion -f NORMALIZATION_MIGRATION.sql
```

### Step 2: Verify Migration

```bash
# Check validation results
psql -d coastalerosion -c "SELECT * FROM migration_validation;"

# Sample data
psql -d coastalerosion -c "SELECT * FROM municipality_summary;"
```

Expected output:

```
municipality | total_areas | years_recorded | avg_erosion_rate
─────────────┼─────────────┼────────────────┼──────────────────
Balanga      |           3 |              5 |            1.15
```

### Step 3: Backward Compatibility Check

```bash
# Test that existing code still works
psql -d coastalerosion -c "SELECT * FROM shoreline_zones_compat WHERE municipality = 'Balanga' LIMIT 5;"
```

Should return data in original format:

```
id | municipality | specific_area | year | erosion_rate | source_type | data_quality
────┼──────────────┼───────────────┼──────┼──────────────┼─────────────┼─────────────
1  | Balanga      | Bagac Beach   | 2020 |         1.25 | GeoJSON     | High
```

---

## Code Examples: Using the New Schema

### Example 1: Fetch shoreline data for a municipality

**OPTION A: Using helper service (recommended)**

```javascript
const { getShorelineData } = require("./services/normalizationService");

// Get all data for Balanga
const data = await getShorelineData("Balanga");

// Get specific area data
const bagacData = await getShorelineData("Balanga", {
  specificArea: "Bagac Beach",
});

// Get data for a year range
const recentData = await getShorelineData("Balanga", {
  startYear: 2020,
  endYear: 2024,
});
```

**OPTION B: Direct SQL query**

```javascript
const result = await pool.query(
  `
  SELECT 
    sd.id,
    m.name AS municipality,
    sa.name AS specific_area,
    sd.year,
    sd.erosion_rate,
    sd.cumulative_erosion,
    ds.source_type,
    ds.data_quality,
    sg.geojson_data
  FROM shoreline_data sd
  JOIN specific_areas sa ON sd.specific_area_id = sa.id
  JOIN municipalities m ON sa.municipality_id = m.id
  LEFT JOIN data_sources ds ON sd.source_id = ds.id
  LEFT JOIN shoreline_geometries sg ON sa.id = sg.specific_area_id 
    AND sg.valid_to IS NULL
  WHERE LOWER(m.name) = LOWER($1)
  ORDER BY sa.name, sd.year ASC
`,
  ["Balanga"],
);
```

**OPTION C: Using backward-compatible view (during migration)**

```javascript
// During transition, existing code continues to work:
const result = await pool.query(
  "SELECT * FROM shoreline_zones_compat WHERE municipality = $1",
  ["Balanga"],
);
```

### Example 2: Insert new shoreline metrics

**BEFORE migration:**

```javascript
await pool.query(
  `INSERT INTO shoreline_zones 
   (municipality, specific_area, year, erosion_rate, source_type, data_quality)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  ["Balanga", "Bagac Beach", 2024, 1.3, "GeoJSON", "High"],
);
```

**AFTER migration (using service):**

```javascript
const { insertMetrics } = require("./services/normalizationService");

const recordId = await insertMetrics({
  municipality: "Balanga",
  specificArea: "Bagac Beach",
  year: 2024,
  erosionRate: 1.3,
  cumulativeErosion: 16.8,
  sourceType: "GeoJSON",
  dataQuality: "High",
});

console.log(`Inserted record ID: ${recordId}`);
```

**AFTER migration (raw SQL):**

```javascript
// Step 1: Get or reference existing IDs
const {
  rows: [municipality],
} = await pool.query("SELECT id FROM municipalities WHERE name = $1", [
  "Balanga",
]);

const {
  rows: [area],
} = await pool.query(
  "SELECT id FROM specific_areas WHERE municipality_id = $1 AND name = $2",
  [municipality.id, "Bagac Beach"],
);

const {
  rows: [source],
} = await pool.query(
  "SELECT id FROM data_sources WHERE source_type = $1 AND data_quality = $2",
  ["GeoJSON", "High"],
);

// Step 2: Insert metrics
await pool.query(
  `INSERT INTO shoreline_data 
   (specific_area_id, year, erosion_rate, cumulative_erosion, source_id)
   VALUES ($1, $2, $3, $4, $5)`,
  [area.id, 2024, 1.3, 16.8, source.id],
);
```

### Example 3: Store/retrieve geometry

**Store geometry:**

```javascript
const { storeAreaGeometry } = require("./services/normalizationService");

const geojsonData = {
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [120.5, 14.5],
      [120.6, 14.5],
      // ... more coordinates
    ],
  },
  properties: { area: "Bagac Beach" },
};

const geoId = await storeAreaGeometry(
  "Balanga",
  "Bagac Beach",
  geojsonData,
  new Date("2024-01-01"),
);
```

**Retrieve geometry:**

```javascript
const { getAreaGeometry } = require("./services/normalizationService");

const geometry = await getAreaGeometry("Balanga", "Bagac Beach");

if (geometry) {
  console.log("GeoJSON:", geometry.geojson);
  console.log("Valid from:", geometry.validFrom);
}
```

### Example 4: Get summaries

**Municipality summary:**

```javascript
const { getMunicipalitySummary } = require("./services/normalizationService");

const summary = await getMunicipalitySummary("Balanga");

console.log(`
  Municipality: ${summary.municipality}
  Coastal areas: ${summary.total_areas}
  Years recorded: ${summary.years_recorded}
  Average erosion rate: ${summary.avg_erosion_rate} m/year
  Latest year: ${summary.latest_year}
  Sources: ${summary.source_types}
`);
```

**Area summary:**

```javascript
const { getAreaSummary } = require("./services/normalizationService");

const summary = await getAreaSummary("Balanga", "Bagac Beach");

console.log(`
  Area: ${summary.specific_area}
  Years of data: ${summary.years_recorded}
  Period: ${summary.first_year} - ${summary.latest_year}
  Average erosion: ${summary.avg_erosion_rate} m/year
  Max cumulative: ${summary.max_cumulative_erosion} m
`);
```

### Example 5: Bulk insert from GeoJSON upload

```javascript
const { bulkInsertMetrics } = require("./services/normalizationService");

// Assume geoJSON file contains features with properties
const features = geojsonFile.features;

const metricsArray = features.map((feature) => ({
  municipality: "Balanga",
  specificArea: feature.properties.zone_name,
  year: 2024,
  erosionRate: feature.properties.erosion_rate,
  cumulativeErosion: feature.properties.cumulative,
  sourceType: "GeoJSON",
  dataQuality: "High",
}));

const result = await bulkInsertMetrics(metricsArray);

console.log(`Inserted: ${result.successful}, Failed: ${result.failed}`);
if (result.errors.length > 0) {
  console.log("Errors:", result.errors);
}
```

---

## Migration Timeline

### Week 1: Database & Testing

- ✅ Execute migration SQL
- ✅ Verify with validation queries
- ✅ Run existing integration tests (should pass without code changes)
- ✅ Monitor logs for errors

### Weeks 2-4: Code Updates (Gradual)

Update routes one at a time:

**Priority routes (update first):**

1. `routes/shorelineData.js` - GET endpoints
2. `routes/uploadManagement.js` - POST/INSERT operations

**Example: Update GET endpoint**

```javascript
// OLD CODE
router.get("/municipality/:municipality", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM shoreline_zones WHERE municipality = $1",
    [req.params.municipality],
  );
  res.json(result.rows);
});

// NEW CODE - Option 1: Use service
const { getShorelineData } = require("../services/normalizationService");

router.get("/municipality/:municipality", async (req, res) => {
  const data = await getShorelineData(req.params.municipality);
  res.json(data);
});

// NEW CODE - Option 2: Direct query
router.get("/municipality/:municipality", async (req, res) => {
  const result = await pool.query(
    `
    SELECT 
      sd.id, m.name as municipality, sa.name as specific_area,
      sd.year, sd.erosion_rate, sd.cumulative_erosion,
      ds.source_type, ds.data_quality, sg.geojson_data
    FROM shoreline_data sd
    JOIN specific_areas sa ON sd.specific_area_id = sa.id
    JOIN municipalities m ON sa.municipality_id = m.id
    LEFT JOIN data_sources ds ON sd.source_id = ds.id
    LEFT JOIN shoreline_geometries sg ON sa.id = sg.specific_area_id 
      AND sg.valid_to IS NULL
    WHERE m.name = $1
    ORDER BY sa.name, sd.year ASC
  `,
    [req.params.municipality],
  );
  res.json(result.rows);
});
```

**Example: Update POST endpoint**

```javascript
// OLD CODE
async function handleUpload(req, res) {
  const { municipality, specificArea, year, erosionRate, sourceType } =
    req.body;

  await pool.query(
    "INSERT INTO shoreline_zones (municipality, specific_area, year, erosion_rate, source_type) VALUES ($1, $2, $3, $4, $5)",
    [municipality, specificArea, year, erosionRate, sourceType],
  );

  res.json({ success: true });
}

// NEW CODE - Using service
const { insertMetrics } = require("../services/normalizationService");

async function handleUpload(req, res) {
  const {
    municipality,
    specificArea,
    year,
    erosionRate,
    sourceType,
    dataQuality,
  } = req.body;

  const recordId = await insertMetrics({
    municipality,
    specificArea,
    year,
    erosionRate,
    sourceType,
    dataQuality,
  });

  res.json({ success: true, recordId });
}
```

### Week 5+: Cleanup

- ✅ All code migrated & tested
- ✅ Delete old `shoreline_zones` table (after backup!)
- ✅ Optionally rename `shoreline_data` to `shoreline_zones`
- ✅ Archive migration script

---

## Common Queries

### Get data by municipality & year

```sql
SELECT m.name, sa.name, sd.year, sd.erosion_rate
FROM shoreline_data sd
JOIN specific_areas sa ON sd.specific_area_id = sa.id
JOIN municipalities m ON sa.municipality_id = m.id
WHERE m.name = 'Balanga' AND sd.year = 2024;
```

### Compare erosion rates by source type

```sql
SELECT ds.source_type, AVG(sd.erosion_rate) as avg_rate, COUNT(*) as records
FROM shoreline_data sd
LEFT JOIN data_sources ds ON sd.source_id = ds.id
GROUP BY ds.source_type
ORDER BY avg_rate DESC;
```

### Find areas with highest erosion

```sql
SELECT sa.name, MAX(sd.cumulative_erosion) as total_erosion
FROM shoreline_data sd
JOIN specific_areas sa ON sd.specific_area_id = sa.id
GROUP BY sa.id, sa.name
ORDER BY total_erosion DESC
LIMIT 10;
```

### Get latest measurement per area

```sql
SELECT DISTINCT ON (sa.id)
  m.name, sa.name, sd.year, sd.erosion_rate
FROM shoreline_data sd
JOIN specific_areas sa ON sd.specific_area_id = sa.id
JOIN municipalities m ON sa.municipality_id = m.id
ORDER BY sa.id, sd.year DESC;
```

---

## Testing

### Quick test script

```javascript
const {
  getShorelineData,
  insertMetrics,
  getMunicipalitySummary,
} = require("./services/normalizationService");

async function test() {
  // Test 1: Get data
  console.log("Test 1: Fetch data for Balanga");
  const data = await getShorelineData("Balanga");
  console.log(`Found ${data.length} records`);

  // Test 2: Insert new record
  console.log("\nTest 2: Insert new metrics");
  const id = await insertMetrics({
    municipality: "Balanga",
    specificArea: "Test Area",
    year: 2024,
    erosionRate: 0.99,
  });
  console.log(`Inserted record ID: ${id}`);

  // Test 3: Get summary
  console.log("\nTest 3: Municipality summary");
  const summary = await getMunicipalitySummary("Balanga");
  console.log(JSON.stringify(summary, null, 2));
}

test().catch(console.error);
```

---

## Troubleshooting

| Issue                    | Solution                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| "Municipality not found" | Check municipalities table: `SELECT * FROM municipalities;`                  |
| Duplicate records        | UNIQUE constraint enforced - check for duplicate (area, year, source) combos |
| Missing geometry         | Geometry is optional - use LEFT JOIN                                         |
| Slow queries             | Check indexes: `SELECT * FROM pg_indexes WHERE tablename LIKE 'shoreline%';` |
| Data mismatch            | Use view: `SELECT * FROM shoreline_zones_compat;` to compare                 |

---

## Rollback Plan

If issues arise, keep using the backward-compatible view:

```javascript
const result = await pool.query(
  "SELECT * FROM shoreline_zones_compat WHERE municipality = $1",
  [req.params.municipality],
);
```

The old `shoreline_zones` table remains intact. No data is lost.

---

## Summary

✅ **5 clean tables** - each with a single responsibility  
✅ **Zero downtime** - backward-compatible views  
✅ **Better performance** - integer joins, smaller storage  
✅ **Scalable** - easy to add features (regions, barangays, etc.)  
✅ **Data integrity** - foreign key constraints prevent errors  
✅ **Gradual migration** - update code incrementally

Ready to start? Run the migration script!
