// Background worker for multi-year NDWI batch generation, fired fire-and-forget from
// POST /api/generate-ndwi-batch so the request doesn't block for the whole batch.
// Job state lives in-memory (a Map, not a DB table) - progress doesn't survive a restart,
// though completed years are already saved; jobs are only visible to the process that created them.
// Loops years 2015 (Sentinel-2 launch) through the current year, generating an NDWI GeoTIFF per
// year via the same pipeline a manual upload uses. A failed year is skipped, not fatal to the batch.
const fs = require("fs");
const pool = require("../db");
const { generateNDWIGeoTIFF } = require("./earthEngineService");
const { processSatelliteImageFile } = require("../services/uploadPipeline");
const { invalidateMunicipalityCache } = require("./cacheService_FK_Version");
const { logAction } = require("./auditLog");
const { scheduleSync } = require("./storageSync");

const MIN_YEAR = 2015;

const jobs = new Map();
let nextJobId = 1;

function createJob({ bounds, specificArea, municipality, requestedBy }) {
  const id = nextJobId++;
  const totalYears = new Date().getFullYear() - MIN_YEAR + 1;
  jobs.set(id, {
    id,
    bounds,
    specificArea,
    municipality,
    requestedBy,
    status: "pending",
    totalYears,
    completedYears: [],
    failedYears: [],
    currentYear: null,
    cancelRequested: false,
    createdAt: new Date(),
    completedAt: null,
  });
  return { id, totalYears };
}

function getJob(id) {
  return jobs.get(id);
}

function requestCancel(id) {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return false;
  job.cancelRequested = true;
  return true;
}

async function runNdwiBatch(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    console.error(`In-memory batch job ${jobId} not found — aborting worker`);
    return;
  }

  const { lonMin, latMin, lonMax, latMax } = job.bounds;
  const bounds = { north: latMax, south: latMin, east: lonMax, west: lonMin };

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = MIN_YEAR; y <= currentYear; y++) years.push(y);

  job.status = "running";

  const completed = [];
  const failed = [];
  let cancelled = false;

  for (const year of years) {
    // checked before each year, not mid-year - a year in progress can't be cleanly interrupted
    if (job.cancelRequested) {
      cancelled = true;
      break;
    }

    job.currentYear = year;

    let client;
    try {
      const genResult = await generateNDWIGeoTIFF({
        lonMin, latMin, lonMax, latMax,
        year,
        coastlineName: job.specificArea.replace(/[^a-zA-Z0-9_-]/g, "_"),
      });

      const stats = fs.statSync(genResult.filePath);
      const syntheticFile = { path: genResult.filePath, filename: genResult.fileName, size: stats.size };

      client = await pool.connect();
      const result = await processSatelliteImageFile(
        client, syntheticFile, job.municipality, year, job.specificArea, job.requestedBy.id, bounds
      );

      if (result.success) {
        completed.push(year);
        scheduleSync();
      } else {
        failed.push({ year, reason: result.message || "Processing failed" });
      }
    } catch (err) {
      console.error(`NDWI batch job ${jobId}, year ${year} failed:`, err.message);
      failed.push({ year, reason: err.message });
    } finally {
      if (client) client.release();
    }

    job.completedYears = [...completed];
    job.failedYears = [...failed];
  }

  // done once per batch, not per-year, to avoid up to 12 recomputes; a failure here
  // doesn't block completion since the shoreline data already landed
  if (completed.length > 0) {
    try {
      await invalidateMunicipalityCache(job.municipality);
    } catch (err) {
      console.error(`NDWI batch job ${jobId}: cache invalidation failed:`, err.message);
    }
  }

  const finalStatus = cancelled
    ? "cancelled"
    : failed.length === 0 ? "complete" : completed.length > 0 ? "complete_with_errors" : "failed";
  job.status = finalStatus;
  job.currentYear = null;
  job.completedAt = new Date();
  console.log(`NDWI batch job ${jobId} finished: ${finalStatus} (${completed.length} succeeded, ${failed.length} failed)`);

  // one entry per batch, not per-year, to avoid flooding Audit Trail with up to 12 rows per click
  if (completed.length > 0 || failed.length > 0) {
    logAction(null, {
      actor: job.requestedBy,
      action: "ndwi_batch_completed",
      category: "data",
      severity: "normal",
      targetType: "ndwi_batch_job",
      targetId: jobId,
      details: { municipality: job.municipality, completed: completed.length, failed: failed.length, years: completed, status: finalStatus },
    });
  }
}

module.exports = { createJob, getJob, requestCancel, runNdwiBatch, MIN_YEAR };
