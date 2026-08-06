/** Exports an NDWI GeoTIFF from Sentinel-2 imagery for admin download and re-upload. */

const express = require("express");
const router = express.Router();
const { generateNDWIGeoTIFF } = require("../services/earthEngineService");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

// Admin-only: this queries Google Earth Engine (quota-bearing) and is only
// ever triggered from the admin Data Upload page.
router.post("/generate-ndwi", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { lonMin, latMin, lonMax, latMax, year, coastlineName } = req.body;

    if ([lonMin, latMin, lonMax, latMax, year].some((v) => v === undefined || v === null || v === "")) {
      return res.status(400).json({
        error: "lonMin, latMin, lonMax, latMax, and year are all required",
      });
    }

    const bounds = {
      lonMin: parseFloat(lonMin),
      latMin: parseFloat(latMin),
      lonMax: parseFloat(lonMax),
      latMax: parseFloat(latMax),
    };

    if (Object.values(bounds).some((v) => isNaN(v))) {
      return res.status(400).json({ error: "Bounds must be valid numbers" });
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 2015 || yearNum > new Date().getFullYear()) {
      return res.status(400).json({
        error: `Year must be between 2015 (Sentinel-2 launch) and ${new Date().getFullYear()}`,
      });
    }

    const safeName = (coastlineName || "coastline").replace(/[^a-zA-Z0-9_-]/g, "_");

    const result = await generateNDWIGeoTIFF({
      ...bounds,
      year: yearNum,
      coastlineName: safeName,
    });

    res.json({
      success: true,
      fileName: result.fileName,
      downloadUrl: `/uploads/ndwi/${result.fileName}`,
    });
  } catch (err) {
    console.error("NDWI generation error:", err);
    res.status(500).json({ error: err.message || "NDWI generation failed" });
  }
});

module.exports = router;
