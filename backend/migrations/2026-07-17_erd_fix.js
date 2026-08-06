/**
 * ERD fix migration — 2026-07-17
 *
 * 1. Seeds municipalities with all 12 Bataan municipalities.
 * 2. Creates coastal_areas (first-class entity for named coastline areas,
 *    replacing free-text specific_area matching) and backfills area_id on
 *    shoreline_zones and satellite_imagery.
 * 3. Moves satellite_imagery uniqueness from (municipality, year) to
 *    (area_id, year) — fixes the latent bug where two different areas in
 *    the same municipality+year silently overwrote each other.
 * 4. Connects the floating users table: upload_history.admin_id -> users.id.
 * 5. Drops dead weight: prediction_cache, shoreline_comparison_cache,
 *    cache_invalidation_log (+ its triggers/functions), always-NULL columns
 *    (satellite_imagery.image_url/detected_coastline, municipalities.region/
 *    province, users.fullname).
 *
 * Full pg_dump backup taken beforehand: db_backup_before_erd_fix_2026-07-17.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Seed all 12 Bataan municipalities
    await client.query(`
      INSERT INTO municipalities (name) VALUES
        ('Abucay'),('Bagac'),('Balanga'),('Dinalupihan'),('Hermosa'),('Limay'),
        ('Mariveles'),('Morong'),('Orani'),('Orion'),('Pilar'),('Samal')
      ON CONFLICT (name) DO NOTHING
    `);

    // 2. coastal_areas + backfill
    await client.query(`
      CREATE TABLE coastal_areas (
        id SERIAL PRIMARY KEY,
        municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (municipality_id, name)
      )
    `);
    await client.query(`
      INSERT INTO coastal_areas (municipality_id, name)
      SELECT DISTINCT municipality_id, TRIM(specific_area)
      FROM shoreline_zones WHERE specific_area IS NOT NULL
    `);

    await client.query(`ALTER TABLE shoreline_zones ADD COLUMN area_id INTEGER REFERENCES coastal_areas(id)`);
    await client.query(`
      UPDATE shoreline_zones z SET area_id = a.id
      FROM coastal_areas a
      WHERE a.municipality_id = z.municipality_id AND a.name = TRIM(z.specific_area)
    `);
    await client.query(`CREATE INDEX idx_zones_area_id ON shoreline_zones(area_id)`);

    // Sanity: every zone with a specific_area must have resolved an area_id
    const unresolvedZones = await client.query(
      `SELECT COUNT(*) FROM shoreline_zones WHERE specific_area IS NOT NULL AND area_id IS NULL`
    );
    if (parseInt(unresolvedZones.rows[0].count) > 0) {
      throw new Error(`${unresolvedZones.rows[0].count} shoreline_zones rows failed area_id backfill`);
    }

    // 3. satellite_imagery.area_id + uniqueness move
    await client.query(`ALTER TABLE satellite_imagery ADD COLUMN area_id INTEGER REFERENCES coastal_areas(id)`);
    // Today each municipality has exactly one area, so municipality->area is unambiguous
    await client.query(`
      UPDATE satellite_imagery si SET area_id = a.id
      FROM coastal_areas a
      JOIN municipalities m ON m.id = a.municipality_id
      WHERE m.name = si.municipality
    `);
    const unresolvedImg = await client.query(`SELECT COUNT(*) FROM satellite_imagery WHERE area_id IS NULL`);
    if (parseInt(unresolvedImg.rows[0].count) > 0) {
      throw new Error(`${unresolvedImg.rows[0].count} satellite_imagery rows failed area_id backfill`);
    }
    await client.query(`ALTER TABLE satellite_imagery ALTER COLUMN area_id SET NOT NULL`);
    await client.query(`ALTER TABLE satellite_imagery DROP CONSTRAINT satellite_imagery_municipality_year_key`);
    await client.query(`ALTER TABLE satellite_imagery ADD CONSTRAINT satellite_imagery_area_year_key UNIQUE (area_id, year)`);

    // 4. Connect users: the panelists' fix
    await client.query(`
      ALTER TABLE upload_history
      ADD CONSTRAINT upload_history_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
    `);

    // 5. Drop dead weight.
    // cache_validity_status is a manual-ops view (no code references) that
    // UNIONs all cache tables — recreate it scoped to the two kept caches
    // so it survives the drops and stays usable for debugging.
    await client.query(`DROP VIEW cache_validity_status`);
    await client.query(`
      CREATE VIEW cache_validity_status AS
      SELECT 'municipality_analysis_cache'::text AS cache_type,
             m.name AS municipality, m.id AS municipality_id,
             mac.updated_at, mac.cache_valid_until,
             CASE WHEN mac.cache_valid_until IS NULL THEN 'EXPIRED'
                  WHEN mac.cache_valid_until > now() THEN 'VALID'
                  ELSE 'EXPIRED' END AS status
      FROM municipality_analysis_cache mac
      JOIN municipalities m ON mac.municipality_id = m.id
      UNION ALL
      SELECT 'bataan_summary_cache'::text, 'Bataan (province-wide)', NULL,
             bsc.updated_at, bsc.cache_valid_until,
             CASE WHEN bsc.cache_valid_until IS NULL THEN 'EXPIRED'
                  WHEN bsc.cache_valid_until > now() THEN 'VALID'
                  ELSE 'EXPIRED' END
      FROM bataan_summary_cache bsc
    `);
    await client.query(`DROP TRIGGER tr_shoreline_zones_insert_on_cache ON shoreline_zones`);
    await client.query(`DROP TRIGGER tr_shoreline_zones_update_on_cache ON shoreline_zones`);
    await client.query(`DROP TRIGGER tr_shoreline_zones_delete_on_cache ON shoreline_zones`);
    await client.query(`DROP FUNCTION log_shoreline_insert()`);
    await client.query(`DROP FUNCTION log_shoreline_update()`);
    await client.query(`DROP FUNCTION log_shoreline_delete()`);
    await client.query(`DROP TABLE cache_invalidation_log`);
    await client.query(`DROP TABLE prediction_cache`);
    await client.query(`DROP TABLE shoreline_comparison_cache`);
    await client.query(`ALTER TABLE satellite_imagery DROP COLUMN image_url, DROP COLUMN detected_coastline`);
    await client.query(`ALTER TABLE municipalities DROP COLUMN region, DROP COLUMN province`);
    await client.query(`ALTER TABLE users DROP COLUMN fullname`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    // Post-commit summary
    const areas = await client.query(`SELECT a.id, m.name AS municipality, a.name FROM coastal_areas a JOIN municipalities m ON m.id = a.municipality_id ORDER BY a.id`);
    console.log("coastal_areas:", areas.rows);
    const munis = await client.query(`SELECT COUNT(*) FROM municipalities`);
    console.log("municipalities count:", munis.rows[0].count);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration FAILED and was rolled back:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
