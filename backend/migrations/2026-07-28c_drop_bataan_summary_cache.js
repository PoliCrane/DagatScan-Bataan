/**
 * Drop bataan_summary_cache + its municipality bridge table — 2026-07-28c
 *
 * bataan_summary_cache_municipalities was the only relational link between
 * bataan_summary_cache and municipalities. Rather than drop just the bridge
 * table and leave bataan_summary_cache floating again (the exact problem
 * the 2026-07-18 bridge-table migration was created to fix), this drops
 * bataan_summary_cache entirely too — the Bataan-wide summary is now
 * computed live by aggregating municipality_analysis_cache (see
 * cacheService_FK_Version.js's rewritten getBataanSummary()), which already
 * has a real FK to municipalities and is always fresh under the eager-cache
 * model. Current data (1 bataan_summary_cache row, 2 bridge rows) is fully
 * re-derivable from municipality_analysis_cache — nothing meaningful lost.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_drop_bataan_summary_cache_2026-07-28.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DROP TABLE bataan_summary_cache_municipalities`);
    await client.query(`DROP TABLE bataan_summary_cache`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const remaining = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('bataan_summary_cache', 'bataan_summary_cache_municipalities')
    `);
    console.log("Remaining (should be empty):", remaining.rows);
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
