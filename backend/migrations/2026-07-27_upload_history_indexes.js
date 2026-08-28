/**
 * upload_history hot-path index migration — 2026-07-27
 *
 * Performance audit finding: the Data Management page's upload list query
 * (GET /api/admin/uploads, routes/uploadManagement.js's `GET /` handler,
 * fetched with limit=1000 on every page load) does
 *   LEFT JOIN coastal_areas ca ON uh.area_id = ca.id
 *   LEFT JOIN users u ON uh.admin_id = u.id
 * with no supporting index on the upload_history side of either join.
 * Every other FK/filter column already has index coverage (see
 * idx_upload_history_municipality_id/status/year from earlier migrations) —
 * these two were the confirmed gap, verified by grepping actual JOIN/WHERE
 * usage rather than adding indexes speculatively.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_upload_history_indexes_2026-07-27.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE INDEX idx_upload_history_admin_id ON upload_history(admin_id)
    `);
    await client.query(`
      CREATE INDEX idx_upload_history_area_id ON upload_history(area_id)
    `);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const indexes = await pool.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'upload_history' AND schemaname = 'public'
      ORDER BY indexname
    `);
    console.log("upload_history indexes:", indexes.rows);
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
