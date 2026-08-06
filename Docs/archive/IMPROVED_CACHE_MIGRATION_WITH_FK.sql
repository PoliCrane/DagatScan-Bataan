-- Migration: Processed Data Caching Layer with Foreign Keys - PostgreSQL Version
-- Creates cache tables with proper relationships using Foreign Keys
-- Improved ERD with municipalities master table
-- Updated automatically when raw data changes via triggers
-- Works with simplified shoreline_zones table schema

-- ============================================================
-- 0. MUNICIPALITIES MASTER TABLE
-- Single source of truth for all municipalities
-- ============================================================
CREATE TABLE IF NOT EXISTS municipalities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  region VARCHAR(100),
  province VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_municipalities_name ON municipalities(name);

-- Insert Bataan municipalities (example data)
INSERT INTO municipalities (name, region, province) VALUES
('Bataan', 'Region III', 'Bataan'),
('Mariveles', 'Region III', 'Bataan'),
('Limay', 'Region III', 'Bataan'),
('Pilar', 'Region III', 'Bataan'),
('Orani', 'Region III', 'Bataan'),
('Samal', 'Region III', 'Bataan'),
('Morong', 'Region III', 'Bataan'),
('Abucay', 'Region III', 'Bataan'),
('Balanga', 'Region III', 'Bataan'),
('Bagac', 'Region III', 'Bataan'),
('Parang', 'Region III', 'Bataan'),
('Dinalupihan', 'Region III', 'Bataan')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 1. SHORELINE ZONES TABLE (Updated with FK)
-- Raw data with Foreign Key to municipalities
-- ============================================================
CREATE TABLE IF NOT EXISTS shoreline_zones (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE RESTRICT,
  specific_area VARCHAR(255),
  year INTEGER NOT NULL,
  erosion_rate NUMERIC(10, 4),
  cumulative_erosion NUMERIC(15, 4),
  data_quality VARCHAR(100),
  source_type VARCHAR(100),
  geojson_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for shoreline_zones
CREATE INDEX IF NOT EXISTS idx_zones_municipality_id ON shoreline_zones(municipality_id);
CREATE INDEX IF NOT EXISTS idx_zones_year ON shoreline_zones(year);
CREATE INDEX IF NOT EXISTS idx_zones_municipality_year ON shoreline_zones(municipality_id, year);

-- ============================================================
-- 2. EROSION ANALYSIS CACHE TABLE (Updated with FK)
-- Stores pre-computed erosion metrics for each municipality
-- ============================================================
CREATE TABLE IF NOT EXISTS municipality_analysis_cache (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL UNIQUE REFERENCES municipalities(id) ON DELETE CASCADE,
  analysis_year INTEGER NOT NULL,
  coastline_length NUMERIC(10, 4),
  affected_area NUMERIC(15, 4),
  avg_erosion_rate NUMERIC(10, 4),
  cumulative_erosion NUMERIC(15, 4),
  zone_count INTEGER,
  risk_level VARCHAR(50),
  data_quality VARCHAR(255),
  data_sources TEXT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cache_valid_until TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_municipality_id ON municipality_analysis_cache(municipality_id);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_year ON municipality_analysis_cache(analysis_year);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_updated ON municipality_analysis_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_validity ON municipality_analysis_cache(cache_valid_until);

-- ============================================================
-- 3. PREDICTION CACHE TABLE (Updated with FK)
-- Stores pre-computed predictions for future years
-- ============================================================
CREATE TABLE IF NOT EXISTS prediction_cache (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  base_year INTEGER NOT NULL,
  predicted_year INTEGER NOT NULL,
  estimated_retreat NUMERIC(10, 4),
  projected_epr NUMERIC(10, 4),
  risk_level VARCHAR(50),
  calculation_method VARCHAR(100),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cache_valid_until TIMESTAMP,
  CONSTRAINT unique_prediction UNIQUE (municipality_id, base_year, predicted_year)
);

CREATE INDEX IF NOT EXISTS idx_prediction_cache_municipality_id ON prediction_cache(municipality_id);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_predicted_year ON prediction_cache(predicted_year);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_updated ON prediction_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_validity ON prediction_cache(cache_valid_until);

-- ============================================================
-- 4. COMPARISON CACHE TABLE (Updated with FK)
-- Stores pre-computed comparisons between two years
-- ============================================================
CREATE TABLE IF NOT EXISTS shoreline_comparison_cache (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  year_start INTEGER NOT NULL,
  year_end INTEGER NOT NULL,
  erosion_change NUMERIC(10, 4),
  rate_change NUMERIC(10, 4),
  area_change NUMERIC(15, 4),
  risk_level_change VARCHAR(50),
  event_summary TEXT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cache_valid_until TIMESTAMP,
  CONSTRAINT unique_comparison UNIQUE (municipality_id, year_start, year_end)
);

CREATE INDEX IF NOT EXISTS idx_comparison_cache_municipality_id ON shoreline_comparison_cache(municipality_id);
CREATE INDEX IF NOT EXISTS idx_comparison_cache_year_range ON shoreline_comparison_cache(year_start, year_end);
CREATE INDEX IF NOT EXISTS idx_comparison_cache_updated ON shoreline_comparison_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_comparison_cache_validity ON shoreline_comparison_cache(cache_valid_until);

-- ============================================================
-- 5. BATAAN SUMMARY CACHE TABLE
-- Stores aggregated Bataan-wide metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS bataan_summary_cache (
  id SERIAL PRIMARY KEY,
  analysis_year INTEGER NOT NULL UNIQUE,
  total_municipalities INTEGER,
  high_risk_zones INTEGER,
  moderate_risk_zones INTEGER,
  low_risk_zones INTEGER,
  avg_erosion_rate NUMERIC(10, 4),
  total_affected_area NUMERIC(15, 4),
  municipalities_list TEXT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cache_valid_until TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bataan_cache_year ON bataan_summary_cache(analysis_year);
CREATE INDEX IF NOT EXISTS idx_bataan_cache_updated ON bataan_summary_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_bataan_cache_validity ON bataan_summary_cache(cache_valid_until);

-- ============================================================
-- 6. CACHE INVALIDATION LOG TABLE
-- Tracks when cache was invalidated and why (with FK reference)
-- ============================================================
CREATE TABLE IF NOT EXISTS cache_invalidation_log (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100),
  municipality_id INTEGER REFERENCES municipalities(id) ON DELETE SET NULL,
  reason VARCHAR(200),
  invalidated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invalidation_log_municipality_id ON cache_invalidation_log(municipality_id);
CREATE INDEX IF NOT EXISTS idx_invalidation_log_table ON cache_invalidation_log(table_name);
CREATE INDEX IF NOT EXISTS idx_invalidation_log_time ON cache_invalidation_log(invalidated_at);

-- ============================================================
-- 7. FUNCTION: Update automatic timestamp for updated_at
-- PostgreSQL requires explicit function for UPDATE trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. TRIGGERS: Update cache when shoreline_zones is modified
-- Automatically invalidate dependent caches
-- ============================================================

-- Trigger for INSERT on shoreline_zones
CREATE OR REPLACE FUNCTION log_shoreline_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
  VALUES ('municipality_analysis_cache', NEW.municipality_id, 'Raw data inserted');
  
  INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
  VALUES ('bataan_summary_cache', NEW.municipality_id, 'Raw data inserted');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_shoreline_zones_insert_on_cache ON shoreline_zones;
CREATE TRIGGER tr_shoreline_zones_insert_on_cache
AFTER INSERT ON shoreline_zones
FOR EACH ROW
EXECUTE FUNCTION log_shoreline_insert();

-- Trigger for UPDATE on shoreline_zones
CREATE OR REPLACE FUNCTION log_shoreline_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.year IS DISTINCT FROM OLD.year OR NEW.erosion_rate IS DISTINCT FROM OLD.erosion_rate OR NEW.cumulative_erosion IS DISTINCT FROM OLD.cumulative_erosion THEN
    INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
    VALUES ('municipality_analysis_cache', NEW.municipality_id, 'Raw data updated');
    
    INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
    VALUES ('prediction_cache', NEW.municipality_id, 'Raw data updated');
    
    INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
    VALUES ('bataan_summary_cache', NEW.municipality_id, 'Raw data updated');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_shoreline_zones_update_on_cache ON shoreline_zones;
CREATE TRIGGER tr_shoreline_zones_update_on_cache
AFTER UPDATE ON shoreline_zones
FOR EACH ROW
EXECUTE FUNCTION log_shoreline_update();

-- Trigger for DELETE on shoreline_zones
CREATE OR REPLACE FUNCTION log_shoreline_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
  VALUES ('municipality_analysis_cache', OLD.municipality_id, 'Raw data deleted');
  
  INSERT INTO cache_invalidation_log (table_name, municipality_id, reason)
  VALUES ('bataan_summary_cache', OLD.municipality_id, 'Raw data deleted');
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_shoreline_zones_delete_on_cache ON shoreline_zones;
CREATE TRIGGER tr_shoreline_zones_delete_on_cache
AFTER DELETE ON shoreline_zones
FOR EACH ROW
EXECUTE FUNCTION log_shoreline_delete();

-- ============================================================
-- 9. TRIGGERS: Update timestamp on cache tables
-- ============================================================
DROP TRIGGER IF EXISTS tr_update_analysis_cache_timestamp ON municipality_analysis_cache;
CREATE TRIGGER tr_update_analysis_cache_timestamp
BEFORE UPDATE ON municipality_analysis_cache
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS tr_update_prediction_cache_timestamp ON prediction_cache;
CREATE TRIGGER tr_update_prediction_cache_timestamp
BEFORE UPDATE ON prediction_cache
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS tr_update_comparison_cache_timestamp ON shoreline_comparison_cache;
CREATE TRIGGER tr_update_comparison_cache_timestamp
BEFORE UPDATE ON shoreline_comparison_cache
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS tr_update_bataan_cache_timestamp ON bataan_summary_cache;
CREATE TRIGGER tr_update_bataan_cache_timestamp
BEFORE UPDATE ON bataan_summary_cache
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 10. CACHE VALIDITY VIEW (Updated with JOIN for better info)
-- Shows which caches are still valid vs expired with municipality names
-- ============================================================
DROP VIEW IF EXISTS cache_validity_status CASCADE;
CREATE VIEW cache_validity_status AS
SELECT 
  'municipality_analysis_cache' as cache_type,
  m.name as municipality,
  m.id as municipality_id,
  mac.updated_at,
  mac.cache_valid_until,
  CASE 
    WHEN mac.cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN mac.cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END as status
FROM municipality_analysis_cache mac
JOIN municipalities m ON mac.municipality_id = m.id
UNION ALL
SELECT 
  'prediction_cache',
  m.name,
  m.id,
  pc.updated_at,
  pc.cache_valid_until,
  CASE 
    WHEN pc.cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN pc.cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END
FROM prediction_cache pc
JOIN municipalities m ON pc.municipality_id = m.id
UNION ALL
SELECT 
  'shoreline_comparison_cache',
  m.name,
  m.id,
  scc.updated_at,
  scc.cache_valid_until,
  CASE 
    WHEN scc.cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN scc.cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END
FROM shoreline_comparison_cache scc
JOIN municipalities m ON scc.municipality_id = m.id
UNION ALL
SELECT 
  'bataan_summary_cache',
  'Bataan Province',
  1,
  bsc.updated_at,
  bsc.cache_valid_until,
  CASE 
    WHEN bsc.cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN bsc.cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END
FROM bataan_summary_cache bsc;

-- ============================================================
-- 11. ERD RELATIONSHIPS SUMMARY
-- ============================================================
-- municipalities (1) ──────┬─── (M) shoreline_zones
--                          ├─── (M) municipality_analysis_cache
--                          ├─── (M) prediction_cache
--                          ├─── (M) shoreline_comparison_cache
--                          └─── (M) cache_invalidation_log
--
-- ON DELETE Behavior:
-- - shoreline_zones: RESTRICT (cannot delete municipality with data)
-- - cache tables: CASCADE (delete caches when municipality deleted)
-- - invalidation log: SET NULL (preserve audit trail)

-- ============================================================
-- 12. Verification Queries
-- ============================================================
-- SELECT * FROM cache_validity_status;
-- SELECT * FROM cache_invalidation_log;
-- SELECT * FROM municipalities;
-- SELECT sz.id, m.name, sz.specific_area, sz.year FROM shoreline_zones sz JOIN municipalities m ON sz.municipality_id = m.id;
-- \d shoreline_zones  -- Show table structure with FK
-- \d municipality_analysis_cache  -- Show constraints

-- ============================================================
-- Notes:
-- - PostgreSQL syntax with proper Foreign Keys
-- - municipalities table as master reference
-- - Clean 1:M relationships from municipalities to all cache tables
-- - Cascade delete on cache tables ensures consistency
-- - Restrict delete on shoreline_zones prevents orphaned data
-- - cache_validity_status view joins with municipalities for readable data
-- - Better ERD representation with clear relationships
-- ============================================================
