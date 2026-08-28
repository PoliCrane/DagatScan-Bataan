/**
 * Additional Remarks migration — 2026-07-23
 *
 * Adds an optional free-text field to the account-request form, per a
 * mockup adding an "Additional Remarks (Optional)" textarea. Nullable,
 * no default needed.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_additional_remarks_2026-07-23.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE account_requests ADD COLUMN additional_remarks TEXT`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'account_requests' AND column_name = 'additional_remarks'
    `);
    console.log("account_requests.additional_remarks:", cols.rows);
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
