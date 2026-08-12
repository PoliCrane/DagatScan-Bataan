/** Generates NDWI GeoTIFF(s) from Sentinel-2 imagery and processes them directly — no manual re-upload step. */

const express = require("express");
const router = express.Router();
const fs = require("fs");
const pool = require("../db");
const { generateNDWIGeoTIFF } = require("../services/earthEngineService");
const { processSatelliteImageFile } = require("./uploadManagement");
const { invalidateMunicipalityCache } = require("../services/cacheService_FK_Version");
const { logAction } = require("../services/auditLog");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

const MIN_YEAR = 2015; // Sentinel-2 launch year

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

      // Neither this route nor processSatelliteImageFile logged anything
      // before — only the old manual-upload route handler did, and this
      // path never goes through it. isReupload distinguishes a Reupload
      // (DataManagement.jsx) from a fresh "Generate This Year" so Audit
      // Trail can show them as distinct actions.
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
    console.error("NDWI generation error:", err);
    res.status(500).json({ error: err.message || "NDWI generation failed" });
  }
});

module.exports = router;
