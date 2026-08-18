-- Canonical base schema for DagatScan-Bataan, derived from the queries in
-- backend/routes and backend/services. Creates the core tables; the dated
-- scripts in backend/migrations create/extend the auxiliary tables
-- (audit_log, ndwi_batch_jobs, validation_runs) and later columns.
-- Usage: psql -d <database> -f schema.sql

CREATE TABLE IF NOT EXISTS municipalities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT 'municipal',
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  municipality_id INTEGER REFERENCES municipalities(id),
  contact_number VARCHAR(30),
  position VARCHAR(150),
  password_reset_code TEXT,
  password_reset_expiry TIMESTAMPTZ,
  reset_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coastal_areas (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
  name TEXT NOT NULL,
  projected_lrr NUMERIC,
  lrr_confidence NUMERIC,
  risk_level TEXT,
  lrr_calculated_at TIMESTAMPTZ,
  lrr_ci95 NUMERIC,
  lrr_p_value NUMERIC,
  lrr_outliers_removed INTEGER,
  UNIQUE (municipality_id, name)
);

CREATE TABLE IF NOT EXISTS shoreline_zones (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES coastal_areas(id),
  year INTEGER NOT NULL,
  erosion_rate NUMERIC,
  cumulative_erosion NUMERIC,
  data_quality TEXT,
  source_type TEXT,
  geojson_data JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upload_history (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  upload_type TEXT,
  municipality_id INTEGER REFERENCES municipalities(id),
  area_id INTEGER REFERENCES coastal_areas(id) ON DELETE SET NULL,
  year INTEGER,
  file_name TEXT,
  file_path TEXT,
  file_size BIGINT,
  process_status TEXT,
  error_message TEXT,
  records_added INTEGER,
  processed_records INTEGER,
  analysis_status TEXT,
  storage_url TEXT,
  thumbnail_storage_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS satellite_imagery (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES coastal_areas(id),
  year INTEGER NOT NULL,
  image_path TEXT,
  capture_date DATE,
  resolution TEXT,
  source TEXT,
  bounds JSONB,
  storage_url TEXT,
  analysis_status TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE (area_id, year)
);

CREATE TABLE IF NOT EXISTS account_requests (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
  contact_number VARCHAR(30) NOT NULL,
  position VARCHAR(150) NOT NULL,
  request_letter_filename VARCHAR(255) NOT NULL,
  request_letter_url TEXT,
  additional_remarks TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS municipality_analysis_cache (
  municipality_id INTEGER PRIMARY KEY REFERENCES municipalities(id),
  analysis_year INTEGER,
  coastline_length NUMERIC,
  affected_area NUMERIC,
  avg_erosion_rate NUMERIC,
  cumulative_erosion NUMERIC,
  zone_count INTEGER,
  risk_level TEXT,
  data_quality TEXT,
  data_sources TEXT,
  risk_distribution JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoreline_zones_area_year ON shoreline_zones (area_id, year);
CREATE INDEX IF NOT EXISTS idx_upload_history_municipality ON upload_history (municipality_id, year);
CREATE INDEX IF NOT EXISTS idx_coastal_areas_municipality ON coastal_areas (municipality_id);
