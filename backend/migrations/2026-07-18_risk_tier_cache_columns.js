/**
 * bataan_summary_cache risk-tier column migration — 2026-07-18
 *
 * Follow-up to the MGB-scheme risk classification consolidation (Work Item 1
 * of the DB/ERD health-check plan): the risk scheme moved from 4 tiers
 * (HIGH/MODERATE/LOW/STABLE) to 5 (VERY_HIGH/HIGH/MODERATE/LOW/VERY_LOW).
 *
 * bataan_summary_cache is a pure cache table — fully recomputed by
 * cacheOrFetchBataanSummary() on every cache-miss/expiry, so this is a
 * simple additive+drop with no backfill needed, unlike the ERD-fix
 * migrations that touched real source-of-truth tables.
 *
 * Full pg_dump backup taken beforehand: db_backup_before_risk_tier_cache_2026-07-18.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE bataan_summary_cache ADD COLUMN very_high_risk_zones INTEGER`);
    await client.query(`ALTER TABLE bataan_summary_cache ADD COLUMN very_low_risk_zones INTEGER`);
    await client.query(`ALTER TABLE bataan_summary_cache DROP COLUMN stable_risk_zones`);

    // Force every cached row to recompute on next request with the new
    // 5-tier bucketing, rather than serving stale 4-tier counts until the
    // existing cache_valid_until naturally expires.
    await client.query(`UPDATE bataan_summary_cache SET cache_valid_until = NOW()`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'bataan_summary_cache' ORDER BY ordinal_position`
    );
    console.log("bataan_summary_cache columns:", cols.rows.map((r) => r.column_name).join(", "));
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
