/**
 * Dedupe upload_history — 2026-08-12
 *
 * processSatelliteImageFile (routes/uploadManagement.js) only ever INSERTed
 * into upload_history, even though satellite_imagery already upserts on
 * (area_id, year) — every reprocess of the same area/year (a manual
 * reupload, or re-running the "Generate All Years" batch) left a stale row
 * behind instead of replacing it, so Data Management filled up with rows
 * that looked like duplicates because they were. The insert-site bug is
 * fixed in code as of this same date (the DELETE now happens before each
 * new INSERT); this migration is the matching one-time cleanup for rows
 * already duplicated before that fix landed.
 *
 * For every (area_id, year) with more than one Satellite_Image row, keeps
 * the newest (by created_at, then id) and deletes the rest. Superseded
 * files are only unlinked from disk AFTER the DB transaction commits
 * successfully, and only if not still referenced by satellite_imagery's
 * current image_path for that area/year — so a rollback never leaves a
 * restored row pointing at an already-deleted file.
 * File deletion is NOT covered by the pg_dump backup below — irreversible.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_upload_history_dedup_2026-08-12.sql
 */
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { thumbnailPathFor } = require("../services/thumbnailGenerator");

async function main() {
  const client = await pool.connect();
  const filesToDelete = [];

  try {
    const dupeGroups = await pool.query(`
      SELECT area_id, year
      FROM upload_history
      WHERE upload_type = 'Satellite_Image' AND area_id IS NOT NULL
      GROUP BY area_id, year
      HAVING COUNT(*) > 1
    `);
    console.log(`Found ${dupeGroups.rows.length} duplicated (area_id, year) group(s).`);

    await client.query("BEGIN");

    let deletedRows = 0;

    for (const { area_id, year } of dupeGroups.rows) {
      const rows = await client.query(
        `SELECT id, file_path FROM upload_history
         WHERE area_id = $1 AND year = $2 AND upload_type = 'Satellite_Image'
         ORDER BY created_at DESC, id DESC`,
        [area_id, year]
      );
      const [keep, ...toDelete] = rows.rows;

      const currentImage = await client.query(
        `SELECT image_path FROM satellite_imagery WHERE area_id = $1 AND year = $2`,
        [area_id, year]
      );
      const currentImagePath = currentImage.rows[0]?.image_path || null;

      for (const row of toDelete) {
        await client.query(`DELETE FROM upload_history WHERE id = $1`, [row.id]);
        deletedRows++;
        console.log(`  Deleted upload_history id=${row.id} (area_id=${area_id}, year=${year}), kept id=${keep.id}`);

        if (row.file_path && row.file_path !== currentImagePath) {
          filesToDelete.push(row.file_path);
        }
      }
    }

    await client.query("COMMIT");
    console.log(`Migration committed successfully. Deleted ${deletedRows} row(s).`);

    let deletedFiles = 0;
    for (const filePath of filesToDelete) {
      for (const p of [filePath, thumbnailPathFor(filePath)]) {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          deletedFiles++;
          console.log(`  Deleted file: ${path.basename(p)}`);
        }
      }
    }
    console.log(`Deleted ${deletedFiles} superseded file(s) from disk.`);

    const remaining = await pool.query(`
      SELECT area_id, year, COUNT(*) as cnt
      FROM upload_history
      WHERE upload_type = 'Satellite_Image' AND area_id IS NOT NULL
      GROUP BY area_id, year
      HAVING COUNT(*) > 1
    `);
    console.log("Remaining duplicate groups (should be 0):", remaining.rows.length);
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
