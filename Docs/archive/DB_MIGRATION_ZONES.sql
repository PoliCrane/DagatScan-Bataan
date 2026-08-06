-- Migration: Fresh Zones Architecture (Upload-Only System)
-- This creates the new shoreline_zones table and removes dependency on aggregate shoreline_data

-- STEP 1: Drop the old shoreline_data table (contains only sample data)
-- Uncomment the line below if you want to remove the aggregate data table
-- DROP TABLE IF EXISTS shoreline_data;

-- STEP 2: Create shoreline_zones table for storing zone-level data with GeoJSON geometries
-- This is a new table for storing specific affected areas from uploaded GeoJSON files

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

-- Create indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_zones_municipality ON shoreline_zones(municipality);
CREATE INDEX IF NOT EXISTS idx_zones_year ON shoreline_zones(year);
CREATE INDEX IF NOT EXISTS idx_zones_specific_area ON shoreline_zones(specific_area);
CREATE INDEX IF NOT EXISTS idx_zones_municipality_year ON shoreline_zones(municipality, year);

-- Create a view for backward compatibility that combines both tables
-- This allows existing queries to still work if needed
CREATE OR REPLACE VIEW all_shoreline_data AS
SELECT 
  id,
  municipality,
  year,
  erosion_rate,
  cumulative_erosion,
  data_quality,
  source_type,
  'zone' as data_type,
  specific_area,
  geojson_data,
  created_at,
  updated_at
FROM shoreline_zones
UNION ALL
SELECT 
  id,
  municipality,
  year,
  erosion_rate,
  cumulative_erosion,
  data_quality,
  source_type,
  'aggregate' as data_type,
  NULL as specific_area,
  geojson_data,
  created_at,
  updated_at
FROM shoreline_data
WHERE NOT EXISTS (
  SELECT 1 FROM shoreline_zones 
  WHERE shoreline_zones.municipality = shoreline_data.municipality 
  AND shoreline_zones.year = shoreline_data.year
);
