# Coastal Erosion Database Schema Analysis

**Generated:** April 10, 2026  
**Database:** PostgreSQL (db_coastalerosion)  
**Current Normalization Level:** 2NF with denormalization patterns

---

## EXECUTIVE SUMMARY

### Current State

- **Active Tables:** 5 tables in use
- **Missing Schema:** 1 referenced table (users)
- **Normalization:** Second Normal Form (2NF) with denormalized metrics
- **Data Integrity Issues:** Foreign key constraint orphaned (users table missing)
- **index Strategy:** Partial - key columns indexed, but compound queries could benefit

### Key Issues Identified

1. ⚠️ **CRITICAL:** `users` table referenced but never created - breaks upload_history FK
2. ⚠️ **HIGH:** Data denormalization in `shoreline_zones` (stores same metrics repeatedly)
3. ⚠️ **MEDIUM:** Redundant year-based sharding (shoreline_data vs shoreline_zones pattern)
4. ⚠️ **MEDIUM:** JSONB storage in `geojson_data` column - unindexed nested data
5. ✅ **LOW:** Good use of UNIQUE constraints and indexes for read-heavy operations

---

## TABLE INVENTORY & DETAILED SCHEMA

### 1. **shoreline_zones** (Primary Data Table)

**Location:** DB_MIGRATION_ZONES.sql  
**Purpose:** Store specific coastal zone erosion data with yearly snapshots  
**Row Count:** ~120+ rows (10 municipalities × 10 years)

#### Schema

```sql
CREATE TABLE IF NOT EXISTS shoreline_zones (
  id                SERIAL PRIMARY KEY,
  municipality      VARCHAR(255) NOT NULL,
  specific_area     VARCHAR(255) NOT NULL,
  year              INTEGER NOT NULL,
  erosion_rate      DECIMAL(10, 4) NOT NULL,
  cumulative_erosion DECIMAL(10, 4),
  data_quality      VARCHAR(50),
  source_type       VARCHAR(100),
  geojson_data      JSONB,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Column Analysis

| Column               | Type          | Constraints   | Notes                                                                |
| -------------------- | ------------- | ------------- | -------------------------------------------------------------------- |
| `id`                 | SERIAL        | PRIMARY KEY   | Auto-incrementing identifier                                         |
| `municipality`       | VARCHAR(255)  | NOT NULL      | Municipality name (denormalized - should FK to municipalities table) |
| `specific_area`      | VARCHAR(255)  | NOT NULL      | Zone/area name within municipality                                   |
| `year`               | INTEGER       | NOT NULL      | Year of measurement (2015-2026)                                      |
| `erosion_rate`       | DECIMAL(10,4) | NOT NULL      | Annual erosion in meters/year (negative values)                      |
| `cumulative_erosion` | DECIMAL(10,4) | -             | Cumulative erosion from baseline year                                |
| `data_quality`       | VARCHAR(50)   | -             | Quality indicator: "Measured", "Estimated", "Simulated"              |
| `source_type`        | VARCHAR(100)  | -             | Source: "GeoJSON", "Satellite", "Survey", "Calculated"               |
| `geojson_data`       | JSONB         | -             | GeoJSON geometry as unstructured JSONB                               |
| `created_at`         | TIMESTAMP     | DEFAULT NOW() | Record creation timestamp                                            |
| `updated_at`         | TIMESTAMP     | DEFAULT NOW() | Last modification timestamp                                          |

#### Indexes

```sql
CREATE INDEX idx_zones_municipality ON shoreline_zones(municipality);
CREATE INDEX idx_zones_year ON shoreline_zones(year);
CREATE INDEX idx_zones_specific_area ON shoreline_zones(specific_area);
CREATE INDEX idx_zones_municipality_year ON shoreline_zones(municipality, year);
```

#### Issues & Observations

- **Denormalization:** `cumulative_erosion` is calculated and stored (redundant) - could be computed from `erosion_rate` timeline
- **String-based Keys:** municipality names used as text (no FK) - vulnerable to data inconsistency
- **JSONB Storage:** GeoJSON stored unindexed - slow to query geographic boundaries
- **No Unique Constraint:** Multiple records for same municipality/year/area possible (duplicate risk)
- **Timestamps:** `updated_at` not automatically updated on modifications

---

### 2. **municipality_epr** (Aggregated Metrics Table)

**Location:** migrations/001_create_municipality_epr.sql  
**Purpose:** Store calculated End-Point Rate (EPR) aggregates per municipality  
**Row Count:** 12 records (one per municipality)

#### Schema

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
```

