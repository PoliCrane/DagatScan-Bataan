/**
 * NDWI batch job tracking table — 2026-08-10
 *
 * Backs the new "Generate All Years" NDWI feature: one row per batch run,
 * tracking orchestration progress across however many years it processes
 * (2015 through the current year). The actual erosion data for each
 * successful year still lands in the existing upload_history/
 * satellite_imagery/shoreline_zones tables via the same processing path
 * every manual upload already uses — this table only tracks the batch's
 * own status, not shoreline data itself.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_ndwi_batch_jobs_2026-08-10.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE ndwi_batch_jobs (
        id SERIAL PRIMARY KEY,
        municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
        area_id INTEGER REFERENCES coastal_areas(id) ON DELETE SET NULL,
        bounds JSONB NOT NULL,
        specific_area TEXT NOT NULL,
        requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total_years INTEGER NOT NULL,
        completed_years JSONB NOT NULL DEFAULT '[]',
        failed_years JSONB NOT NULL DEFAULT '[]',
        current_year INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )
    `);

    await client.query(`CREATE INDEX idx_ndwi_batch_jobs_status ON ndwi_batch_jobs (status)`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ndwi_batch_jobs'
      ORDER BY ordinal_position
    `);
    console.log("ndwi_batch_jobs columns:", cols.rows);
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
