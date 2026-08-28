-- ============================================================================
-- DATABASE NORMALIZATION MIGRATION - OPTIMIZED SCHEMA
-- Coastal Erosion System - shoreline_zones Table Normalization
-- 
-- DESIGN PHILOSOPHY:
-- - Simple, clean relationships (no confusing multi-table lookups)
-- - Geometry belongs to location, not to measurements
-- - Data sources/quality combined in one reference table
-- - Zero downtime migration with full backward compatibility
-- 
-- EXECUTION PHASES:
--   1. Create reference tables (municipalities, specific_areas, data_sources)
--   2. Create geometry table (separated from metrics)
--   3. Create new normalized shoreline_data table
--   4. Migrate data from old shoreline_zones
--   5. Create backward-compatible views
--   6. Validation and consistency checks
-- ============================================================================

-- ============================================================================
-- PHASE 1: Create Reference Tables
-- ============================================================================

-- Table 1: Municipalities (Master list - single source of truth)
CREATE TABLE IF NOT EXISTS municipalities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_municipalities_name ON municipalities(name);

COMMENT ON TABLE municipalities IS 'Master list of municipalities';
COMMENT ON COLUMN municipalities.name IS 'Unique municipality name - single source of truth';

-- Table 2: Specific Areas within Municipalities
CREATE TABLE IF NOT EXISTS specific_areas (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  barangay VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(municipality_id, name)
);

CREATE INDEX IF NOT EXISTS idx_areas_municipality_id ON specific_areas(municipality_id);
CREATE INDEX IF NOT EXISTS idx_areas_name ON specific_areas(name);

COMMENT ON TABLE specific_areas IS 'Geographic areas/zones within municipalities';
COMMENT ON COLUMN specific_areas.municipality_id IS 'Foreign key to municipalities table';
COMMENT ON COLUMN specific_areas.barangay IS 'Optional barangay classification';

-- Table 3: Data Sources (Combined source type + quality)
CREATE TABLE IF NOT EXISTS data_sources (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(100) NOT NULL,
  data_quality VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, data_quality)
);

CREATE INDEX IF NOT EXISTS idx_sources_type ON data_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_sources_quality ON data_sources(data_quality);

COMMENT ON TABLE data_sources IS 'Enumerated list of source types and their quality levels';
COMMENT ON COLUMN data_sources.source_type IS 'E.g., GeoJSON, Satellite, Survey, Calculated';
COMMENT ON COLUMN data_sources.data_quality IS 'E.g., High, Medium, Low';

-- ============================================================================
-- PHASE 2: Create Geometry Table (Location-based, not measurement-based)
-- ============================================================================

