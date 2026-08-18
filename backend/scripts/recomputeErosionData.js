require("dotenv").config();
const pool = require("../db");
const { recomputeAreaTimeSeries } = require("../services/uploadPipeline");
const { calculateEPR } = require("../services/eprCalculator");
const { extractCoordinatesFromGeoJSON } = require("../services/eprAutoCalculator");
const {
  recomputeMunicipalityAreaLRR,
  invalidateMunicipalityCache,
} = require("../services/cacheService_FK_Version");

async function recomputeGeoJsonRows(client, areaId) {
  const result = await client.query(
    `SELECT id, year, geojson_data
     FROM shoreline_zones
     WHERE area_id = $1
       AND source_type NOT LIKE 'Satellite Analysis%'
       AND active
       AND geojson_data IS NOT NULL
       AND geojson_data->'properties'->'calculatedFrom' IS NOT NULL
     ORDER BY year ASC, id ASC`,
    [areaId]
  );

  const rows = result.rows;
  if (rows.length < 2) return 0;

  const baseline = rows[0];
  const baselineCoords = extractCoordinatesFromGeoJSON(baseline.geojson_data);
  if (!baselineCoords || baselineCoords.length === 0) return 0;

  await client.query(
    `UPDATE shoreline_zones SET cumulative_erosion = 0 WHERE id = $1`,
    [baseline.id]
  );

  let updated = 1;
  for (let i = 1; i < rows.length; i++) {
    const coords = extractCoordinatesFromGeoJSON(rows[i].geojson_data);
    if (!coords || coords.length === 0 || rows[i].year === baseline.year) continue;

    try {
      const epr = calculateEPR(
        baselineCoords,
        coords,
        parseInt(baseline.year),
        parseInt(rows[i].year)
      );
      await client.query(
        `UPDATE shoreline_zones SET erosion_rate = $1, cumulative_erosion = $2 WHERE id = $3`,
        [parseFloat(epr.erosionRate.toFixed(4)), parseFloat(epr.netChange.toFixed(2)), rows[i].id]
      );
      updated++;
    } catch (err) {
      console.warn(`Zone ${rows[i].id} (year ${rows[i].year}): skipped — ${err.message}`);
    }
  }
  return updated;
}

async function main() {
  const client = await pool.connect();
  try {
    const municipalities = await client.query(`SELECT id, name FROM municipalities ORDER BY name`);

    for (const muni of municipalities.rows) {
      const areas = await client.query(
        `SELECT id, name FROM coastal_areas WHERE municipality_id = $1 ORDER BY name`,
        [muni.id]
      );

      for (const area of areas.rows) {
        await client.query("BEGIN");
        try {
          await recomputeAreaTimeSeries(client, area.id);
          const geoJsonUpdated = await recomputeGeoJsonRows(client, area.id);
          await client.query("COMMIT");
          console.log(`${muni.name} / ${area.name}: satellite series recomputed, ${geoJsonUpdated} GeoJSON rows updated`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`${muni.name} / ${area.name}: failed — ${err.message}`);
        }
      }

      await recomputeMunicipalityAreaLRR(muni.id);
      await invalidateMunicipalityCache(muni.name);
      console.log(`${muni.name}: LRR recomputed and caches invalidated`);
    }

    console.log("Recompute complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Recompute failed:", err);
  process.exit(1);
});
