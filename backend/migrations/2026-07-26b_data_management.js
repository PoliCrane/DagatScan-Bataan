/**
 * Data Management page schema migration — 2026-07-26b
 *
 * Adds the schema needed by the new Data Management admin page, where
 * superadmins can deactivate or delete an uploaded dataset.
 *
 * Deactivation has to be analytically real, not just a display flag: every
 * erosion number in the system is computed from shoreline_zones (see
 * services/cacheService_FK_Version.js's SATELLITE_SOURCE_FILTER and
 * routes/uploadManagement.js's recomputeAreaTimeSeries), never from
 * upload_history. So the flag lives on BOTH tables — upload_history.active
 * is what the page toggles, shoreline_zones.active is what the analysis
 * queries filter on, and the toggle endpoint cascades one to the other.
 *
 * upload_history.area_id is a linkage column, not a display column: to know
 * which shoreline_zones row an upload produced we need (area_id, year), and
 * upload_history only stored municipality_id + year — ambiguous, since one
 * municipality can have several coastal areas (Bagac has both "Bagac Bay"
 * and "Bagac Test Area"). The value is already in scope at the insert site
 * in processSatelliteImageFile, so new rows populate it directly; existing
 * rows are backfilled below by matching satellite_imagery.image_path.
 *
 * Backfill note: satellite_imagery is ON CONFLICT (area_id, year) DO UPDATE,
 * so re-uploading an area/year overwrites the previous row while
 * upload_history keeps appending. Superseded upload rows therefore have no
 * matching image_path and are expected to keep area_id = NULL — their data
 * no longer exists anywhere, so they are deliberately not deactivatable.
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_data_management_2026-07-26.sql
 * Runs schema changes in a single transaction — any failed step rolls
 * everything back. Backfill runs after COMMIT against the final schema.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE upload_history
        ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN deactivated_at TIMESTAMP,
        ADD COLUMN deactivated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN area_id INTEGER REFERENCES coastal_areas(id) ON DELETE SET NULL
    `);

    await client.query(`
      ALTER TABLE shoreline_zones
        ADD COLUMN active BOOLEAN NOT NULL DEFAULT true
    `);

    // Partial index — the analysis queries only ever look for active rows.
    await client.query(`
      CREATE INDEX idx_shoreline_zones_active ON shoreline_zones(active) WHERE active
    `);

    await client.query("COMMIT");
    console.log("Schema migration committed successfully.");

    // Backfill area_id from the satellite_imagery row written by the same
    // upload (both received the identical file path — image_path vs file_path
    // — in processSatelliteImageFile).
    const backfill = await pool.query(`
      UPDATE upload_history uh
      SET area_id = si.area_id
      FROM satellite_imagery si
      WHERE si.image_path = uh.file_path
        AND uh.area_id IS NULL
    `);
    console.log(`Backfilled area_id on ${backfill.rowCount} upload_history row(s).`);

    const unmatched = await pool.query(`
      SELECT COUNT(*)::int AS count FROM upload_history WHERE area_id IS NULL
    `);
    console.log(
      `${unmatched.rows[0].count} row(s) left with area_id = NULL ` +
      `(superseded re-uploads — expected, these are not deactivatable).`
    );

    const uploadCols = await pool.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'upload_history'
      ORDER BY ordinal_position
    `);
    console.log("upload_history columns:", uploadCols.rows);

    const zoneCols = await pool.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'shoreline_zones'
      ORDER BY ordinal_position
    `);
    console.log("shoreline_zones columns:", zoneCols.rows);

    const sample = await pool.query(`
      SELECT uh.id, m.name AS municipality, uh.year, uh.area_id, ca.name AS area, uh.active
      FROM upload_history uh
      JOIN municipalities m ON uh.municipality_id = m.id
      LEFT JOIN coastal_areas ca ON uh.area_id = ca.id
      ORDER BY uh.id
    `);
    console.log("upload_history post-backfill:", sample.rows);
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
