/**
 * Shoreline year estimates migration — 2026-07-24
 *
 * Adds shoreline_year_estimates, a database-backed cache for the EPR-based
 * offset estimate used by both the Predict/Simulate and Compare features on
 * the Erosion Analysis page. Previously this was computed entirely
 * client-side on every click, with nothing persisted — see the plan at
 * C:\Users\poltd\.claude\plans\the-first-image-is-delightful-kurzweil.md.
 *
 * One row per (coastal area, base year, target year). target_year can be
 * after base_year (a future prediction) or before it (Compare's
 * real-data-missing fallback) — same regression-derived formula either way.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_shoreline_estimates_2026-07-24.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE shoreline_year_estimates (
        id SERIAL PRIMARY KEY,
        area_id INTEGER NOT NULL REFERENCES coastal_areas(id) ON DELETE CASCADE,
        base_year INTEGER NOT NULL,
        target_year INTEGER NOT NULL,
        projected_epr NUMERIC NOT NULL,
        epr_confidence NUMERIC,
        estimated_retreat NUMERIC NOT NULL,
        risk_level TEXT NOT NULL,
        calculated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (area_id, base_year, target_year)
      )
    `);

    await client.query(`
      CREATE INDEX idx_shoreline_year_estimates_area ON shoreline_year_estimates(area_id)
    `);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'shoreline_year_estimates'
      ORDER BY ordinal_position
    `);
    console.log("shoreline_year_estimates columns:", cols.rows);

    const constraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'shoreline_year_estimates'::regclass
    `);
    console.log("shoreline_year_estimates constraints:", constraints.rows);
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
