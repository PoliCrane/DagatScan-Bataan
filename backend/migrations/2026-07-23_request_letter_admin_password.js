/**
 * Request-letter upload + admin-set password migration — 2026-07-23
 *
 * The account-request form no longer collects a password from the
 * applicant (a new mockup drops that field entirely) — instead an admin
 * sets the account's initial password at approval time (see server.js's
 * rewritten POST /admin/account-requests/:id/approve). The form instead
 * now collects contact_number/position and an uploaded signed request
 * letter (PDF).
 *
 * 1. Drops account_requests.password_hash (nothing will ever populate it
 *    again — confirmed the table is empty, so this is a pure schema change,
 *    not a data migration).
 * 2. Adds account_requests.contact_number / position / request_letter_filename.
 * 3. Adds users.contact_number / position (nullable) so this info carries
 *    over onto the real account after approval.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_request_letter_admin_password_2026-07-23.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT COUNT(*) FROM account_requests");
    const rowCount = parseInt(existing.rows[0].count, 10);
    if (rowCount > 0) {
      throw new Error(`account_requests has ${rowCount} row(s) — refusing to drop password_hash`);
    }

    await client.query(`ALTER TABLE account_requests DROP COLUMN password_hash`);
    await client.query(`ALTER TABLE account_requests ADD COLUMN contact_number VARCHAR(30) NOT NULL`);
    await client.query(`ALTER TABLE account_requests ADD COLUMN position VARCHAR(150) NOT NULL`);
    await client.query(`ALTER TABLE account_requests ADD COLUMN request_letter_filename VARCHAR(255) NOT NULL`);

    await client.query(`ALTER TABLE users ADD COLUMN contact_number VARCHAR(30)`);
    await client.query(`ALTER TABLE users ADD COLUMN position VARCHAR(150)`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const arCols = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'account_requests'
      ORDER BY ordinal_position
    `);
    console.log("account_requests columns:", arCols.rows);
    const userCols = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('contact_number','position')
    `);
    console.log("users new columns:", userCols.rows);
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