#### Column Analysis

| Column               | Type          | Constraints      | Notes                                                    |
| -------------------- | ------------- | ---------------- | -------------------------------------------------------- |
| `id`                 | SERIAL        | PRIMARY KEY      | Auto-incrementing identifier                             |
| `municipality`       | VARCHAR(100)  | UNIQUE, NOT NULL | Municipality name (FK candidate to municipalities table) |
| `epr_rate`           | DECIMAL(10,4) | NOT NULL         | End-Point Rate (m/year) - aggregated metric              |
| `confidence`         | DECIMAL(3,2)  | DEFAULT 0.75     | 0-1 confidence score (0.75 = 75%)                        |
| `base_year`          | INTEGER       | DEFAULT 2026     | Reference year for calculations                          |
| `calculation_method` | VARCHAR(50)   | DEFAULT 'Linear' | Method: "Linear", "LLS", "Polynomial"                    |
| `data_points_used`   | INTEGER       | -                | Count of years in calculation                            |
| `year_start`         | INTEGER       | -                | First year in dataset                                    |
| `year_end`           | INTEGER       | -                | Last year in dataset                                     |
| `calculated_at`      | TIMESTAMP     | DEFAULT NOW()    | Calculation timestamp                                    |
| `updated_at`         | TIMESTAMP     | DEFAULT NOW()    | Update timestamp                                         |

#### Indexes

```sql
CREATE INDEX idx_municipality_epr_municipality ON municipality_epr(LOWER(municipality));
CREATE INDEX idx_municipality_epr_rate ON municipality_epr(epr_rate DESC);
```

#### Issues & Observations

- **Redundant Data:** epr_rate, year_start, year_end can be calculated from shoreline_zones
- **Limited Precision:** confidence uses DECIMAL(3,2) - only 2 decimal places
- **No FK Reference:** municipality not linked to municipalities table (should be)
- **Temporal Tracking Issue:** Calculation timestamp not updated on record changes

---

### 3. **shoreline_data** (Aggregate/Legacy Table)

**Location:** DB_MIGRATION_REAL_DATA.sql  
**Purpose:** Store municipality-level aggregate erosion data (legacy/fallback)  
**Status:** Partially deprecated - being replaced by shoreline_zones  
**Row Count:** ~50 rows (variable by municipality/year)

#### Schema

```sql
CREATE TABLE IF NOT EXISTS shoreline_data (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  erosion_rate DECIMAL(10, 4),
  cumulative_erosion DECIMAL(10, 4),
  data_quality VARCHAR(50) DEFAULT 'Simulated',
  source_type VARCHAR(50) DEFAULT 'Calculated',
  geojson_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(municipality, year, source_type)
);
```

#### Column Analysis

| Column               | Type          | Constraints          | Notes                                                  |
| -------------------- | ------------- | -------------------- | ------------------------------------------------------ |
| `id`                 | SERIAL        | PRIMARY KEY          | Auto-incrementing identifier                           |
| `municipality`       | VARCHAR(100)  | NOT NULL             | Municipality name                                      |
| `year`               | INTEGER       | NOT NULL             | Annual measurement                                     |
| `erosion_rate`       | DECIMAL(10,4) | -                    | Annual erosion rate (nullable - inconsistent)          |
| `cumulative_erosion` | DECIMAL(10,4) | -                    | Cumulative change (redundant)                          |
| `data_quality`       | VARCHAR(50)   | DEFAULT 'Simulated'  | Quality: "Measured", "Simulated", "Estimated"          |
| `source_type`        | VARCHAR(50)   | DEFAULT 'Calculated' | Source: "GeoJSON", "Satellite", "Survey", "Calculated" |
| `geojson_data`       | JSONB         | -                    | GeoJSON geometry (unindexed)                           |
| `created_at`         | TIMESTAMP     | DEFAULT NOW()        | Creation timestamp                                     |
| `updated_at`         | TIMESTAMP     | DEFAULT NOW()        | Modification timestamp                                 |

