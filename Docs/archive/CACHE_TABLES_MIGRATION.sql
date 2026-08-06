-- Migration: Processed Data Caching Layer - PostgreSQL Version
-- Creates cache tables for performance optimization
-- Stores pre-computed results from raw shoreline data
-- Updated automatically when raw data changes via triggers
-- Works with simplified shoreline_zones table schema

-- ============================================================
-- 1. ENSURE shoreline_zones TABLE EXISTS
-- Simple single-table design for storing all shoreline data
-- ============================================================
CREATE TABLE IF NOT EXISTS shoreline_zones (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(255) NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_zones_municipality ON shoreline_zones(municipality);
CREATE INDEX IF NOT EXISTS idx_zones_year ON shoreline_zones(year);
CREATE INDEX IF NOT EXISTS idx_zones_municipality_year ON shoreline_zones(municipality, year);

-- ============================================================
-- 2. EROSION ANALYSIS CACHE TABLE
-- Stores pre-computed erosion metrics for each municipality
-- ============================================================
CREATE TABLE IF NOT EXISTS municipality_analysis_cache (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(255) NOT NULL UNIQUE,
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

CREATE INDEX IF NOT EXISTS idx_analysis_cache_municipality ON municipality_analysis_cache(municipality);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_year ON municipality_analysis_cache(analysis_year);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_updated ON municipality_analysis_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_validity ON municipality_analysis_cache(cache_valid_until);

-- ============================================================
-- 3. PREDICTION CACHE TABLE
-- Stores pre-computed predictions for future years
-- ============================================================
CREATE TABLE IF NOT EXISTS prediction_cache (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(255) NOT NULL,
  base_year INTEGER NOT NULL,
  predicted_year INTEGER NOT NULL,
  estimated_retreat NUMERIC(10, 4),
  projected_epr NUMERIC(10, 4),
  risk_level VARCHAR(50),
  calculation_method VARCHAR(100),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cache_valid_until TIMESTAMP,
  CONSTRAINT unique_prediction UNIQUE (municipality, base_year, predicted_year)
);

CREATE INDEX IF NOT EXISTS idx_prediction_cache_municipality ON prediction_cache(municipality);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_predicted_year ON prediction_cache(predicted_year);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_updated ON prediction_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_validity ON prediction_cache(cache_valid_until);

-- ============================================================
-- 4. COMPARISON CACHE TABLE
-- Stores pre-computed comparisons between two years
-- ============================================================
CREATE TABLE IF NOT EXISTS shoreline_comparison_cache (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(255) NOT NULL,
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
  CONSTRAINT unique_comparison UNIQUE (municipality, year_start, year_end)
);

CREATE INDEX IF NOT EXISTS idx_comparison_cache_municipality ON shoreline_comparison_cache(municipality);
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
-- Tracks when cache was invalidated and why
-- ============================================================
CREATE TABLE IF NOT EXISTS cache_invalidation_log (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100),
  municipality VARCHAR(255),
  reason VARCHAR(200),
  invalidated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invalidation_log_municipality ON cache_invalidation_log(municipality);
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
  INSERT INTO cache_invalidation_log (table_name, municipality, reason)
  VALUES ('municipality_analysis_cache', NEW.municipality, 'Raw data inserted');
  
  INSERT INTO cache_invalidation_log (table_name, municipality, reason)
  VALUES ('bataan_summary_cache', NEW.municipality, 'Raw data inserted');
  
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
    INSERT INTO cache_invalidation_log (table_name, municipality, reason)
    VALUES ('municipality_analysis_cache', NEW.municipality, 'Raw data updated');
    
    INSERT INTO cache_invalidation_log (table_name, municipality, reason)
    VALUES ('prediction_cache', NEW.municipality, 'Raw data updated');
    
    INSERT INTO cache_invalidation_log (table_name, municipality, reason)
    VALUES ('bataan_summary_cache', NEW.municipality, 'Raw data updated');
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
  INSERT INTO cache_invalidation_log (table_name, municipality, reason)
  VALUES ('municipality_analysis_cache', OLD.municipality, 'Raw data deleted');
  
  INSERT INTO cache_invalidation_log (table_name, municipality, reason)
  VALUES ('bataan_summary_cache', OLD.municipality, 'Raw data deleted');
  
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
-- 10. CACHE VALIDITY VIEW
-- Shows which caches are still valid vs expired
-- ============================================================
DROP VIEW IF EXISTS cache_validity_status;
CREATE VIEW cache_validity_status AS
SELECT 
  'municipality_analysis_cache' as cache_type,
  municipality,
  updated_at,
  cache_valid_until,
  CASE 
    WHEN cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END as status
FROM municipality_analysis_cache
UNION ALL
SELECT 
  'prediction_cache',
  municipality,
  updated_at,
  cache_valid_until,
  CASE 
    WHEN cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END
FROM prediction_cache
UNION ALL
SELECT 
  'shoreline_comparison_cache',
  municipality,
  updated_at,
  cache_valid_until,
  CASE 
    WHEN cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END
FROM shoreline_comparison_cache
UNION ALL
SELECT 
  'bataan_summary_cache',
  CAST(analysis_year AS VARCHAR),
  updated_at,
  cache_valid_until,
  CASE 
    WHEN cache_valid_until IS NULL THEN 'EXPIRED'
    WHEN cache_valid_until > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END
FROM bataan_summary_cache;

-- ============================================================
-- 11. Final Verification Queries
-- Run these to verify everything was created:
-- ============================================================
-- SELECT * FROM cache_validity_status;
-- SELECT * FROM cache_invalidation_log;
-- SELECT tablename FROM pg_tables WHERE tablename LIKE '%cache%' OR tablename = 'shoreline_zones';
-- SELECT * FROM information_schema.tables WHERE table_name LIKE '%cache%' OR table_name = 'shoreline_zones';

-- ============================================================
-- Notes:
-- - PostgreSQL syntax is used (NUMERIC instead of DECIMAL, etc.)
-- - Triggers use PL/pgSQL functions instead of MySQL-style
-- - DROP TRIGGER IF EXISTS used for safety on re-runs
-- - cache_valid_until: timestamp when cache expires
-- - Automatic triggers log invalidation events
-- - Use cache_validity_status view to monitor cache health
-- ============================================================
