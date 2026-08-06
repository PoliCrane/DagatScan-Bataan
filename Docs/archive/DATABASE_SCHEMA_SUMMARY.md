# Complete Database Schema Summary

## April 10, 2026

All table creation statements used in the coastal erosion system.

---

## 1. **users** Table

**Location:** Manually created (no migration file)  
**Modified by:** IMPLEMENTATION_CHECKLIST.md

```sql
-- Original table (pre-existing, created manually)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  roles VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ALTERED to add email verification support (per IMPLEMENTATION_CHECKLIST)
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);

-- Index for verification code lookups
CREATE INDEX IF NOT EXISTS idx_verification_code ON users(verification_code);
```

**Columns:**

- `id` - Primary key
- `username` - Unique username
- `email` - Unique email
- `password_hash` - Bcrypt hashed password
- `fullname` - User's display name
- `roles` - User role ("user", "admin", etc.)
- `verified` - Email verification status (added later)
- `verification_code` - 6-digit email verification code (added later)
- `created_at` - Registration timestamp
- `updated_at` - Last update timestamp

**Constraints:**

- UNIQUE on username
- UNIQUE on email
- DEFAULT false on verified
- DEFAULT CURRENT_TIMESTAMP on created_at/updated_at

---

## 2. **shoreline_zones** Table

**Location:** `backend/DB_MIGRATION_ZONES.sql`  
**Type:** Zone-level erosion data with GeoJSON geometries

```sql
CREATE TABLE IF NOT EXISTS shoreline_zones (
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

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_zones_municipality ON shoreline_zones(municipality);
CREATE INDEX IF NOT EXISTS idx_zones_year ON shoreline_zones(year);
CREATE INDEX IF NOT EXISTS idx_zones_specific_area ON shoreline_zones(specific_area);
CREATE INDEX IF NOT EXISTS idx_zones_municipality_year ON shoreline_zones(municipality, year);
```

**Purpose:** Store per-zone/per-area erosion data from GeoJSON uploads and satellite image analysis

**Columns:**

- `id` - Primary key
- `municipality` - Municipal name (e.g., "Balanga")
- `specific_area` - Zone identifier (e.g., "Zone_1", "Bagac Harbor Zone")
- `year` - Data year
- `erosion_rate` - m/year
- `cumulative_erosion` - Total retreat in meters
- `data_quality` - "High", "Medium", "Low", "Measured", "Estimated"
- `source_type` - "GeoJSON", "Satellite_Image", "Survey_Data"
- `geojson_data` - JSONB geometry + properties
- `created_at` - Record creation timestamp
- `updated_at` - Last modification timestamp

**Indexes (4):**

1. municipality - Fast filtering by municipality
2. year - Fast filtering by year
3. specific_area - Fast zone lookup
4. (municipality, year) - Combined for common queries

---

## 3. **upload_history** Table

**Location:** `backend/DB_MIGRATION_REAL_DATA.sql`  
**Type:** Administrative audit trail for data uploads

```sql
CREATE TABLE IF NOT EXISTS upload_history (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id),
  upload_type VARCHAR(50) NOT NULL,
  municipality VARCHAR(100),
  year INTEGER,
  file_name VARCHAR(255),
  file_path VARCHAR(500),
  file_size INTEGER,
  process_status VARCHAR(50) DEFAULT 'Pending',
  error_message TEXT,
  processed_records INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for upload tracking
CREATE INDEX IF NOT EXISTS idx_upload_admin ON upload_history(admin_id);
CREATE INDEX IF NOT EXISTS idx_upload_municipality ON upload_history(municipality);
CREATE INDEX IF NOT EXISTS idx_upload_status ON upload_history(process_status);
CREATE INDEX IF NOT EXISTS idx_upload_created ON upload_history(created_at DESC);
```

**Purpose:** Track all file uploads (GeoJSON, CSV, Satellite images) with status and metadata

**Columns:**

- `id` - Primary key
- `admin_id` - Foreign key to users(id)
- `upload_type` - "GeoJSON", "Satellite_Image", "Survey_Data", "CSV"
- `municipality` - Target municipality
- `year` - Data year
- `file_name` - Original filename
- `file_path` - Server storage path
- `file_size` - File bytes
- `process_status` - "Pending", "Processing", "Complete", "Failed"
- `error_message` - Error details if failed
- `processed_records` - Number of records inserted
- `created_at` - Upload timestamp
- `updated_at` - Last status change

**Indexes (4):**

1. admin_id - Track uploads per admin
2. municipality - Track uploads per municipality
3. process_status - Monitor processing status
4. created_at DESC - Recent uploads first

---

## 4. **satellite_imagery** Table

**Location:** `backend/DB_MIGRATION_REAL_DATA.sql`  
**Type:** Metadata storage for satellite images

```sql
CREATE TABLE IF NOT EXISTS satellite_imagery (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  image_url VARCHAR(500),
  image_path VARCHAR(500),
  capture_date DATE,
  resolution VARCHAR(50),
  source VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(municipality, year)
);

-- Indexes for satellite data queries
CREATE INDEX IF NOT EXISTS idx_satellite_municipality ON satellite_imagery(municipality);
CREATE INDEX IF NOT EXISTS idx_satellite_year ON satellite_imagery(year);
```

**Purpose:** Store satellite imagery metadata (paths, resolution, source) for historical tracking

**Columns:**

- `id` - Primary key
- `municipality` - Municipality name
- `year` - Data year
- `image_url` - Public URL if hosted online
- `image_path` - Local file path on server
- `capture_date` - Date image was captured
- `resolution` - "High" (0-1m), "Medium" (1-10m), "Low" (10m+)
- `source` - "Sentinel-2", "Landsat", "Worldview", "Custom"
- `created_at` - Upload timestamp
- `updated_at` - Last update

