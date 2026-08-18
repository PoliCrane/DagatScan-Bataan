/** Generates NDWI GeoTIFF(s) from Sentinel-2 imagery and processes them directly — no manual re-upload step. */

const logger = require("../utils/logger");
const express = require("express");
const router = express.Router();
const fs = require("fs");
const pool = require("../db");
const { generateNDWIGeoTIFF } = require("../services/earthEngineService");
const { processSatelliteImageFile } = require("../services/uploadPipeline");
const { invalidateMunicipalityCache } = require("../services/cacheService_FK_Version");
const { logAction } = require("../services/auditLog");
const { scheduleSync } = require("../services/storageSync");
const { createJob, getJob, requestCancel, runNdwiBatch } = require("../services/ndwiBatchWorker");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

const MIN_YEAR = 2015; // Sentinel-2 launch year

// Covers the single-year route directly; the batch POST responds before any year is processed,
// so it doesn't cover the batch's real work - ndwiBatchWorker.js calls scheduleSync() itself per year.
router.use((req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) scheduleSync();
    });
  }
  next();
});

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

// Admin-only: queries Earth Engine (quota-bearing). Generates one year's NDWI GeoTIFF and
// processes it through the same pipeline a manual upload uses - no download/re-upload step.
router.post("/generate-ndwi", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { year, coastlineName, municipality, specificArea, isReupload } = req.body;

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

    // processSatelliteImageFile doesn't recompute this itself, so do it here to keep
    // projected_lrr/confidence/risk_level from sitting stale. Awaited since a single area's recompute is fast.
    if (result.success) {
      try {
        await invalidateMunicipalityCache(municipality);
      } catch (err) {
        logger.error("Cache invalidation failed after NDWI generation:", err.message);
      }

      // isReupload distinguishes a Reupload from a fresh "Generate This Year" so
      // Audit Trail can show them as distinct actions.
      logAction(null, {
        actor: req.user,
        action: isReupload ? "ndwi_reupload" : "ndwi_generated",
        category: "data",
        severity: "normal",
        targetType: "upload_history",
        targetId: result.uploadId,
        details: { municipality, year: yearNum, specific_area: specificArea },
      });
    }

    res.json({
      success: result.success,
      fileName: genResult.fileName,
      message: result.success
        ? "NDWI generated and processed successfully."
        : result.message || "NDWI generated, but processing failed.",
    });
  } catch (err) {
    logger.error("NDWI generation error:", err);
    res.status(500).json({ error: err.message || "NDWI generation failed" });
  }
});

// Kicks off a multi-year batch (2015-current) fire-and-forget - responds immediately with a
// job id instead of blocking for the whole batch (potentially over an hour). Job state is in-memory.
router.post("/generate-ndwi-batch", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { municipality, specificArea } = req.body;
    const { bounds, error: boundsError } = parseBounds(req.body);
    if (boundsError) return res.status(400).json({ error: boundsError });

    if (!municipality || !specificArea) {
      return res.status(400).json({ error: "municipality and specificArea are required" });
    }

    const { id: jobId, totalYears } = createJob({
      bounds, specificArea, municipality, requestedBy: req.user,
    });

    res.json({ jobId, totalYears });

    // Not awaited — the batch runs in the background after this response.
    runNdwiBatch(jobId).catch((err) => {
      logger.error(`NDWI batch job ${jobId} crashed:`, err.message);
    });
  } catch (err) {
    logger.error("NDWI batch start error:", err);
    res.status(500).json({ error: err.message || "Failed to start NDWI batch" });
  }
});

const canAccessJob = (job, user) =>
  user.roles === "superadmin" || job.requestedBy?.id === user.id;

// signals the batch loop to stop before its next year; can't interrupt a year already in progress
router.post("/generate-ndwi-batch/:jobId/cancel", verifyToken, verifyAdmin, (req, res) => {
  const job = getJob(Number(req.params.jobId));
  if (!job || !canAccessJob(job, req.user)) {
    return res.status(404).json({ error: "Batch job not found or not currently running" });
  }
  const ok = requestCancel(Number(req.params.jobId));
  if (!ok) {
    return res.status(404).json({ error: "Batch job not found or not currently running" });
  }
  res.json({ ok: true });
});

// Polled by the frontend to show batch progress.
router.get("/generate-ndwi-batch/:jobId", verifyToken, verifyAdmin, (req, res) => {
  const job = getJob(Number(req.params.jobId));
  if (!job || !canAccessJob(job, req.user)) {
    return res.status(404).json({ error: "Batch job not found" });
  }
  res.json({
    status: job.status,
    totalYears: job.totalYears,
    completedYears: job.completedYears,
    failedYears: job.failedYears,
    currentYear: job.currentYear,
  });
});

module.exports = router;
