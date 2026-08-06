/**
 * bataan_summary_cache <-> municipalities bridge table — 2026-07-18
 *
 * bataan_summary_cache was the last floating table in the schema: unlike
 * municipality_analysis_cache (one row per municipality, so it naturally
 * FKs to municipalities.id), bataan_summary_cache is a province-wide rollup
 * for one year across ALL municipalities, so it never had a single owning
 * row to FK to — its "municipalities" data was stored as a denormalized
 * comma-separated municipalities_list TEXT column instead of a real
 * relationship. This adds a proper many-to-many bridge table and drops the
 * text column, so this table has a real FK-backed relationship like every
 * other table in the schema.
 *
 * Full pg_dump backup taken beforehand: db_backup_before_bataan_cache_bridge_2026-07-18.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE bataan_summary_cache_municipalities (
        id SERIAL PRIMARY KEY,
        cache_id INTEGER NOT NULL REFERENCES bataan_summary_cache(id) ON DELETE CASCADE,
        municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
        UNIQUE (cache_id, municipality_id)
      )
    `);
    await client.query(`CREATE INDEX idx_bataan_cache_munis_cache_id ON bataan_summary_cache_municipalities(cache_id)`);
    await client.query(`CREATE INDEX idx_bataan_cache_munis_municipality_id ON bataan_summary_cache_municipalities(municipality_id)`);

    // Backfill existing rows' denormalized municipalities_list into the bridge table
    const existingRows = await client.query(
      `SELECT id, municipalities_list FROM bataan_summary_cache WHERE municipalities_list IS NOT NULL AND municipalities_list <> ''`
    );
    for (const row of existingRows.rows) {
      const names = row.municipalities_list.split(",").map((n) => n.trim()).filter(Boolean);
      for (const name of names) {
        const muni = await client.query(`SELECT id FROM municipalities WHERE LOWER(name) = LOWER($1)`, [name]);
        if (muni.rows.length === 0) {
          throw new Error(`Backfill failed: municipality "${name}" (from cache row ${row.id}) not found in municipalities table`);
        }
        await client.query(
          `INSERT INTO bataan_summary_cache_municipalities (cache_id, municipality_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [row.id, muni.rows[0].id]
        );
      }
    }

    // Sanity check: every backfilled cache row must have at least one bridge row
    const unresolved = await client.query(`
      SELECT bsc.id FROM bataan_summary_cache bsc
      WHERE bsc.municipalities_list IS NOT NULL AND bsc.municipalities_list <> ''
        AND NOT EXISTS (SELECT 1 FROM bataan_summary_cache_municipalities m WHERE m.cache_id = bsc.id)
    `);
    if (unresolved.rows.length > 0) {
      throw new Error(`${unresolved.rows.length} bataan_summary_cache row(s) failed to backfill into the bridge table`);
    }

    await client.query(`ALTER TABLE bataan_summary_cache DROP COLUMN municipalities_list`);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const bridgeRows = await client.query(`
      SELECT bcm.cache_id, m.name FROM bataan_summary_cache_municipalities bcm
      JOIN municipalities m ON bcm.municipality_id = m.id
      ORDER BY bcm.cache_id, m.name
    `);
    console.log("Bridge table contents:", bridgeRows.rows);
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
