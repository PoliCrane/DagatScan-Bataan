/**
 * Users last_login migration — 2026-07-25
 *
 * Adds real login-timestamp tracking to power the "Last Active" column in
 * the modernized User Management UI, per the plan at
 * C:\Users\poltd\.claude\plans\the-first-image-is-delightful-kurzweil.md.
 * Nullable — accounts that haven't logged in since this shipped (or ever)
 * show "Never" in the UI rather than a fake value.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_last_login_2026-07-25.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE users ADD COLUMN last_login TIMESTAMP`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'last_login'
    `);
    console.log("users.last_login:", cols.rows);
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
