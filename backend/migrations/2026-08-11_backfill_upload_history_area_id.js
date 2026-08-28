/**
 * Backfill upload_history.area_id — 2026-08-11
 *
 * processSatelliteImageFile (routes/uploadManagement.js) computes areaId
 * and uses it throughout the function, but its upload_history INSERTs never
 * included the column — every row inserted since the last one-time backfill
 * (2026-07-26b_data_management.js) has area_id = NULL, which silently
 * breaks Deactivate/View in Data Management (GET /api/admin/uploads derives
 * can_deactivate and has_bounds from area_id). The insert bug itself is
 * fixed in code as of this same date; this migration is the matching
 * one-time data fix for rows already written before that fix landed.
 *
 * Same approach as the original backfill: match on file_path/image_path,
 * which satellite_imagery.image_path and upload_history.file_path both
 * store as the same on-disk path for a given upload.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_area_id_backfill_2026-08-11.sql
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(`
      UPDATE upload_history uh
      SET area_id = si.area_id
      FROM satellite_imagery si
      WHERE si.image_path = uh.file_path
        AND uh.area_id IS NULL
    `);

    await client.query("COMMIT");
    console.log(`Migration committed successfully. Backfilled ${result.rowCount} row(s).`);

    const remaining = await pool.query(`
      SELECT COUNT(*) FROM upload_history WHERE area_id IS NULL AND upload_type = 'Satellite_Image'
    `);
    console.log("Remaining Satellite_Image rows with NULL area_id (expected: rows with no matching satellite_imagery, e.g. failed/invalid uploads):", remaining.rows[0].count);

    const sample = await pool.query(`
      SELECT id, file_name, area_id, year, process_status
      FROM upload_history
      WHERE file_name LIKE 'NDWI_Morong_Bay%'
      ORDER BY id
    `);
    console.log("Sample backfilled rows (Morong Bay):", sample.rows);
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
