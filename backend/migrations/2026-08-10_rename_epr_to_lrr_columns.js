/**
 * Rename projected_epr/epr_confidence/epr_calculated_at to LRR — 2026-08-10
 *
 * These columns on coastal_areas were always populated by a least-squares
 * regression across every available year (services/eprCalculator.js's
 * calculateLinearRegressionEPR, now renamed calculateLRR) — that's the
 * textbook definition of Linear Regression Rate, not End Point Rate (which
 * only ever uses two endpoint years, see the separate calculateEPR used for
 * historical year-over-year rates in eprAutoCalculator.js). The column names
 * were mislabeling LRR-derived data as EPR since they were first added.
 * Pure rename — values are unchanged, only correctly labeled now.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_rename_epr_to_lrr_columns_2026-08-10.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE coastal_areas RENAME COLUMN projected_epr TO projected_lrr`);
    await client.query(`ALTER TABLE coastal_areas RENAME COLUMN epr_confidence TO lrr_confidence`);
    await client.query(`ALTER TABLE coastal_areas RENAME COLUMN epr_calculated_at TO lrr_calculated_at`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'coastal_areas' AND column_name IN ('projected_lrr', 'lrr_confidence', 'lrr_calculated_at')
      ORDER BY column_name
    `);
    console.log("Renamed columns:", cols.rows);

    const sample = await pool.query(`
      SELECT id, name, projected_lrr, lrr_confidence, lrr_calculated_at
      FROM coastal_areas
      WHERE projected_lrr IS NOT NULL
      LIMIT 5
    `);
    console.log("Sample rows with values preserved:", sample.rows);
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
