const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS validation_runs (
        id SERIAL PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scope TEXT NOT NULL,
        holdout_years INTEGER NOT NULL,
        summary JSONB NOT NULL,
        details JSONB NOT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_validation_runs_scope_run_at
      ON validation_runs (scope, run_at DESC)
    `);

    await client.query("COMMIT");
    console.log("validation_runs table created.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
