const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // municipality_id is nullable — NULL means a province-wide ("all") run —
    // and references municipalities(id) so this table stays a real part of the
    // schema instead of holding a free-text copy of a municipality name with
    // no relational tie to anything else.
    await client.query(`
      CREATE TABLE IF NOT EXISTS validation_runs (
        id SERIAL PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        municipality_id INTEGER REFERENCES municipalities(id),
        holdout_years INTEGER NOT NULL,
        summary JSONB NOT NULL,
        details JSONB NOT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_validation_runs_municipality_run_at
      ON validation_runs (municipality_id, run_at DESC)
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