#### Indexes

```sql
CREATE INDEX idx_shoreline_municipality ON shoreline_data(municipality);
CREATE INDEX idx_shoreline_year ON shoreline_data(year);
CREATE INDEX idx_shoreline_municipality_year ON shoreline_data(municipality, year);
CREATE INDEX idx_shoreline_source ON shoreline_data(source_type);
```

#### Unique Constraints

```sql
UNIQUE(municipality, year, source_type)  -- Prevents duplicate source entries
```

#### Issues & Observations

- **Deprecated:** Redundant with shoreline_zones - creates data maintenance complexity
- **Nullable Columns:** erosion_rate can be NULL - inconsistent with NOT NULL in shoreline_zones
- **Data Duplication Risk:** Union view (`all_shoreline_data`) adds complexity but necessary for backward compatibility
- **Default Values Inconsistent:** "Simulated" suggests simulated data populated initially

---

### 4. **upload_history** (Audit/Tracking Table)

**Location:** DB_MIGRATION_REAL_DATA.sql  
**Purpose:** Track admin file uploads and data processing operations  
**Row Count:** ~20+ rows (sample uploads only)

#### Schema

```sql
CREATE TABLE IF NOT EXISTS upload_history (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id),  -- ⚠️ FK TO MISSING TABLE
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
```

#### Column Analysis

| Column              | Type         | Constraints       | Notes                                                 |
| ------------------- | ------------ | ----------------- | ----------------------------------------------------- |
| `id`                | SERIAL       | PRIMARY KEY       | Auto-incrementing identifier                          |
| `admin_id`          | INTEGER      | FK users(id) ⚠️   | **FK TO NON-EXISTENT TABLE**                          |
| `upload_type`       | VARCHAR(50)  | NOT NULL          | Type: "GeoJSON", "Satellite_Image", "Survey_Data"     |
| `municipality`      | VARCHAR(100) | -                 | Target municipality (nullable)                        |
| `year`              | INTEGER      | -                 | Target year (nullable)                                |
| `file_name`         | VARCHAR(255) | -                 | Original uploaded filename                            |
| `file_path`         | VARCHAR(500) | -                 | Server storage path                                   |
| `file_size`         | INTEGER      | -                 | File size in bytes                                    |
| `process_status`    | VARCHAR(50)  | DEFAULT 'Pending' | Status: "Pending", "Processing", "Complete", "Failed" |
| `error_message`     | TEXT         | -                 | Error details if failed                               |
| `processed_records` | INTEGER      | -                 | Count of records inserted/updated                     |
| `created_at`        | TIMESTAMP    | DEFAULT NOW()     | Upload timestamp                                      |
| `updated_at`        | TIMESTAMP    | DEFAULT NOW()     | Last update timestamp                                 |

#### Indexes

```sql
CREATE INDEX idx_upload_admin ON upload_history(admin_id);
CREATE INDEX idx_upload_municipality ON upload_history(municipality);
CREATE INDEX idx_upload_status ON upload_history(process_status);
CREATE INDEX idx_upload_created ON upload_history(created_at DESC);
```

#### Issues & Observations

- **CRITICAL:** `admin_id` references `users(id)` but `users` table doesn't exist in migrations
- **Data Type Inconsistency:** upload_type/process_status use VARCHAR(50/255) but have limited enum values
- **Missing Constraints:** municipality should reference municipalities table if it should exist
- **Nullable FK:** admin_id not enforced (could allow anonymous uploads)
- **Audit Trail Weak:** No logging of WHO (user) performed the upload operation

---

### 5. **satellite_imagery** (Media Tracking Table)

**Location:** DB_MIGRATION_REAL_DATA.sql  
**Purpose:** Store satellite image metadata and references  
**Row Count:** ~10 records

