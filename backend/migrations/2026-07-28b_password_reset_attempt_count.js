/**
 * Password-reset attempt-count column — 2026-07-28b
 *
 * Adds users.reset_attempt_count so /reset-password can lock out further
 * guesses against a given code after 5 wrong tries (APP-4 security fix),
 * instead of relying solely on the shared IP-based passwordResetLimiter.
 * Defaults to 0 for all existing rows; reset to 0 whenever a fresh code is
 * issued (see /forgot-password) or a reset succeeds.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_password_reset_attempt_count_2026-07-28.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE users ADD COLUMN reset_attempt_count integer NOT NULL DEFAULT 0
    `);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'reset_attempt_count'
    `);
    console.log("New column:", cols.rows);
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
