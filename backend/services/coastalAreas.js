/**
 * Coastal Areas helpers.
 * `coastal_areas` is the entity for a municipality's named coastline
 * segments (e.g. "Bagac Bay"); shoreline_zones/satellite_imagery reference
 * it via area_id. Shared across write paths so area_id resolves consistently.
 */

// Read-only lookup: municipality_id + area name -> coastal_areas.id, or null
// if none exists. Case-insensitive.
async function findAreaId(client, municipalityId, areaName) {
  const name = (areaName || "Main Coastline").trim() || "Main Coastline";
  const result = await client.query(
    `SELECT id FROM coastal_areas WHERE municipality_id = $1 AND LOWER(name) = LOWER($2)`,
    [municipalityId, name]
  );
  return result.rows[0]?.id ?? null;
}

// Resolve a named coastline area to its coastal_areas.id, creating it on
// first sight (falls back to "Main Coastline"). ON CONFLICT DO UPDATE is a
// no-op write that makes RETURNING id work on both insert and existing paths.
async function resolveAreaId(client, municipalityId, areaName) {
  const name = (areaName || "Main Coastline").trim() || "Main Coastline";
  const result = await client.query(
    `INSERT INTO coastal_areas (municipality_id, name)
     VALUES ($1, $2)
     ON CONFLICT (municipality_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [municipalityId, name]
  );
  return result.rows[0].id;
}

module.exports = { findAreaId, resolveAreaId };
