/**
 * Background worker for multi-year NDWI batch generation, kicked off
 * fire-and-forget from POST /api/generate-ndwi-batch (routes/ndwiGeneration.js)
 * — not awaited before that route responds, so the HTTP request returns
 * immediately with a job id instead of blocking for however long the whole
 * batch takes.
 *
 * Loops years 2015 (Sentinel-2 launch) through the current year; for each,
 * generates an NDWI GeoTIFF via Earth Engine and feeds it directly into the
 * same processing pipeline a manual satellite upload uses
 * (uploadManagement.js's processSatelliteImageFile), skipping the
 * download/re-upload round trip entirely. A failed year (no usable
 * low-cloud pass, empty detection, an Earth Engine hiccup) is recorded and
 * skipped, not fatal to the rest of the batch.
 */
const fs = require("fs");
const pool = require("../db");
const { generateNDWIGeoTIFF } = require("./earthEngineService");
const { processSatelliteImageFile } = require("../routes/uploadManagement");
const { invalidateMunicipalityCache } = require("./cacheService_FK_Version");
const { logAction } = require("./auditLog");

const MIN_YEAR = 2015;

async function updateJob(jobId, fields) {
  const setClauses = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  setClauses.push("updated_at = NOW()");
  values.push(jobId);
  await pool.query(`UPDATE ndwi_batch_jobs SET ${setClauses.join(", ")} WHERE id = $${i}`, values);
}

async function runNdwiBatch(jobId) {
  const jobResult = await pool.query(`SELECT * FROM ndwi_batch_jobs WHERE id = $1`, [jobId]);
  const job = jobResult.rows[0];
  if (!job) {
    console.error(`ndwi_batch_jobs row ${jobId} not found — aborting worker`);
    return;
  }

  const municipalityResult = await pool.query(`SELECT name FROM municipalities WHERE id = $1`, [job.municipality_id]);
  const municipalityName = municipalityResult.rows[0].name;
  const { lonMin, latMin, lonMax, latMax } = job.bounds;
  const bounds = { north: latMax, south: latMin, east: lonMax, west: lonMin };

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = MIN_YEAR; y <= currentYear; y++) years.push(y);

  await updateJob(jobId, { status: "running" });

  const completed = [];
  const failed = [];
  let cancelled = false;

  for (const year of years) {
    // Checked before starting each year rather than mid-year — a year
    // already generating/processing can't be cleanly interrupted, so the
    // earliest a cancel can take effect is the next one.
    const cancelCheck = await pool.query(`SELECT cancel_requested FROM ndwi_batch_jobs WHERE id = $1`, [jobId]);
    if (cancelCheck.rows[0]?.cancel_requested) {
      cancelled = true;
      break;
    }

    await updateJob(jobId, { current_year: year });

    let client;
    try {
      const genResult = await generateNDWIGeoTIFF({
        lonMin, latMin, lonMax, latMax,
        year,
        coastlineName: job.specific_area.replace(/[^a-zA-Z0-9_-]/g, "_"),
      });

      const stats = fs.statSync(genResult.filePath);
      const syntheticFile = { path: genResult.filePath, filename: genResult.fileName, size: stats.size };

      client = await pool.connect();
      const result = await processSatelliteImageFile(
        client, syntheticFile, municipalityName, year, job.specific_area, job.requested_by, bounds
      );

      if (result.success) {
        completed.push(year);
      } else {
        failed.push({ year, reason: result.message || "Processing failed" });
      }
    } catch (err) {
      console.error(`NDWI batch job ${jobId}, year ${year} failed:`, err.message);
      failed.push({ year, reason: err.message });
    } finally {
      if (client) client.release();
    }

    await updateJob(jobId, {
      completed_years: JSON.stringify(completed),
      failed_years: JSON.stringify(failed),
    });
  }

  // Same call the old manual-upload route makes per-upload — done once here
  // (not per-year) since recomputing after every single year would mean up
  // to 12 recomputes per batch for no benefit; a failure here shouldn't stop
  // the job from being marked complete, since the shoreline data itself
  // already landed successfully.
  if (completed.length > 0) {
    try {
      await invalidateMunicipalityCache(municipalityName);
    } catch (err) {
      console.error(`NDWI batch job ${jobId}: cache invalidation failed:`, err.message);
    }
  }

  const finalStatus = cancelled
    ? "cancelled"
    : failed.length === 0 ? "complete" : completed.length > 0 ? "complete_with_errors" : "failed";
  await updateJob(jobId, { status: finalStatus, current_year: null, completed_at: new Date() });
  console.log(`NDWI batch job ${jobId} finished: ${finalStatus} (${completed.length} succeeded, ${failed.length} failed)`);

  // Neither processSatelliteImageFile nor this worker logged anything before
  // — only the old manual-upload route handler did, and this path never
  // goes through it. One entry per batch (not per-year) to avoid flooding
  // Audit Trail with up to 12 rows for a single "Generate All Years" click.
  if (completed.length > 0 || failed.length > 0) {
    try {
      const userResult = await pool.query(`SELECT username, roles FROM users WHERE id = $1`, [job.requested_by]);
      const user = userResult.rows[0];
      if (user) {
        logAction(null, {
          actor: { id: job.requested_by, username: user.username, roles: user.roles },
          action: "ndwi_batch_completed",
          category: "data",
          severity: "normal",
          targetType: "ndwi_batch_jobs",
          targetId: jobId,
          details: { municipality: municipalityName, completed: completed.length, failed: failed.length, years: completed, status: finalStatus },
        });
      }
    } catch (err) {
      console.error(`NDWI batch job ${jobId}: audit log failed:`, err.message);
    }
  }
}

module.exports = { runNdwiBatch, MIN_YEAR };
