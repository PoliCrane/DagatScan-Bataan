/**
 * Municipal role + account requests migration — 2026-07-21
 *
 * 1. Adds users.municipality_id (FK -> municipalities.id, nullable — only
 *    meaningful for the new 'municipal' role).
 * 2. Adds a CHECK constraint on users.roles (was unconstrained free text).
 * 3. Creates account_requests — pending municipal-account requests, kept
 *    separate from real users rows until an admin approves one.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_role_redesign_2026-07-21.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE users ADD COLUMN municipality_id INTEGER REFERENCES municipalities(id)`);

    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_roles_check
      CHECK (roles IN ('user', 'municipal', 'admin', 'superadmin'))
    `);

    await client.query(`
      CREATE TABLE account_requests (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        password_hash TEXT NOT NULL,
        municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        rejection_reason TEXT
      )
    `);
    await client.query(`CREATE INDEX idx_account_requests_status ON account_requests(status)`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'municipality_id'
    `);
    console.log("users.municipality_id:", cols.rows);
    const tables = await client.query(`SELECT to_regclass('public.account_requests') AS exists`);
    console.log("account_requests table:", tables.rows);
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
