/**
 * Eager cache refactor migration — 2026-07-26
 *
 * Moves municipality_analysis_cache and bataan_summary_cache from a lazy
 * TTL-expire-then-recompute-on-read model to the same eager write-time
 * recompute model coastal_areas' EPR/risk fields already used — every write
 * path now calls services/cacheService_FK_Version.js's
 * refreshMunicipalityDerived()/invalidateAllCaches(), which recompute and
 * store these rows synchronously, so cache_valid_until no longer has any
 * meaning (every row is fresh by construction).
 *
 * Also extends municipality_analysis_cache with the same five risk-tier
 * count columns bataan_summary_cache already has, so the per-municipality
 * "/summary" endpoint can read them directly instead of running its own
 * separate raw-SQL risk-tier aggregation on every request (previously a
 * near-duplicate of the query bataan_summary_cache's own computation ran).
 *
 * Drops bataan_summary_cache.total_affected_area and .calculated_at —
 * verified via a repo-wide grep that nothing reads or writes either column.
 *
 * Requires services/cacheService_FK_Version.js and routes/shorelineData.js
 * to already be deployed with the eager-refactored code (this migration
 * imports and calls the new functions for backfill, same convention as
 * 2026-07-24b_area_epr_columns.js).
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_eager_cache_refactor_2026-07-26.sql
 * Runs schema changes in a single transaction — any failed step rolls
 * everything back. Backfill runs after COMMIT since it's read/write against
 * the now-final schema, via the same functions normal uploads use going
 * forward — not a one-off backfill-only query.
 */
const pool = require("../db");
const {
  recomputeMunicipalityAreaEPR,
  computeAndStoreMunicipalityAnalysis,
  computeAndStoreBataanSummary,
} = require("../services/cacheService_FK_Version");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // cache_validity_status is a manual-ops debugging view (no code
    // references — see 2026-07-17_erd_fix.js) that unions cache_valid_until
    // from both tables being altered below. That concept no longer exists
    // under the eager model (every row is fresh by construction), so drop
    // it rather than recreate it around a column that's going away.
    await client.query(`DROP VIEW IF EXISTS cache_validity_status`);

    await client.query(`
      ALTER TABLE municipality_analysis_cache
        ADD COLUMN very_high_risk_zones INTEGER,
        ADD COLUMN high_risk_zones INTEGER,
        ADD COLUMN moderate_risk_zones INTEGER,
        ADD COLUMN low_risk_zones INTEGER,
        ADD COLUMN very_low_risk_zones INTEGER,
        DROP COLUMN cache_valid_until
    `);

    await client.query(`
      ALTER TABLE bataan_summary_cache
        DROP COLUMN cache_valid_until,
        DROP COLUMN total_affected_area,
        DROP COLUMN calculated_at
    `);

    await client.query("COMMIT");
    console.log("Schema migration committed successfully.");

    // Backfill: refresh every municipality's derived values (coastal_areas
    // EPR/risk, now satellite-scoped consistently, + the new risk-tier
    // columns on municipality_analysis_cache), then the province-wide
    // summary once.
    const { rows: municipalities } = await pool.query(`SELECT id, name FROM municipalities`);
    for (const { id, name } of municipalities) {
      await recomputeMunicipalityAreaEPR(id);
      await computeAndStoreMunicipalityAnalysis(id);
      console.log(`  refreshed ${name}`);
    }
    await computeAndStoreBataanSummary();
    console.log(`Backfilled derived caches for ${municipalities.length} municipalit(y/ies).`);

    const analysisCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'municipality_analysis_cache'
      ORDER BY ordinal_position
    `);
    console.log("municipality_analysis_cache columns:", analysisCols.rows);

    const bataanCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'bataan_summary_cache'
      ORDER BY ordinal_position
    `);
    console.log("bataan_summary_cache columns:", bataanCols.rows);

    const analysisSample = await pool.query(`
      SELECT mac.municipality_id, m.name, mac.risk_level, mac.avg_erosion_rate,
             mac.very_high_risk_zones, mac.high_risk_zones, mac.moderate_risk_zones,
             mac.low_risk_zones, mac.very_low_risk_zones
      FROM municipality_analysis_cache mac
      JOIN municipalities m ON mac.municipality_id = m.id
      ORDER BY mac.municipality_id
    `);
    console.log("municipality_analysis_cache post-backfill:", analysisSample.rows);

    const bataanSample = await pool.query(`SELECT * FROM bataan_summary_cache`);
    console.log("bataan_summary_cache post-backfill:", bataanSample.rows);
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
