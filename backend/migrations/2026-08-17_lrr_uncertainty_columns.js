const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`ALTER TABLE coastal_areas ADD COLUMN IF NOT EXISTS lrr_ci95 NUMERIC`);
    await client.query(`ALTER TABLE coastal_areas ADD COLUMN IF NOT EXISTS lrr_p_value NUMERIC`);
    await client.query(`ALTER TABLE coastal_areas ADD COLUMN IF NOT EXISTS lrr_outliers_removed INTEGER`);
    await client.query("COMMIT");
    console.log("coastal_areas uncertainty columns added.");
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