CREATE TABLE IF NOT EXISTS shoreline_geometries (
  id SERIAL PRIMARY KEY,
  specific_area_id INTEGER NOT NULL REFERENCES specific_areas(id) ON DELETE CASCADE,
  geojson_data JSONB NOT NULL,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_geometries_area_id ON shoreline_geometries(specific_area_id);
CREATE INDEX IF NOT EXISTS idx_geometries_valid_from ON shoreline_geometries(valid_from);

COMMENT ON TABLE shoreline_geometries IS 'Geometry data for specific areas - versioned by time';
COMMENT ON COLUMN shoreline_geometries.specific_area_id IS 'Foreign key to specific_areas - one area can have multiple geometries over time';
COMMENT ON COLUMN shoreline_geometries.geojson_data IS 'GeoJSON Feature/FC with coordinates';
COMMENT ON COLUMN shoreline_geometries.valid_from IS 'Date this geometry became valid';
COMMENT ON COLUMN shoreline_geometries.valid_to IS 'Date this geometry was superseded (NULL = current)';

-- ============================================================================
-- PHASE 3: Create New Normalized shoreline_data Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS shoreline_data (
  id SERIAL PRIMARY KEY,
  specific_area_id INTEGER NOT NULL REFERENCES specific_areas(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  erosion_rate DECIMAL(10, 4) NOT NULL,
  cumulative_erosion DECIMAL(10, 4),
  source_id INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Prevent duplicate records
  UNIQUE(specific_area_id, year, source_id)
);

CREATE INDEX IF NOT EXISTS idx_shoreline_area_id ON shoreline_data(specific_area_id);
CREATE INDEX IF NOT EXISTS idx_shoreline_year ON shoreline_data(year);
CREATE INDEX IF NOT EXISTS idx_shoreline_source_id ON shoreline_data(source_id);
CREATE INDEX IF NOT EXISTS idx_shoreline_area_year ON shoreline_data(specific_area_id, year);

COMMENT ON TABLE shoreline_data IS 'Time-series erosion metrics for specific areas';
COMMENT ON COLUMN shoreline_data.specific_area_id IS 'Foreign key to specific_areas table';
COMMENT ON COLUMN shoreline_data.year IS 'Year of measurement';
COMMENT ON COLUMN shoreline_data.erosion_rate IS 'Annual erosion rate in meters';
COMMENT ON COLUMN shoreline_data.cumulative_erosion IS 'Cumulative erosion from baseline';
COMMENT ON COLUMN shoreline_data.source_id IS 'Foreign key to data_sources (source type + quality)';

-- ============================================================================
-- PHASE 4: Backfill Reference Tables from Existing shoreline_zones
-- ============================================================================

-- Insert all unique municipalities
INSERT INTO municipalities (name)
SELECT DISTINCT municipality
FROM shoreline_zones
WHERE municipality IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Insert all unique source/quality combinations
INSERT INTO data_sources (source_type, data_quality)
SELECT DISTINCT source_type, data_quality
FROM shoreline_zones
WHERE source_type IS NOT NULL OR data_quality IS NOT NULL
ON CONFLICT (source_type, data_quality) DO NOTHING;

-- Insert all unique specific areas with their municipalities
INSERT INTO specific_areas (municipality_id, name)
SELECT DISTINCT m.id, sz.specific_area
FROM shoreline_zones sz
JOIN municipalities m ON LOWER(m.name) = LOWER(sz.municipality)
WHERE sz.specific_area IS NOT NULL
ON CONFLICT (municipality_id, name) DO NOTHING;

-- ============================================================================
-- PHASE 5: Migrate Time-Series Data (shoreline_zones → shoreline_data)
-- ============================================================================

INSERT INTO shoreline_data (
  specific_area_id,
  year,
  erosion_rate,
  cumulative_erosion,
  source_id,
  created_at,
  updated_at
)
SELECT 
  sa.id,
  sz.year,
  sz.erosion_rate,
  sz.cumulative_erosion,
  ds.id,
  sz.created_at,
  sz.updated_at
FROM shoreline_zones sz
JOIN municipalities m ON LOWER(m.name) = LOWER(sz.municipality)
JOIN specific_areas sa ON sa.municipality_id = m.id 
  AND LOWER(sa.name) = LOWER(sz.specific_area)
LEFT JOIN data_sources ds ON LOWER(ds.source_type) = LOWER(sz.source_type)
  AND LOWER(ds.data_quality) = LOWER(sz.data_quality)
ON CONFLICT (specific_area_id, year, source_id) DO NOTHING;

-- ============================================================================
-- PHASE 6: Migrate Geometries (shoreline_zones → shoreline_geometries)
-- ============================================================================

-- Extract unique geometries from shoreline_zones
-- Assumes geometry is stable per area (use earliest recording date)
INSERT INTO shoreline_geometries (
  specific_area_id,
  geojson_data,
  valid_from,
  description,
  created_at
)
SELECT 
  sa.id,
  (SELECT geojson_data FROM shoreline_zones sz2 
   WHERE LOWER(sz2.municipality) = LOWER(m.name)
     AND LOWER(sz2.specific_area) = LOWER(sa.name)
     AND sz2.geojson_data IS NOT NULL
   ORDER BY sz2.year ASC, sz2.created_at ASC
   LIMIT 1),
  (SELECT MIN(sz2.year)::DATE FROM shoreline_zones sz2 
   WHERE LOWER(sz2.municipality) = LOWER(m.name)
     AND LOWER(sz2.specific_area) = LOWER(sa.name)
     AND sz2.geojson_data IS NOT NULL),
  'Migrated from shoreline_zones',
  CURRENT_TIMESTAMP
FROM specific_areas sa
JOIN municipalities m ON sa.municipality_id = m.id
WHERE EXISTS (
  SELECT 1 FROM shoreline_zones sz
  WHERE LOWER(sz.municipality) = LOWER(m.name)
    AND LOWER(sz.specific_area) = LOWER(sa.name)
    AND sz.geojson_data IS NOT NULL
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PHASE 7: Create Backward-Compatibility Views
-- ============================================================================

-- View 1: shoreline_zones_compat
-- Returns data in the ORIGINAL format for existing code
CREATE OR REPLACE VIEW shoreline_zones_compat AS
SELECT 
  sd.id,
  m.name AS municipality,
  sa.name AS specific_area,
  sd.year,
  sd.erosion_rate,
  sd.cumulative_erosion,
  ds.data_quality,
  ds.source_type,
  sg.geojson_data,
  sd.created_at,
  sd.updated_at
FROM shoreline_data sd
JOIN specific_areas sa ON sd.specific_area_id = sa.id
JOIN municipalities m ON sa.municipality_id = m.id
LEFT JOIN data_sources ds ON sd.source_id = ds.id
LEFT JOIN shoreline_geometries sg ON sa.id = sg.specific_area_id
  AND sg.valid_to IS NULL  -- Current geometry only
ORDER BY m.name, sa.name, sd.year DESC;

COMMENT ON VIEW shoreline_zones_compat IS 'Backward-compatible view matching original shoreline_zones format';

-- View 2: Municipality Summary (useful for dashboards)
CREATE OR REPLACE VIEW municipality_summary AS
SELECT 
  m.id,
  m.name AS municipality,
  COUNT(DISTINCT sa.id) AS total_areas,
  COUNT(DISTINCT sd.year) AS years_recorded,
  MIN(sd.year) AS first_year,
  MAX(sd.year) AS latest_year,
  AVG(sd.erosion_rate) AS avg_erosion_rate,
  MAX(sd.cumulative_erosion) AS max_cumulative_erosion,
  STRING_AGG(DISTINCT ds.source_type, ', ') AS source_types
FROM municipalities m
LEFT JOIN specific_areas sa ON m.id = sa.municipality_id
LEFT JOIN shoreline_data sd ON sa.id = sd.specific_area_id
LEFT JOIN data_sources ds ON sd.source_id = ds.id
GROUP BY m.id, m.name
ORDER BY m.name;

COMMENT ON VIEW municipality_summary IS 'Summary statistics per municipality';

-- View 3: Area Summary (useful for area-level reports)
CREATE OR REPLACE VIEW area_summary AS
SELECT 
  sa.id,
  m.name AS municipality,
  sa.name AS specific_area,
  COUNT(DISTINCT sd.year) AS years_recorded,
  MIN(sd.year) AS first_year,
  MAX(sd.year) AS latest_year,
  AVG(sd.erosion_rate) AS avg_erosion_rate,
  COALESCE(MAX(sd.cumulative_erosion), 0) AS max_cumulative_erosion,
  STRING_AGG(DISTINCT ds.source_type, ', ') AS source_types
FROM specific_areas sa
JOIN municipalities m ON sa.municipality_id = m.id
LEFT JOIN shoreline_data sd ON sa.id = sd.specific_area_id
LEFT JOIN data_sources ds ON sd.source_id = ds.id
GROUP BY sa.id, m.name, sa.name
ORDER BY m.name, sa.name;

COMMENT ON VIEW area_summary IS 'Summary statistics per coastal area';

-- ============================================================================
-- PHASE 8: Validation Queries
-- ============================================================================

-- Run these to verify migration success
CREATE OR REPLACE VIEW migration_validation AS
SELECT 
  'Total records in old table' AS check_name,
  (SELECT COUNT(*) FROM shoreline_zones)::TEXT AS result
UNION ALL
SELECT 
  'Total records in new table',
  (SELECT COUNT(*) FROM shoreline_data)::TEXT
UNION ALL
SELECT 
  'Total municipalities populated',
  (SELECT COUNT(*) FROM municipalities)::TEXT
UNION ALL
SELECT 
  'Total specific_areas populated',
  (SELECT COUNT(*) FROM specific_areas)::TEXT
UNION ALL
SELECT 
  'Total geometries extracted',
  (SELECT COUNT(*) FROM shoreline_geometries)::TEXT
UNION ALL
SELECT 
  'Missing area references',
  (SELECT COUNT(*)::TEXT FROM shoreline_zones sz
   WHERE NOT EXISTS (
     SELECT 1 FROM municipalities m
     WHERE LOWER(m.name) = LOWER(sz.municipality)
   ))
UNION ALL
SELECT 
  'Missing source/quality refs',
  (SELECT COUNT(*)::TEXT FROM shoreline_zones sz
   WHERE (sz.source_type IS NOT NULL OR sz.data_quality IS NOT NULL)
     AND NOT EXISTS (
       SELECT 1 FROM data_sources ds
       WHERE LOWER(ds.source_type) = LOWER(sz.source_type)
         AND LOWER(ds.data_quality) = LOWER(sz.data_quality)
     ))
ORDER BY result DESC;

COMMENT ON VIEW migration_validation IS 'Verify migration success - all results should be >= 0';

-- ============================================================================
-- PHASE 9: Helper Views for Common Queries
-- ============================================================================

-- View: Get latest data for each area
CREATE OR REPLACE VIEW latest_shoreline_data AS
SELECT DISTINCT ON (sa.id)
  sa.id,
  m.id AS municipality_id,
  m.name AS municipality,
  sa.name AS specific_area,
  sd.year,
  sd.erosion_rate,
  sd.cumulative_erosion,
  ds.source_type,
  ds.data_quality
FROM specific_areas sa
JOIN municipalities m ON sa.municipality_id = m.id
LEFT JOIN shoreline_data sd ON sa.id = sd.specific_area_id
LEFT JOIN data_sources ds ON sd.source_id = ds.id
ORDER BY sa.id, sd.year DESC NULLS LAST;

COMMENT ON VIEW latest_shoreline_data IS 'Most recent data point for each specific area';

-- ============================================================================
-- MIGRATION COMPLETE - Next Steps
-- ============================================================================

/*
VERIFICATION CHECKLIST:

1. Run validation query:
   SELECT * FROM migration_validation;
   All counts should match (old table = new table)

2. Test backward compatibility:
   SELECT * FROM shoreline_zones_compat LIMIT 10;
   Should return data in original format

3. Verify geometry extraction:
   SELECT COUNT(*) FROM shoreline_geometries;
   Should have one geometry per unique area

4. Test summary views:
   SELECT * FROM municipality_summary;
   SELECT * FROM area_summary;

5. Integration test:
   Run existing API tests - should pass without code changes

CODE MIGRATION STEPS (Gradual):

WEEK 1:
├─ All code uses shoreline_zones_compat view
├─ Run integration tests (pass without changes)
└─ Monitor for errors

WEEKS 2-4:
├─ Update API routes one at a time
├─ Use new shoreline_data table directly
├─ Test each route independently
└─ Deploy incrementally

Example new query:
  SELECT 
    sd.id, m.name, sa.name, sd.year, sd.erosion_rate,
    ds.source_type, ds.data_quality
  FROM shoreline_data sd
  JOIN specific_areas sa ON sd.specific_area_id = sa.id
  JOIN municipalities m ON sa.municipality_id = m.id
  LEFT JOIN data_sources ds ON sd.source_id = ds.id
  WHERE m.name = 'Balanga'
  ORDER BY sd.year DESC;

WEEK 5+:
├─ All code migrated
├─ Delete old shoreline_zones table (BACKUP FIRST!)
├─ Rename shoreline_data to shoreline_zones if desired
└─ Archive this migration script

ROLLBACK PLAN:
If issues occur, simply keep using shoreline_zones_compat view
- Old table shoreline_zones remains intact
- New tables can coexist indefinitely
- Revert application code to use view
- No data loss, no downtime
*/

-- ============================================================================
-- END MIGRATION SCRIPT
-- ============================================================================