#### Schema

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
```

#### Column Analysis

| Column         | Type         | Constraints   | Notes                                      |
| -------------- | ------------ | ------------- | ------------------------------------------ |
| `id`           | SERIAL       | PRIMARY KEY   | Auto-incrementing identifier               |
| `municipality` | VARCHAR(100) | NOT NULL      | Municipality name (denormalized)           |
| `year`         | INTEGER      | NOT NULL      | Year of imagery capture                    |
| `image_url`    | VARCHAR(500) | -             | Public URL to image (nullable)             |
| `image_path`   | VARCHAR(500) | -             | Local storage path (nullable)              |
| `capture_date` | DATE         | -             | Actual capture date (can differ from year) |
| `resolution`   | VARCHAR(50)  | -             | Resolution: "High", "Medium", "Low"        |
| `source`       | VARCHAR(100) | -             | Source: "Sentinel-2", "Landsat", "Custom"  |
| `created_at`   | TIMESTAMP    | DEFAULT NOW() | Record creation                            |
| `updated_at`   | TIMESTAMP    | DEFAULT NOW() | Record update                              |

#### Indexes

```sql
CREATE INDEX idx_satellite_municipality ON satellite_imagery(municipality);
CREATE INDEX idx_satellite_year ON satellite_imagery(year);
```

#### Unique Constraints

```sql
UNIQUE(municipality, year)  -- Ensures one image per municipality per year
```

#### Issues & Observations

- **Orphaned Data:** municipality not FK to municipalities table
- **Dual Storage:** Both image_url and image_path - unclear which is source of truth
- **Enum as String:** resolution/source use VARCHAR instead of ENUM type
- **Date/Year Mismatch:** capture_date and year could differ - potential for confusion
- **Low Row Count:** Minimal data - suggests this table is underutilized

---

## MISSING TABLE: users

### Critical Issue

**`users` table is referenced in `upload_history` FK but never defined in migrations**

#### Likely Schema (Inferred from server.js)

Based on SQL queries in server.js, the users table should be:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  roles VARCHAR(50) NOT NULL DEFAULT 'user',  -- 'user', 'admin'
  verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6),
  password_reset_code VARCHAR(6),
  password_reset_expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Recommended Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_roles ON users(roles);
```

**Action Required:** Create this table and establish proper FK relationship with upload_history.

---

## OPTIMIZATION OPPORTUNITIES

### TIER 1: CRITICAL (Must Fix)

1. **Create Missing users Table**
   - Create the users table with appropriate schema
   - Add indexes on email, username for authentication
   - Establish FK constraints properly
2. **Add Foreign Key Constraints**
   - `shoreline_zones.municipality` → municipalities table (to be created)
   - `shoreline_data.municipality` → municipalities table
   - `satellite_imagery.municipality` → municipalities table
   - `municipality_epr.municipality` → municipalities table
   - `upload_history.admin_id` → users table (fix broken FK)

