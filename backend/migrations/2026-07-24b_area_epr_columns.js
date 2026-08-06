/**
 * Area EPR columns migration — 2026-07-24b
 *
 * Supersedes the same-day shoreline_year_estimates table/migration
 * (2026-07-24_shoreline_year_estimates.js). That table cached one row per
 * (area, base_year, target_year) — the wrong granularity, since the actual
 * expensive computation (a per-area linear regression) doesn't depend on
 * which year pair the user picks. This migration moves to storing each
 * area's regression result directly on coastal_areas, computed once at
 * write time (see recomputeMunicipalityAreaEPR in
 * services/cacheService_FK_Version.js, now wired into
 * invalidateMunicipalityCache) instead of recomputed on every read.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_area_epr_columns_2026-07-24.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");
const { recomputeMunicipalityAreaEPR } = require("../services/cacheService_FK_Version");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE coastal_areas
        ADD COLUMN projected_epr NUMERIC,
        ADD COLUMN epr_confidence NUMERIC,
        ADD COLUMN risk_level TEXT,
        ADD COLUMN epr_calculated_at TIMESTAMP
    `);

    await client.query(`DROP TABLE IF EXISTS shoreline_year_estimates`);

    await client.query("COMMIT");
    console.log("Schema migration committed successfully.");

    // Backfill: populate the new columns for every existing area so nothing
    // shows blank EPR until its next upload. Runs after COMMIT since it's
    // read/write against the now-final schema, via the same function normal
    // uploads will use going forward — not a one-off backfill-only query.
    const municipalities = await pool.query(
      `SELECT DISTINCT municipality_id FROM coastal_areas`
    );
    for (const { municipality_id } of municipalities.rows) {
      await recomputeMunicipalityAreaEPR(municipality_id);
    }
    console.log(`Backfilled EPR for ${municipalities.rows.length} municipalit(y/ies)' areas.`);

    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'coastal_areas'
      ORDER BY ordinal_position
    `);
    console.log("coastal_areas columns:", cols.rows);

    const backfilled = await pool.query(`
      SELECT ca.id, ca.name, m.name AS municipality, ca.projected_epr, ca.epr_confidence, ca.risk_level
      FROM coastal_areas ca
      JOIN municipalities m ON ca.municipality_id = m.id
      ORDER BY ca.id
    `);
    console.log("Backfilled areas:", backfilled.rows);
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
