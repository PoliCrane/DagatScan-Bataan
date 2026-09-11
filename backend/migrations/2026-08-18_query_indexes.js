const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_zones_satellite_active
      ON shoreline_zones (area_id, year)
      WHERE source_type LIKE 'Satellite Analysis%' AND active
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
      ON audit_log (created_at DESC)
    `);
    // A 2026-07-21 migration already created this index name as single-column (status) —
    // CREATE INDEX IF NOT EXISTS only checks the name, so it would silently skip instead
    // of upgrading to the composite definition the status-listing query needs.
    await client.query(`DROP INDEX IF EXISTS idx_account_requests_status`);
    await client.query(`
      CREATE INDEX idx_account_requests_status
      ON account_requests (status, requested_at DESC)
    `);
    await client.query("COMMIT");
    console.log("Query indexes created.");
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