3. **Create Missing municipalities Table**
   ```sql
   CREATE TABLE municipalities (
     id SERIAL PRIMARY KEY,
     name VARCHAR(255) UNIQUE NOT NULL,
     province VARCHAR(100),
     region VARCHAR(100),
     area_km2 DECIMAL(10, 2),
     population INTEGER,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

### TIER 2: HIGH PRIORITY (Normalization)

1. **Remove Redundant Cumulative Erosion**
   - Current: `cumulative_erosion` stored explicitly in shoreline_zones
   - Proposed: Calculate as SUM of erosion_rate for year >= base_year in queries
   - Benefit: Single source of truth, automatic consistency

2. **Consolidate shoreline_data and shoreline_zones**
   - Current: Two overlapping tables causing maintenance confusion
   - Proposed: Keep only `shoreline_zones` as canonical table
   - Create VIEW `shoreline_data` for backward compatibility
   - Benefit: Simplified maintenance, reduced redundancy

3. **Create Lookup Tables for Enums**

   ```sql
   CREATE TABLE data_quality_types (
     id SERIAL PRIMARY KEY,
     code VARCHAR(50) UNIQUE NOT NULL,
     description TEXT
   );

   CREATE TABLE data_source_types (
     id SERIAL PRIMARY KEY,
     code VARCHAR(50) UNIQUE NOT NULL,
     description TEXT
   );
   ```

   - Replace VARCHAR enums with FK references
   - Benefit: Data integrity, easier filtering

### TIER 3: MEDIUM PRIORITY (Query Performance)

1. **Improve JSONB Handling**
   - Current: geojson_data stored as JSONB, unindexed
   - Options:
     - Extract GIS data to PostGIS GEOMETRY type
     - Create GIN index on JSONB for text search
     - Normalize coordinates to separate table
   - Benefit: Geographic queries, spatial analysis

2. **Add Composite Indexes for Common Queries**

   ```sql
   -- Query pattern: municipality + year
   CREATE INDEX idx_zones_municipality_year ON shoreline_zones(municipality, year);

   -- Query pattern: municipality + year + source_type
   CREATE INDEX idx_zones_mun_year_source ON shoreline_zones(municipality, year, source_type);
   ```

3. **Add Partitioning by Year**
   - Current: All 1000+ yearly records in single table
   - Proposed: Partition shoreline_zones by year range
   - Benefit: Better query performance for year-range queries

### TIER 4: OPTIONAL (Data Quality)

1. **Add Check Constraints**

   ```sql
   -- Ensure erosion_rate is negative (erosion) or positive (accretion)
   ALTER TABLE shoreline_zones
   ADD CONSTRAINT check_erosion_rate CHECK (erosion_rate IS NULL OR (erosion_rate >= -50 AND erosion_rate <= 50));

   -- Ensure valid year range
   ALTER TABLE shoreline_zones
   ADD CONSTRAINT check_year CHECK (year >= 1950 AND year <= 2100);
   ```

2. **Add Trigger for updated_at**

   ```sql
   CREATE OR REPLACE FUNCTION update_modified_timestamp()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER update_shoreline_zones_timestamp
   BEFORE UPDATE ON shoreline_zones
   FOR EACH ROW
   EXECUTE FUNCTION update_modified_timestamp();
   ```

3. **Add Roles/Permissions Table**
   ```sql
   CREATE TABLE user_roles (
     id SERIAL PRIMARY KEY,
     name VARCHAR(50) UNIQUE NOT NULL,
     description TEXT,
     permissions JSONB
   );
   ```

---

## CURRENT ENTITY RELATIONSHIP DIAGRAM

```
  DEFAULT (No real relationships - text-based keys)

┌─────────────────────────────────────────────────────────────┐
│                         users ⚠️ MISSING                    │
│                                                              │
│  id (PK) | username | email | password_hash | roles | ... │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 │ FK (broken)
                                 │
┌────────────────────────────────▼───────────────────────────┐
│                   upload_history                            │
│                                                              │
│ id (PK) | admin_id (FK) | upload_type | municipality | ... │
└─────────────────────────────────────────────────────────────┘


┌─────────────────────────────────┐         ┌──────────────────────┐
│     shoreline_zones             │         │  municipality_epr    │
│                                 │         │                      │
│ id (PK)                         │         │ id (PK)             │
│ municipality (TEXT)◄─────┐      │         │ municipality (UK)   │
│ specific_area           │      │         │ epr_rate            │
│ year                    │      │         │ confidence          │
│ erosion_rate            │      │         │ calculation_method  │
│ cumulative_erosion      │      │         │ data_points_used    │
│ geojson_data (JSONB)    │      │         │ year_start, year_end│
│ source_type             │      │         └─────────┬───────────┘
│ ...                     │      │                   │
└──────────┬──────────────┘      │         (Aggregated from)
           │                     │                   │
           └─ No FK to ──────────┴───────────────────┘
            municipalities

┌──────────────────────────┐         ┌──────────────────────┐
│  shoreline_data          │         │ satellite_imagery    │
│  (Legacy/Aggregate)      │         │                      │
│                          │         │ id (PK)             │
│ id (PK)                  │         │ municipality        │
│ municipality (TEXT)      │         │ year                │
│ year                     │         │ image_url           │
│ erosion_rate (nullable)  │         │ image_path          │
│ cumulative_erosion       │         │ capture_date        │
│ source_type              │         │ resolution          │
│ geojson_data (JSONB)     │         │ source              │
│ ...                      │         │ ...                 │
│                          │         │                     │
│ UNIQUE(mun, year, src)   │         │ UNIQUE(mun, year)   │
└──────────────────────────┘         └─────────────────────┘

                     (All text-based municipality links)
                            ⚠️ NO FKs ⚠️
