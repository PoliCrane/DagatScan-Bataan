/**
 * Consolidate risk-tier columns into JSONB — 2026-07-28
 *
 * municipality_analysis_cache and bataan_summary_cache each stored their
 * risk-tier zone counts as 5 separate integer columns (very_high_risk_zones,
 * high_risk_zones, moderate_risk_zones, low_risk_zones, very_low_risk_zones)
 * — a fixed, closed set of exactly 5 tiers baked into
 * services/riskClassification.js's classifyErosionRisk, never a growing
 * dimension, so normalizing into a child table would be overkill. Replaced
 * with a single risk_distribution jsonb column on each table instead —
 * {"very_high": n, "high": n, "moderate": n, "low": n, "very_low": n}.
 *
 * Verified beforehand that only services/cacheService_FK_Version.js touches
 * these column names at runtime — every function there already converts
 * them into an identical external riskDistribution shape before returning
 * to any caller, so this consolidation is fully contained to that one file;
 * no route or frontend change needed.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_risk_distribution_jsonb_2026-07-28.sql
 * Runs schema changes in a single transaction — any failed step rolls
 * everything back. Backfill runs inside the same transaction (pure SQL,
 * not dependent on app code), so DROP COLUMN only proceeds once every row
 * has its risk_distribution populated from the columns being dropped.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE municipality_analysis_cache ADD COLUMN risk_distribution jsonb`);
    await client.query(`ALTER TABLE bataan_summary_cache ADD COLUMN risk_distribution jsonb`);

    await client.query(`
      UPDATE municipality_analysis_cache
      SET risk_distribution = jsonb_build_object(
        'very_high', very_high_risk_zones,
        'high', high_risk_zones,
        'moderate', moderate_risk_zones,
        'low', low_risk_zones,
        'very_low', very_low_risk_zones
      )
    `);
    await client.query(`
      UPDATE bataan_summary_cache
      SET risk_distribution = jsonb_build_object(
        'very_high', very_high_risk_zones,
        'high', high_risk_zones,
        'moderate', moderate_risk_zones,
        'low', low_risk_zones,
        'very_low', very_low_risk_zones
      )
    `);

    await client.query(`
      ALTER TABLE municipality_analysis_cache
        DROP COLUMN very_high_risk_zones,
        DROP COLUMN high_risk_zones,
        DROP COLUMN moderate_risk_zones,
        DROP COLUMN low_risk_zones,
        DROP COLUMN very_low_risk_zones
    `);
    await client.query(`
      ALTER TABLE bataan_summary_cache
        DROP COLUMN very_high_risk_zones,
        DROP COLUMN high_risk_zones,
        DROP COLUMN moderate_risk_zones,
        DROP COLUMN low_risk_zones,
        DROP COLUMN very_low_risk_zones
    `);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const macRows = await pool.query(
      `SELECT municipality_id, analysis_year, risk_distribution FROM municipality_analysis_cache ORDER BY municipality_id`
    );
    console.log("municipality_analysis_cache post-migration:", macRows.rows);

    const bscRows = await pool.query(
      `SELECT analysis_year, risk_distribution FROM bataan_summary_cache ORDER BY analysis_year`
    );
    console.log("bataan_summary_cache post-migration:", bscRows.rows);

    const cols = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('municipality_analysis_cache', 'bataan_summary_cache')
        AND column_name LIKE '%risk%'
      ORDER BY table_name, column_name
    `);
    console.log("Remaining risk-related columns:", cols.rows);
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
