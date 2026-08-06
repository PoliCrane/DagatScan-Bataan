/**
 * Storage URL columns migration — 2026-08-06
 *
 * Adds nullable storage_url columns so uploaded files (GeoJSON, satellite
 * images, request letters) can be persisted to Supabase Storage in addition
 * to local disk, so they survive redeploys on hosts with ephemeral
 * filesystems. Populated by a background sync (services/storageSync.js),
 * not by the upload routes themselves — existing upload_history/
 * satellite_imagery/account_requests columns and processing logic are
 * untouched.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_storage_columns_2026-08-06.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE upload_history ADD COLUMN storage_url TEXT`);
    await client.query(`ALTER TABLE satellite_imagery ADD COLUMN storage_url TEXT`);
    await client.query(`ALTER TABLE account_requests ADD COLUMN request_letter_url TEXT`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'upload_history' AND column_name = 'storage_url')
         OR (table_name = 'satellite_imagery' AND column_name = 'storage_url')
         OR (table_name = 'account_requests' AND column_name = 'request_letter_url')
      ORDER BY table_name
    `);
    console.log("New columns:", cols.rows);
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