```

---

## OPTIMIZED ERD STRUCTURE (Recommended)

```
┌─────────────────────────┐
│     municipalities      │  ← NEW PRIMARY REFERENCE
│                         │
│ id (PK)                 │
│ name (UNIQUE)           │
│ province                │
│ region                  │
│ area_km2                │
│ population              │
│ coastal_perimeter_km    │
└────────────┬────────────┘
             │
    ┌────────┤
    │        │
    │        └───────────────────┐
    │                            │
    │      ┌─────────────────────┼─────────────────┐
    │      │                     │                 │
    │      ▼                     ▼                 ▼
    │
┌─────────────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│   shoreline_zones       │  │municipality_epr  │  │  satellite_imagery │
│   (Canonical)           │  │ (Aggregates)     │  │ (Media Tracking)   │
│                         │  │                  │  │                    │
│ id (PK)                 │  │ id (PK)          │  │ id (PK)            │
│ municipality_id (FK) ───┤──┤→ municipality_id │  │ municipality_id(FK)│
│ specific_area           │  │ (FK)             │  │ year               │
│ year                    │  │                  │  │ image_url          │
│ erosion_rate (NOT NULL) │  │ epr_rate         │  │ image_path         │
│ data_quality_id (FK)    │  │ confidence       │  │ capture_date       │
│ source_type_id (FK)     │  │ calculation_meth │  │ resolution_id (FK) │
│ geojson_data (JSON/GIS) │  │ data_points_used │  │ source_id (FK)     │
│ created_at              │  │ year_start->end  │  │ created_at         │
│ updated_at              │  │ calculated_at    │  │ updated_at         │
│                         │  │ updated_at       │  │                    │
│ UNIQUE(mun_id, yr, src)│  │ UNIQUE(mun_id)   │  │ UNIQUE(mun_id, yr) │
└──┬──────────────────────┘  └──────────────────┘  └────────────────────┘
   │
   │ (Deprecated, replaced by VIEW)
   │
   └─→ shoreline_data (VIEW on shoreline_zones)


┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│   users              │    │  data_quality_types  │    │data_source_types │
│                      │    │                      │    │                  │
│ id (PK)              │    │ id (PK)              │    │ id (PK)          │
│ username (UNIQUE)    │    │ code (UNIQUE)        │    │ code (UNIQUE)    │
│ email (UNIQUE)       │    │ description          │    │ description      │
│ password_hash        │    │                      │    │                  │
│ roles → role_enum    │    └──────────────────────┘    └──────────────────┘
│ verified             │
│ verification_code    │    ┌────────────────────────┐
│ password_reset_code  │    │upload_history          │
│ password_reset_expry │    │                        │
│ created_at           │    │ id (PK)                │
│ updated_at           │    │ admin_id (FK) ────────→users.id
└────────────┬─────────┘    │ municipality_id (FK) ──→municipalities.id
             │              │ upload_type_id (FK) ──→upload_types.id
             │              │ file_name              │
             │              │ file_path              │
             │              │ file_size              │
             └─────────────→│ process_status_id (FK) │
         admin_id FK        │ error_message          │
                           │ processed_records      │
                           │ created_at             │
                           └────────────────────────┘

Legend:
  PK = Primary Key
  FK = Foreign Key
  UNIQUE = Unique Constraint
  NOT NULL = Required Field