**Constraints:**

- UNIQUE(municipality, year) - One image per municipality per year

**Indexes (2):**

1. municipality - All images for a municipality
2. year - All images from a year

---

## 5. **municipality_epr** Table

**Location:** `backend/migrations/001_create_municipality_epr.sql`  
**Type:** Erosion Projection Rate (EPR) reference values

```sql
CREATE TABLE IF NOT EXISTS municipality_epr (
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

-- Indexes for EPR lookups
CREATE INDEX idx_municipality_epr_municipality ON municipality_epr(LOWER(municipality));
CREATE INDEX idx_municipality_epr_rate ON municipality_epr(epr_rate DESC);
```

**Purpose:** Single source-of-truth for EPR values used in all projections and analysis

**Columns:**

- `id` - Primary key
- `municipality` - Municipality name (UNIQUE)
- `epr_rate` - m/year (negative = erosion, positive = accretion)
- `confidence` - 0-1 scale (e.g., 0.82 = 82% confidence)
- `base_year` - Reference year (typically 2026)
- `calculation_method` - "Linear", "LLS", "Polynomial", "Simulated"
- `data_points_used` - Number of years in calculation
- `year_start` - First year of historical data
- `year_end` - Last year of historical data
- `calculated_at` - When EPR was calculated
- `updated_at` - Last recalculation

**Constraints:**

- UNIQUE on municipality

**Indexes (2):**

1. LOWER(municipality) - Case-insensitive municipality lookup
2. epr_rate DESC - Sort by erosion severity

---

## Table Relationships (Foreign Keys)

```
users (1)
  ↓
  └─── upload_history (M) -- admin_id REFERENCES users(id)

shoreline_zones (independent)
  - municipality VARCHAR - matches municipality_epr.municipality
  - year INTEGER - matches satellite_imagery.year

satellite_imagery (independent)
  - municipality VARCHAR
  - year INTEGER

municipality_epr (independent)
  - municipality VARCHAR (UNIQUE)
```

---

## Creation Order (Migrations Run)

1. **users** - Pre-existing, manually created (not in migration)
2. **001_create_municipality_epr.sql** - Runs first with `runMigration.js`
3. **DB_MIGRATION_ZONES.sql** - Creates `shoreline_zones` table
4. **DB_MIGRATION_REAL_DATA.sql** - Creates `upload_history`, `satellite_imagery`, `shoreline_data`

**Note:** After step 2, the IMPLEMENTATION_CHECKLIST manually alters `users` table to add `verified` and `verification_code` columns.

---

## Data Types Used

| Type          | Usage                                        |
| ------------- | -------------------------------------------- |
| SERIAL        | All PRIMARY KEY id columns                   |
| VARCHAR(n)    | String data with max length                  |
| INTEGER       | Years, counts, IDs                           |
| DECIMAL(10,4) | Erosion rates, EPR values (4 decimal places) |
| DECIMAL(3,2)  | Confidence scores (0-1 range)                |
| BOOLEAN       | verified flag in users                       |
| TIMESTAMP     | Log timestamps (created_at, updated_at)      |
| DATE          | capture_date in satellite_imagery            |
| JSONB         | GeoJSON geometries and properties            |
| TEXT          | Long error messages                          |

---

## Index Summary

| Table             | Index Count | Purpose                            |
| ----------------- | ----------- | ---------------------------------- |
| users             | 1           | verification_code lookup           |
| shoreline_zones   | 4           | Municipality, year, area filtering |
| upload_history    | 4           | Admin tracking, status monitoring  |
| satellite_imagery | 2           | Municipality & year filtering      |
| municipality_epr  | 2           | Municipality lookup, EPR sorting   |
| **TOTAL**         | **13**      | Database performance optimization  |

---

## View Created

**Location:** `DB_MIGRATION_ZONES.sql`

```sql
CREATE OR REPLACE VIEW all_shoreline_data AS
  (SELECT ... FROM shoreline_zones)
  UNION ALL
  (SELECT ... FROM shoreline_data WHERE NOT overridden by zones)
```

**Purpose:** Backward compatibility - combines zone-level and aggregate shoreline data

---

## Notable Schema Decisions

✅ **JSONB for GeoJSON** - Stores complete geometry + properties in one column
✅ **Composite Indexes** - (municipality, year) for common paired queries  
✅ **UNIQUE Constraints** - Prevents duplicate municipality_epr and satellite_imagery records
✅ **Cascade Foreign Keys** - upload_history references users with ON DELETE behavior
✅ **Soft Timestamps** - updated_at allows tracking of data modifications
✅ **No PostGIS** - Using JSONB instead of geometry types for simplicity

---

## Current Table Sizes (Approximate)

| Table             | Estimated Rows | Typical Data Volume                           |
| ----------------- | -------------- | --------------------------------------------- |
| users             | 10-100         | Admin accounts                                |
| shoreline_zones   | 100-1000       | 10 municipalities × 10 years × multiple zones |
| upload_history    | 50-500         | Historical uploads                            |
| satellite_imagery | 10-100         | One image per municipality per year           |
| municipality_epr  | 10             | One EPR per municipality                      |

---

## To View All Table Structures

```sql
-- See all tables
\dt

-- See specific table structure
\d shoreline_zones
\d users
\d upload_history
\d satellite_imagery
\d municipality_epr

-- See all indexes
\di

-- See table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname != 'pg_catalog'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```
