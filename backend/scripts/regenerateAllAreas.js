// One-off: regenerate every coastal area's NDWI history through the current pipeline.
// Reuses the existing per-area batch worker rather than reimplementing a year loop.
// Run once after a pipeline change that alters the imagery itself (cloud selection,
// season window, index choice); no need to run it for changes that only affect how
// stored geometry is scored — scripts/recomputeErosionData.js covers those.
require("dotenv").config();
const pool = require("../db");
const { createJob, runNdwiBatch, getJob } = require("../services/ndwiBatchWorker");

async function main() {
  const actor = await pool.query(
    `SELECT id, username, roles FROM users WHERE roles = 'superadmin' AND active ORDER BY id LIMIT 1`
  );
  if (actor.rows.length === 0) throw new Error("No active superadmin to attribute this run to.");

  const areas = await pool.query(`
    SELECT ca.id, ca.name AS area_name, m.name AS municipality_name
    FROM coastal_areas ca
    JOIN municipalities m ON m.id = ca.municipality_id
    ORDER BY m.name, ca.name
  `);

  const summary = [];
  for (const area of areas.rows) {
    const bounds = await pool.query(
      `SELECT bounds FROM satellite_imagery
       WHERE area_id = $1 AND bounds IS NOT NULL
       ORDER BY year DESC LIMIT 1`,
      [area.id]
    );
    if (bounds.rows.length === 0) {
      console.log(`SKIP ${area.municipality_name} / ${area.area_name}: no stored bounds`);
      summary.push({ area: area.area_name, status: "skipped-no-bounds", completed: 0, failed: 0 });
      continue;
    }
    const b = bounds.rows[0].bounds;

    console.log(`\n=== ${area.municipality_name} / ${area.area_name} ===`);
    const { id: jobId } = createJob({
      bounds: { lonMin: b.west, latMin: b.south, lonMax: b.east, latMax: b.north },
      specificArea: area.area_name,
      municipality: area.municipality_name,
      requestedBy: actor.rows[0],
    });

    const started = Date.now();
    await runNdwiBatch(jobId);
    const job = getJob(jobId);
    console.log(
      `Done in ${((Date.now() - started) / 60000).toFixed(1)} min — completed [${job.completedYears.join(", ")}]` +
      (job.failedYears.length ? `, failed ${JSON.stringify(job.failedYears.map((f) => f.year))}` : ", no failures")
    );
    summary.push({
      area: `${area.municipality_name} / ${area.area_name}`,
      status: job.status,
      completed: job.completedYears.length,
      failed: job.failedYears.length,
    });
  }

  console.log("\n=== SUMMARY ===");
  console.table(summary);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("regenerateAllAreas.js FAILED:", err);
    return pool.end().finally(() => process.exit(1));
  });