```

---

## RECOMMENDED MIGRATION STEPS

### Phase 1: Critical Fixes (Week 1)

1. Create `users` table with proper schema
2. Create `municipalities` reference table
3. Create lookup tables for enums (data_quality_types, data_source_types)
4. Add FK constraints where data exists

### Phase 2: Normalization (Week 2-3)

1. Create enum lookup tables
2. Migrate VARCHAR enum values to FK references
3. Test backward compatibility views
4. Remove redundant cumulative_erosion calculations

### Phase 3: Performance (Week 4)

1. Add composite indexes
2. Implement JSONB indexing or GIS migration
3. Set up partitioning by year (if table size > 1M rows)
4. Add triggering for updated_at timestamps

### Phase 4: Quality (Week 5+)

1. Add check constraints
2. Implement audit logging
3. Create materialized views for reporting
4. Performance tuning based on production queries

---

## INDEX STRATEGY SUMMARY

### Current Indexes

✅ Well covered:

- municipality lookups
- year-based queries
- compound municipality + year
- status/source filtering

❌ Missing:

- JSONB geojson_data (GIN index needed)
- Timestamp range queries
- FK-related indexes on users.id, municipalities.id

### Recommended Index Additions

```sql
-- Fast by creation time range (audit queries)
CREATE INDEX idx_shoreline_zones_created_range
  ON shoreline_zones(created_at DESC)
  WHERE created_at > NOW() - INTERVAL '1 year';

-- For JOIN on users
CREATE INDEX idx_upload_history_admin_id
  ON upload_history(admin_id) WHERE admin_id IS NOT NULL;

-- For JSONB queries
CREATE INDEX idx_shoreline_zones_geojson_gin
  ON shoreline_zones USING GIN(geojson_data);

-- For full-text search on municipality
CREATE INDEX idx_municipalities_name_lower
  ON municipalities(LOWER(name));
```

---

## DATA INTEGRITY ISSUES

### Issue 1: Broken Foreign Key (CRITICAL)

**Problem:** `upload_history.admin_id FK` → `users(id)` references non-existent table  
**Impact:** Database constraint cannot be enforced; upload orphan records possible  
**Solution:** Create users table with proper schema and enable constraint

### Issue 2: Missing Reference Normalization (HIGH)

**Problem:** All municipality references as VARCHAR text strings  
**Impact:**

- Data consistency issues (typos, case variations: "Bagac" vs "bagac")
- Wasted storage (municipality name repeated 120+ times)
- Slow JOINs due to string comparison
  **Solution:** Create municipalities table and migrate to FK references

### Issue 3: Denormalized Aggregates (MEDIUM)

**Problem:** `cumulative_erosion` calculated and stored explicitly  
**Impact:**

- Risk of inconsistency if erosion_rate changes but cumulative_erosion not updated
- Violates 3NF normalization
  **Solution:** Calculate from erosion_rate time-series on query, or add trigger to keep in sync

### Issue 4: Unstructured Spatial Data (MEDIUM)

**Problem:** GeoJSON stored as JSONB text without spatial indexing  
**Impact:**

- Geographic queries impossible without text parsing
- No enforced geometry validation
- Cannot use PostGIS spatial functions
  **Solution:** Migrate to PostGIS GEOMETRY type with proper indexes

---

## NORMALIZATION ANALYSIS

### Current Level: 2NF with denormalization

#### Issues Preventing 3NF

1. **Transitive Dependency:** erosion_rate → cumulative_erosion (cumulative_erosion depends on time-series, not on PK directly)
2. **Partial Dependency:** municipality name repeated for every year record
3. **Data Redundancy:** municipality fields in 5 different tables

#### Path to 3NF

```
Current (2NF):
  shoreline_zones(id, municipality, year, erosion_rate, cumulative_erosion)

Step 1: Eliminate partial dependency
  municipalities(id, name, region, ...)
  shoreline_zones(id, municipality_id, year, erosion_rate)

Step 2: Eliminate transitive dependency
  shoreline_zones(id, municipality_id, year, erosion_rate)
  → cumulative_erosion calculated in VIEW or application layer

Result (3NF):
  municipalities(id, name, ...)
  shoreline_zones(id, municipality_id, year, erosion_rate)
  [View: shoreline_zones_with_cumulative uses SUM() window function]
```

---

## QUERY PATTERNS & OPTIMIZATION

### Common Query 1: "Get latest erosion rate for municipality"

```sql
-- Current (inefficient):
SELECT erosion_rate FROM shoreline_zones
WHERE municipality = 'Bagac' AND year = 2026;

-- Optimized:
SELECT sz.erosion_rate FROM shoreline_zones sz
WHERE sz.municipality_id = (
  SELECT id FROM municipalities WHERE name = 'Bagac'
) AND sz.year = 2026;

