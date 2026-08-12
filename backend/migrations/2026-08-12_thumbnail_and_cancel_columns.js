/**
 * Add upload_history.thumbnail_storage_url and ndwi_batch_jobs.cancel_requested — 2026-08-12
 *
 * thumbnail_storage_url: durable Supabase Storage URL for a row's preview
 * thumbnail, mirroring the existing upload_history.storage_url pattern for
 * the source file. Needed because Render's local disk is ephemeral — the
 * source .tif was already synced by storageSync.js, but the generated
 * thumbnail PNG was not, so the Data Management "View" button broke on
 * every redeploy. Populated by storageSync.js's new 4th sync step.
 *
 * cancel_requested: lets an admin stop an in-progress "Generate All Years"
 * batch — ndwiBatchWorker.js's loop checks this before starting each year.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_thumbnail_cancel_columns_2026-08-12.sql
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE upload_history ADD COLUMN IF NOT EXISTS thumbnail_storage_url TEXT`);
    await client.query(`ALTER TABLE ndwi_batch_jobs ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await pool.query(`
      SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns
      WHERE (table_name = 'upload_history' AND column_name = 'thumbnail_storage_url')
         OR (table_name = 'ndwi_batch_jobs' AND column_name = 'cancel_requested')
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
