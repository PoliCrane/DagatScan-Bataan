/** Generates NDWI GeoTIFF(s) from Sentinel-2 imagery and processes them directly — no manual re-upload step. */

const express = require("express");
const router = express.Router();
const fs = require("fs");
const pool = require("../db");
const { generateNDWIGeoTIFF } = require("../services/earthEngineService");
const { runNdwiBatch, MIN_YEAR } = require("../services/ndwiBatchWorker");
const { processSatelliteImageFile } = require("./uploadManagement");
const { getOrCreateMunicipalityId } = require("../services/municipalities");
const { invalidateMunicipalityCache } = require("../services/cacheService_FK_Version");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

function parseBounds(body) {
  const { lonMin, latMin, lonMax, latMax } = body;
  if ([lonMin, latMin, lonMax, latMax].some((v) => v === undefined || v === null || v === "")) {
    return { error: "lonMin, latMin, lonMax, latMax are all required" };
  }
  const bounds = {
    lonMin: parseFloat(lonMin),
    latMin: parseFloat(latMin),
    lonMax: parseFloat(lonMax),
    latMax: parseFloat(latMax),
  };
  if (Object.values(bounds).some((v) => isNaN(v))) {
    return { error: "Bounds must be valid numbers" };
  }
  return { bounds };
}

// Admin-only: this queries Google Earth Engine (quota-bearing) and is only
// ever triggered from the admin Data Upload page. Generates one year's NDWI
// GeoTIFF and immediately processes it through the same pipeline a manual
// satellite upload uses — no download/re-upload step.
router.post("/generate-ndwi", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { year, coastlineName, municipality, specificArea } = req.body;

    const { bounds, error: boundsError } = parseBounds(req.body);
    if (boundsError) return res.status(400).json({ error: boundsError });

    if (!municipality || !specificArea) {
      return res.status(400).json({ error: "municipality and specificArea are required" });
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < MIN_YEAR || yearNum > new Date().getFullYear()) {
      return res.status(400).json({
        error: `Year must be between ${MIN_YEAR} (Sentinel-2 launch) and ${new Date().getFullYear()}`,
      });
    }

    const safeName = (coastlineName || specificArea || "coastline").replace(/[^a-zA-Z0-9_-]/g, "_");

    const genResult = await generateNDWIGeoTIFF({ ...bounds, year: yearNum, coastlineName: safeName });
    const stats = fs.statSync(genResult.filePath);
    const syntheticFile = { path: genResult.filePath, filename: genResult.fileName, size: stats.size };

    const client = await pool.connect();
    let result;
    try {
      result = await processSatelliteImageFile(
        client,
        syntheticFile,
        municipality,
        yearNum,
        specificArea,
        req.user.id,
        { north: bounds.latMax, south: bounds.latMin, east: bounds.lonMax, west: bounds.lonMin }
      );
    } finally {
      client.release();
    }

    // processSatelliteImageFile calls this for the old manual-upload route
    // (uploadManagement.js's route handlers), but not for itself — this is
    // the NDWI path's equivalent, so projected_lrr/confidence/risk_level
    // actually get recomputed instead of sitting stale. Awaited (unlike the
    // batch worker's one-shot-at-the-end call) since this route is already
    // synchronous and a single area's recompute is fast.
    if (result.success) {
      try {
        await invalidateMunicipalityCache(municipality);
      } catch (err) {
        console.error("Cache invalidation failed after NDWI generation:", err.message);
      }
    }

    res.json({
      success: result.success,
      fileName: genResult.fileName,
      message: result.success
        ? "NDWI generated and processed successfully."
        : result.message || "NDWI generated, but processing failed.",
    });
  } catch (err) {
    console.error("NDWI generation error:", err);
    res.status(500).json({ error: err.message || "NDWI generation failed" });
  }
});

// Kicks off a multi-year batch (2015-current year) for the same bbox/area,
// fire-and-forget — responds immediately with a job id rather than blocking
// for however long the whole batch takes (potentially over an hour).
router.post("/generate-ndwi-batch", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { municipality, specificArea } = req.body;
    const { bounds, error: boundsError } = parseBounds(req.body);
    if (boundsError) return res.status(400).json({ error: boundsError });

    if (!municipality || !specificArea) {
      return res.status(400).json({ error: "municipality and specificArea are required" });
    }

    const municipalityId = await getOrCreateMunicipalityId(pool, municipality);

    const totalYears = new Date().getFullYear() - MIN_YEAR + 1;

    const jobResult = await pool.query(
      `INSERT INTO ndwi_batch_jobs (municipality_id, bounds, specific_area, requested_by, status, total_years)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING id`,
      [municipalityId, JSON.stringify(bounds), specificArea, req.user.id, totalYears]
    );
    const jobId = jobResult.rows[0].id;

    res.json({ jobId, totalYears });

    // Not awaited — the batch runs in the background after this response.
    runNdwiBatch(jobId).catch((err) => {
      console.error(`NDWI batch job ${jobId} crashed:`, err.message);
    });
  } catch (err) {
    console.error("NDWI batch start error:", err);
    res.status(500).json({ error: err.message || "Failed to start NDWI batch" });
  }
});

// Polled by the frontend to show batch progress.
router.get("/generate-ndwi-batch/:jobId", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM ndwi_batch_jobs WHERE id = $1`, [req.params.jobId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Batch job not found" });
    }
    const job = result.rows[0];
    res.json({
      status: job.status,
      totalYears: job.total_years,
      completedYears: job.completed_years,
      failedYears: job.failed_years,
      currentYear: job.current_year,
    });
  } catch (err) {
    console.error("NDWI batch status error:", err);
    res.status(500).json({ error: "Failed to fetch batch status" });
  }
});

module.exports = router;