-- Better (with index):
SELECT erosion_rate FROM shoreline_zones
WHERE municipality_id = 1 AND year = 2026;

-- Index needed:
CREATE INDEX idx_sz_mun_year ON shoreline_zones(municipality_id, year DESC);
```

### Common Query 2: "Get EPR analysis for all municipalities"

```sql
-- Recommended join:
SELECT m.name, me.epr_rate, me.confidence,
       COUNT(sz.id) as data_points
FROM municipalities m
LEFT JOIN municipality_epr me ON m.id = me.municipality_id
LEFT JOIN shoreline_zones sz ON m.id = sz.municipality_id
  AND sz.year >= me.year_start
  AND sz.year <= me.year_end
GROUP BY m.name, me.epr_rate, me.confidence
ORDER BY me.epr_rate DESC;

-- Indexes needed:
CREATE INDEX idx_mepr_mun_id ON municipality_epr(municipality_id);
CREATE INDEX idx_sz_mun_year_range ON shoreline_zones(municipality_id, year);
```

### Common Query 3: "Get time-series for risk assessment"

```sql
-- Time-series analysis with cumulative calculation:
SELECT
  year,
  erosion_rate,
  SUM(COALESCE(erosion_rate, 0)) OVER (
    ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) as running_cumulative
FROM shoreline_zones
WHERE municipality_id = $1
ORDER BY year;

-- Index needed:
CREATE INDEX idx_sz_mun_year_asc ON shoreline_zones(municipality_id, year ASC);
```

---

## STORAGE ANALYSIS

### Current Table Sizes (Estimated)

- **shoreline_zones:** ~120 rows × 0.5KB = 60KB
- **municipality_epr:** 12 rows × 0.3KB = 3.6KB
- **shoreline_data:** ~50 rows × 0.5KB = 25KB
- **upload_history:** ~20 rows × 0.4KB = 8KB
- **satellite_imagery:** ~10 rows × 0.3KB = 3KB
- **Total:** ~99KB (very small)

### Growth Projection (5 years)

- If adding 12 municipalities × 1 year = 12 new record/year
- → 120 + (5×12) = 180 rows in shoreline_zones
- → Still < 100KB with GeoJSON

### Recommendation

- Current size does not warrant partitioning
- Composite indexes sufficient
- JSONB GIN index recommended before spatial queries

---

## SECURITY & AUDIT CONSIDERATIONS

### Missing Audit Trail

- `upload_history` tracks files but not user actions
- No logging of data modifications
- No record of who changed what and when

### Recommended Audit Table

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  table_name VARCHAR(100),
  operation VARCHAR(10),  -- INSERT, UPDATE, DELETE
  record_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMP DEFAULT NOW()
);

-- Trigger on each table:
CREATE TRIGGER audit_shoreline_zones
AFTER INSERT OR UPDATE OR DELETE ON shoreline_zones
FOR EACH ROW EXECUTE FUNCTION log_changes();
```

---

## CONCLUSION & RECOMMENDATIONS

| Priority | Issue                     | Impact              | Action                 |
| -------- | ------------------------- | ------------------- | ---------------------- |
| CRITICAL | users table missing       | FK constraint fails | Create table + FK      |
| HIGH     | No municipalities FK      | Data inconsistency  | Normalize references   |
| HIGH     | cumulative_erosion denorm | Inconsistency risk  | Calculate on query     |
| MEDIUM   | shoreline_data redundant  | Maintenance burden  | Convert to VIEW        |
| MEDIUM   | JSONB unindexed           | Slow geo queries    | Add GIN or migrate GIS |
| MEDIUM   | No audit logging          | No data provenance  | Create audit triggers  |
| LOW      | Enum values as VARCHAR    | Type safety         | Create enum tables     |
| LOW      | No temporal partitions    | Full table scans    | Add if > 1M rows       |

**Estimated Effort:**

- Critical fixes: 4-6 hours
- Normalization: 8-12 hours
- Performance optimization: 6-10 hours
- Testing & validation: 4-8 hours
- **Total: 22-36 hours**

**Recommendation:** Proceed with Phase 1 (critical fixes) immediately before production use.
