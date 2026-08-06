/**
 * Audit log table — 2026-08-05
 *
 * Backs the new superadmin-only Audit Trail page: one row per admin action
 * (role changes, user create/edit/deactivate/reactivate, account request
 * approve/reject, upload create/toggle/delete, bulk shoreline-zone delete).
 * actor_username/actor_role are denormalized from the JWT at write time so
 * the log stays readable even if the acting user is later renamed/deleted
 * (actor_id is nullable via ON DELETE SET NULL for that reason).
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_audit_log_table_2026-08-05.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        actor_username TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'normal',
        target_type TEXT,
        target_id TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC)`);
    await client.query(`CREATE INDEX idx_audit_log_category ON audit_log (category)`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'audit_log'
      ORDER BY ordinal_position
    `);
    console.log("audit_log columns:", cols.rows);

    const indexes = await pool.query(`
      SELECT indexname FROM pg_indexes WHERE tablename = 'audit_log'
    `);
    console.log("audit_log indexes:", indexes.rows);
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
