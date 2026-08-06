/**
 * upload_history municipality FK migration — 2026-07-25
 *
 * upload_history.municipality was the only free-text location column left
 * in the schema — every other table (shoreline_zones, satellite_imagery,
 * coastal_areas) was already normalized onto municipality_id/area_id by the
 * 2026-07-17/07-18 ERD migrations. Being matched only via
 * LOWER(municipality) = LOWER($1) string comparison meant it could silently
 * drift from the municipalities table everything else is FK'd through.
 *
 * Requires routes/uploadManagement.js to already write municipality_id on
 * every upload_history INSERT (deploy the code change together with this
 * migration — the backfill below only fixes existing rows).
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_upload_history_fk_2026-07-25.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `ALTER TABLE upload_history ADD COLUMN municipality_id INTEGER REFERENCES municipalities(id)`
    );

    await client.query(`
      UPDATE upload_history uh SET municipality_id = m.id
      FROM municipalities m
      WHERE LOWER(uh.municipality) = LOWER(m.name)
    `);

    const unresolved = await client.query(
      `SELECT DISTINCT municipality FROM upload_history WHERE municipality_id IS NULL`
    );
    if (unresolved.rows.length > 0) {
      throw new Error(
        `Unmatched municipality value(s), refusing to drop the old column: ${unresolved.rows
          .map((r) => r.municipality)
          .join(", ")}`
      );
    }

    await client.query(`ALTER TABLE upload_history ALTER COLUMN municipality_id SET NOT NULL`);
    await client.query(`CREATE INDEX idx_upload_history_municipality_id ON upload_history(municipality_id)`);
    await client.query(`ALTER TABLE upload_history DROP COLUMN municipality`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'upload_history'
      ORDER BY ordinal_position
    `);
    console.log("upload_history columns:", cols.rows);

    const sample = await pool.query(`
      SELECT uh.id, uh.upload_type, m.name AS municipality, uh.year, uh.process_status
      FROM upload_history uh
      JOIN municipalities m ON uh.municipality_id = m.id
      ORDER BY uh.id
      LIMIT 10
    `);
    console.log("Sample rows post-migration:", sample.rows);
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
