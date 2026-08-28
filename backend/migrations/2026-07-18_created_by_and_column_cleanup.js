/**
 * created_by tracking + column cleanup migration — 2026-07-18
 *
 * Follow-up to 2026-07-17_erd_fix.js, which introduced coastal_areas/area_id
 * but left the old free-text columns in place and didn't connect users to
 * the actual content tables (only to the upload_history audit log).
 *
 * 1. Adds created_by (-> users.id) to shoreline_zones and satellite_imagery,
 *    so individual records — not just audit-log rows — are traceable to the
 *    admin who created them.
 * 2. Sanity-checks that area_id is a fully reliable replacement for the
 *    columns being dropped (every application read path was already
 *    rewritten to use area_id before this migration was written).
 * 3. Promotes shoreline_zones.area_id to NOT NULL (it becomes the sole
 *    location reference once specific_area/municipality_id are gone).
 * 4. Drops the now-redundant shoreline_zones.specific_area,
 *    shoreline_zones.municipality_id, satellite_imagery.municipality, and
 *    the write-only shoreline_geometries table (populated on every upload,
 *    never read by any query in the codebase).
 *
 * Full pg_dump backup taken beforehand: db_backup_before_created_by_cleanup_2026-07-18.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. created_by columns (additive, nullable — historical rows and
    // unauthenticated write routes leave this NULL, which is expected)
    await client.query(`ALTER TABLE shoreline_zones ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE satellite_imagery ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);

    // 2. Sanity checks — re-verify at run time (not trusting any prior
    // read-only check) that area_id is safe to promote to the sole location
    // reference before dropping anything that currently backs it up.
    const nullAreaId = await client.query(
      `SELECT COUNT(*) FROM shoreline_zones WHERE area_id IS NULL`
    );
    if (parseInt(nullAreaId.rows[0].count) > 0) {
      throw new Error(`${nullAreaId.rows[0].count} shoreline_zones rows have NULL area_id`);
    }

    const municipalityMismatch = await client.query(
      `SELECT COUNT(*) FROM shoreline_zones sz
       JOIN coastal_areas ca ON sz.area_id = ca.id
       WHERE sz.municipality_id <> ca.municipality_id`
    );
    if (parseInt(municipalityMismatch.rows[0].count) > 0) {
      throw new Error(`${municipalityMismatch.rows[0].count} shoreline_zones rows disagree with coastal_areas on municipality_id`);
    }

    const specificAreaMismatch = await client.query(
      `SELECT COUNT(*) FROM shoreline_zones sz
       JOIN coastal_areas ca ON sz.area_id = ca.id
       WHERE sz.specific_area IS DISTINCT FROM ca.name`
    );
    if (parseInt(specificAreaMismatch.rows[0].count) > 0) {
      throw new Error(`${specificAreaMismatch.rows[0].count} shoreline_zones rows disagree with coastal_areas on name`);
    }

    const satelliteMismatch = await client.query(
      `SELECT COUNT(*) FROM satellite_imagery si
       JOIN coastal_areas ca ON si.area_id = ca.id
       JOIN municipalities m ON ca.municipality_id = m.id
       WHERE LOWER(si.municipality) <> LOWER(m.name)`
    );
    if (parseInt(satelliteMismatch.rows[0].count) > 0) {
      throw new Error(`${satelliteMismatch.rows[0].count} satellite_imagery rows disagree with their area's municipality`);
    }

    // 3. Promote area_id to the sole location reference on shoreline_zones
    await client.query(`ALTER TABLE shoreline_zones ALTER COLUMN area_id SET NOT NULL`);

    // 4. Drop redundant columns + dead table
    await client.query(`ALTER TABLE shoreline_zones DROP COLUMN specific_area, DROP COLUMN municipality_id`);
    await client.query(`ALTER TABLE satellite_imagery DROP COLUMN municipality`);
    await client.query(`DROP TABLE shoreline_geometries`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    // Post-commit summary
    const zoneCount = await client.query(`SELECT COUNT(*) FROM shoreline_zones`);
    const imageryCount = await client.query(`SELECT COUNT(*) FROM satellite_imagery`);
    console.log("shoreline_zones count:", zoneCount.rows[0].count);
    console.log("satellite_imagery count:", imageryCount.rows[0].count);
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
