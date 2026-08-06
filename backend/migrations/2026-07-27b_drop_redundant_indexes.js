/**
 * Drop redundant indexes migration — 2026-07-27b
 *
 * Full DB optimization audit finding #1: 5 pairs where a UNIQUE constraint's
 * auto-created index and a separately hand-created plain index cover the
 * exact same single column, in the same order. The plain index adds nothing
 * the unique index doesn't already provide for query planning — it's pure
 * write-maintenance overhead, most notably on municipality_analysis_cache
 * and bataan_summary_cache, which get UPSERTed on every write anywhere in
 * the system under the eager-cache model.
 *
 * Verified via live pg_indexes output before writing this migration —
 * dropping the plain index in each pair, keeping the unique-constraint one:
 *   users.email               idx_users_email               vs users_email_key
 *   users.username             idx_users_username             vs users_username_key
 *   municipalities.name        idx_municipalities_name        vs municipalities_name_key
 *   bataan_summary_cache.analysis_year
 *                               idx_bataan_cache_year          vs bataan_summary_cache_analysis_year_key
 *   municipality_analysis_cache.municipality_id
 *                               idx_analysis_cache_municipality_id
 *                                                               vs municipality_analysis_cache_municipality_id_key
 *
 * Purely subtractive — no query-plan risk, since the unique index fully
 * subsumes lookup capability on that single column.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_drop_redundant_indexes_2026-07-27.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DROP INDEX idx_users_email`);
    await client.query(`DROP INDEX idx_users_username`);
    await client.query(`DROP INDEX idx_municipalities_name`);
    await client.query(`DROP INDEX idx_bataan_cache_year`);
    await client.query(`DROP INDEX idx_analysis_cache_municipality_id`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const remaining = await pool.query(`
      SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND (
          tablename IN ('users', 'municipalities', 'bataan_summary_cache', 'municipality_analysis_cache')
        )
      ORDER BY tablename, indexname
    `);
    console.log("Remaining indexes on affected tables:", remaining.rows);
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
