/**
 * Data upload management routes: GeoJSON, CSV, and satellite image ingestion.
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const pool = require("../db");
const { upload } = require("../config/multer");
const { autoCalculateErosionRates } = require("../services/eprAutoCalculator");
const { invalidateMunicipalityCache } = require("../services/cacheService_FK_Version");
const { findAreaId, resolveAreaId } = require("../services/coastalAreas");
const { getOrCreateMunicipalityId } = require("../services/municipalities");
const { generateThumbnail, thumbnailPathFor } = require("../services/thumbnailGenerator");
const { extractGeoreference } = require("../services/imageGeoreference");
const { logAction } = require("../services/auditLog");
const { scheduleSync } = require("../services/storageSync");
// Router is mounted behind verifyToken + verifyAdmin in server.js; the two
// mutating routes below additionally require superadmin, applied per-route.
const { verifySuperadmin } = require("../middleware/auth");
const {
  processGeoJSONFile,
  recomputeAreaTimeSeries,
  processSatelliteImageFile,
  computeThumbnailUrl,
  processCSVFile,
} = require("../services/uploadPipeline");

// Triggers a debounced Supabase Storage sync after any successful mutating
// request on this router, instead of relying solely on a timed poll — see
// storageSync.js. Coarse-grained on purpose: cheaper to occasionally
// schedule a sync that finds nothing pending than to track every individual
// insert site (this file alone has 9 of them).
router.use((req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) scheduleSync();
    });
  }
  next();
});
const {
  parseGeoJSON,
  parseCSV,
  calculateErosionMetrics,
  processSatelliteImage,
  processSatelliteImageWithAnalysis,
  extractCoordinateBounds,
  validateLocationData,
} = require("../services/dataProcessor");

/** Validate file format and size before upload. */
router.post("/validate", async (req, res) => {
  try {
    const { fileType, fileSize, municipality, year, description } = req.body;

    // Validation rules
    const rules = {
      GeoJSON: {
        maxSize: 50 * 1024 * 1024, // 50MB
        extension: ".json",
        mimeType: "application/json",
      },
      Satellite_Image: {
        maxSize: 200 * 1024 * 1024, // 200MB
        extension: [".tif", ".tiff", ".jpg", ".png"],
        mimeType: ["image/tiff", "image/jpeg", "image/png"],
      },
      Survey_Data: {
        maxSize: 100 * 1024 * 1024, // 100MB
        extension: [".csv", ".xlsx", ".json"],
        mimeType: [
          "text/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/json",
        ],
      },
    };

    if (!fileType || !rules[fileType]) {
      return res.status(400).json({
        valid: false,
        error: `Invalid file type. Supported: ${Object.keys(rules).join(", ")}`,
      });
    }

    const rule = rules[fileType];

    if (fileSize > rule.maxSize) {
      return res.status(400).json({
        valid: false,
        error: `File too large. Maximum size: ${(rule.maxSize / 1024 / 1024).toFixed(0)}MB`,
      });
    }

    if (!municipality || !year) {
      return res.status(400).json({
        valid: false,
        error: "municipality and year are required",
      });
    }

    // Validate location data
    const locationValidation = validateLocationData({
      municipality,
      year,
      specific_area: description,
    });

    if (!locationValidation.valid) {
      return res.status(400).json({
        valid: false,
        error: locationValidation.errors.join("; "),
      });
    }

    // Check for existing data
    const existing = await pool.query(
      `SELECT COUNT(*) as count FROM shoreline_zones sz
       JOIN coastal_areas ca ON sz.area_id = ca.id
       JOIN municipalities m ON ca.municipality_id = m.id
       WHERE LOWER(m.name) = LOWER($1) AND sz.year = $2 AND sz.source_type = $3`,
      [municipality, parseInt(year), fileType]
    );

    res.json({
      valid: true,
      message: "File validation passed",
      fileType,
      municipality,
      year,
      fileSize,
      maxAllowed: rule.maxSize,
      warning:
        existing.rows[0].count > 0
          ? `Warning: Data already exists for ${municipality} in ${year}. Upload will update existing data.`
          : null,
      nextStep: "Submit file via /api/admin/uploads/upload",
    });
  } catch (err) {
    console.error("Error validating file:", err);
    res.status(500).json({ error: "Validation failed" });
  }
});

/** Upload and process a file (GeoJSON, CSV, or Satellite Image); multipart/form-data. */
router.post(
  "/upload",
  upload.fields([
    { name: "geojson", maxCount: 1 },
    { name: "csv", maxCount: 1 },
    { name: "satellite", maxCount: 1 },
  ]),
  async (req, res) => {
    let client;
    const uploadIds = [];

    try {
      const { municipality, year, description, north, south, east, west } = req.body;
      // Trim so whitespace doesn't break the specific_area match used to find a reference coastline.
      const specific_area = (req.body.specific_area || "").trim() || undefined;
      // Set by verifyToken middleware; traces upload_history.admin_id -> users.id.
      const adminId = req.user.id;

      // Optional georeference bounds for satellite image analysis
      const bounds =
        north && south && east && west
          ? {
              north: parseFloat(north),
              south: parseFloat(south),
              east: parseFloat(east),
              west: parseFloat(west),
            }
          : null;

      // Validate location data
      const locationValidation = validateLocationData({
        municipality,
        year,
        specific_area: specific_area || description,
      });

      if (!locationValidation.valid) {
        return res.status(400).json({
          valid: false,
          error: locationValidation.errors.join("; "),
        });
      }

      client = await pool.connect();
      const results = [];

      // Process GeoJSON file if uploaded
      if (req.files.geojson && req.files.geojson.length > 0) {
        const geojsonFile = req.files.geojson[0];
        const geojsonResult = await processGeoJSONFile(
          client,
          geojsonFile,
          municipality,
          year,
          specific_area || description,
          adminId
        );
        results.push(geojsonResult);
        if (geojsonResult.uploadId) uploadIds.push(geojsonResult.uploadId);
      }

      // Process CSV file if uploaded
      if (req.files.csv && req.files.csv.length > 0) {
        const csvFile = req.files.csv[0];
        const csvResult = await processCSVFile(
          client,
          csvFile,
          municipality,
          year,
          adminId
        );
        results.push(csvResult);
        if (csvResult.uploadId) uploadIds.push(csvResult.uploadId);
      }

      // Process Satellite Image file if uploaded
      if (req.files.satellite && req.files.satellite.length > 0) {
        const satelliteFile = req.files.satellite[0];
        const satelliteResult = await processSatelliteImageFile(
          client,
          satelliteFile,
          municipality,
          year,
          specific_area || description,
          adminId,
          bounds
        );
        results.push(satelliteResult);
        if (satelliteResult.uploadId) uploadIds.push(satelliteResult.uploadId);
      }

      if (results.length === 0) {
        return res.status(400).json({
          error: "No files uploaded. Please upload a GeoJSON, CSV, or Satellite Image file.",
        });
      }

      // STEP: Invalidate cache for this municipality since new data was uploaded
      await invalidateMunicipalityCache(municipality);

      res.json({
        success: true,
        message: "Files uploaded and processing started. Cache invalidated for recalculation.",
        uploads: results,
        uploadIds: uploadIds,
      });

      logAction(null, {
        actor: req.user,
        action: "upload_created",
        category: "data",
        severity: "normal",
        targetType: "upload_history",
        targetId: uploadIds.join(","),
        details: { municipality, year, specific_area: specific_area || description || null },
      });
    } catch (error) {
      console.error("Error processing upload:", error);
      res.status(500).json({
        error: "Upload processing failed",
        message: error.message,
      });
    } finally {
      if (client) client.release();
    }
  }
);

/**
 * Insert a batch of zone records into shoreline_zones, using SAVEPOINTs per record
 * so one bad record doesn't poison the transaction. Caller handles BEGIN/COMMIT/ROLLBACK.
 */
router.get("/", async (req, res) => {
  try {
    const { municipality, status, limit = 50, offset = 0 } = req.query;

    // uploaded_by: LEFT JOIN since some legacy rows predate admin_id being populated.
    // can_deactivate: only true for satellite uploads with an area_id — rows without
    // one are superseded re-uploads whose data no longer exists anywhere.
    // has_bounds: whether a true-color Earth Engine fetch is possible for this area/year.
    // confidence: coastal_areas.lrr_confidence — a per-AREA value (how well
    // the area's overall regression fits), not per-year, so every row for
    // the same area shows the same number. Surfaced so an admin can spot a
    // low-confidence area and reupload a year to improve its fit.
    let query = `SELECT uh.*,
                        m.name AS municipality,
                        ca.name AS coastal_area,
                        ca.lrr_confidence AS confidence,
                        u.username AS uploaded_by,
                        u.roles AS uploaded_by_role,
                        (uh.area_id IS NOT NULL AND uh.upload_type = 'Satellite_Image') AS can_deactivate,
                        (si.bounds IS NOT NULL) AS has_bounds,
                        si.bounds AS bounds
                 FROM upload_history uh
                 JOIN municipalities m ON uh.municipality_id = m.id
                 LEFT JOIN coastal_areas ca ON uh.area_id = ca.id
                 LEFT JOIN users u ON uh.admin_id = u.id
                 LEFT JOIN satellite_imagery si ON si.area_id = uh.area_id AND si.year = uh.year
                 WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (municipality) {
      query += ` AND LOWER(m.name) = LOWER($${paramIndex})`;
      params.push(municipality);
      paramIndex++;
    }

    if (status) {
      query += ` AND uh.process_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY uh.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    // Total count uses the same filters — run concurrently with the list query.
    let countQuery = `SELECT COUNT(*) as total
                      FROM upload_history uh
                      JOIN municipalities m ON uh.municipality_id = m.id
                      WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;

    if (municipality) {
      countQuery += ` AND LOWER(m.name) = LOWER($${countParamIndex})`;
      countParams.push(municipality);
      countParamIndex++;
    }

    if (status) {
      countQuery += ` AND uh.process_status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    res.json({
      uploads: result.rows.map((row) => ({
        ...row,
        // Prefers the durable Supabase URL (survives a Render redeploy) —
        // falls back to the local path for dev, or the ~5-minute window
        // before storageSync.js catches up on a freshly-generated thumbnail.
        thumbnail_url: row.thumbnail_storage_url || computeThumbnailUrl(row.file_path),
      })),
      pagination: {
        total: countResult.rows[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (err) {
    console.error("Error fetching uploads:", err);
    res.status(500).json({ error: "Failed to fetch uploads" });
  }
});

/**
 * Fetch (or serve cached) true-color satellite imagery for this upload's area/year via
 * Earth Engine. Declared above the greedy GET /:uploadId for route-ordering. Cached to
 * disk keyed on (area_id, year), not upload id, so re-uploads share one cached fetch.
 */
router.get("/:uploadId/satellite-imagery", async (req, res) => {
  try {
    const upload = await loadUploadForMutation(req.params.uploadId);
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" });
    }
    if (!upload.area_id) {
      return res.status(400).json({
        error: "This upload has no linked coastal area, so its location can't be resolved.",
      });
    }

    const boundsResult = await pool.query(
      `SELECT bounds FROM satellite_imagery WHERE area_id = $1 AND year = $2`,
      [upload.area_id, upload.year]
    );
    const bounds = boundsResult.rows[0]?.bounds;
    if (!bounds) {
      return res.status(400).json({
        error: "No location data available for this dataset — satellite imagery can't be fetched.",
      });
    }

    const cacheDir = path.join(__dirname, "..", "uploads", "satellite-images", "rgb-cache");
    const cachePath = path.join(cacheDir, `${upload.area_id}_${upload.year}.png`);

    if (!fs.existsSync(cachePath)) {
      const { generateTrueColorImage } = require("../services/earthEngineService");
      await generateTrueColorImage({
        lonMin: bounds.west,
        latMin: bounds.south,
        lonMax: bounds.east,
        latMax: bounds.north,
        year: upload.year,
        destPath: cachePath,
      });
    }

    res.json({ url: `/uploads/satellite-images/rgb-cache/${upload.area_id}_${upload.year}.png` });
  } catch (err) {
    console.error("Error fetching satellite imagery:", err);
    res.status(500).json({ error: err.message || "Failed to fetch satellite imagery" });
  }
});

/**
 * GET /api/admin/uploads/:uploadId
 * Get specific upload details
 */
router.get("/:uploadId", async (req, res) => {
  try {
    const { uploadId } = req.params;

    const result = await pool.query(
      `SELECT uh.*, m.name AS municipality
       FROM upload_history uh
       JOIN municipalities m ON uh.municipality_id = m.id
       WHERE uh.id = $1`,
      [parseInt(uploadId)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Upload not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching upload:", err);
    res.status(500).json({ error: "Failed to fetch upload" });
  }
});

/**
 * GET /api/admin/uploads/:uploadId/status
 * Check processing status of upload
 */
router.get("/:uploadId/status", async (req, res) => {
  try {
    const { uploadId } = req.params;

    const result = await pool.query(
      `SELECT 
        id,
        upload_type,
        process_status,
        processed_records,
        error_message,
        created_at,
        updated_at
       FROM upload_history 
       WHERE id = $1`,
      [parseInt(uploadId)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Upload not found" });
    }

    const upload = result.rows[0];
    res.json({
      uploadId: upload.id,
      uploadType: upload.upload_type,
      status: upload.process_status,
      processedRecords: upload.processed_records,
      errorMessage: upload.error_message,
      createdAt: upload.created_at,
      updatedAt: upload.updated_at,
      statusSteps: {
        Pending: "Waiting to be processed",
        Processing: "Currently processing file",
        Complete: "Successfully processed",
        Failed: "Processing failed - see errorMessage",
      },
      nextAction:
        upload.process_status === "Complete"
          ? "Data is ready to use in visualizations"
          : "Waiting for processing. Contact admin.",
    });
  } catch (err) {
    console.error("Error checking upload status:", err);
    res.status(500).json({ error: "Failed to check status" });
  }
});

/**
 * Helper: load an upload row plus the municipality name needed to refresh
 * its derived caches afterwards, and the specific coastal area name (when
 * the upload is tied to one) so audit-log entries can identify it by more
 * than a bare id — see the "upload #13" traceability fix.
 */
async function loadUploadForMutation(uploadId) {
  const result = await pool.query(
    `SELECT uh.*, m.name AS municipality, ca.name AS specific_area
     FROM upload_history uh
     JOIN municipalities m ON uh.municipality_id = m.id
     LEFT JOIN coastal_areas ca ON uh.area_id = ca.id
     WHERE uh.id = $1`,
    [parseInt(uploadId)]
  );
  return result.rows[0] || null;
}

/**
 * Superadmin-only: activate/deactivate a dataset. Writes the flag to both upload_history
 * and the shoreline_zones row it produced (erosion figures are derived from the latter),
 * then re-derives the area's time series and refreshes caches.
 */
router.patch("/:uploadId/active", verifySuperadmin, async (req, res) => {
  const { uploadId } = req.params;
  const { active } = req.body;

  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "Body must include a boolean `active` field" });
  }

  let client;
  try {
    const upload = await loadUploadForMutation(uploadId);
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" });
    }

    // Without an area_id (superseded re-upload) we can't resolve the shoreline_zones
    // row it produced, so flipping the flag would change the listing but not the numbers.
    if (!upload.area_id || upload.upload_type !== "Satellite_Image") {
      return res.status(400).json({
        error:
          "This upload can't be deactivated — it has no linked coastal area " +
          "(it was superseded by a later upload for the same area and year, " +
          "so its data is no longer part of any analysis).",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    await client.query(
      `UPDATE upload_history
       SET active = $1,
           deactivated_at = CASE WHEN $1 THEN NULL ELSE NOW() END,
           deactivated_by = CASE WHEN $1 THEN NULL ELSE $2::int END,
           updated_at = NOW()
       WHERE id = $3`,
      [active, req.user.id, upload.id]
    );

    await client.query(
      `UPDATE shoreline_zones
       SET active = $1, updated_at = NOW()
       WHERE area_id = $2 AND year = $3
         AND source_type LIKE 'Satellite Analysis%'`,
      [active, upload.area_id, upload.year]
    );

    // Re-derive the whole area: the earliest ACTIVE year is the EPR baseline,
    // so toggling the earliest dataset shifts the baseline and changes every
    // other year's erosion figures for this area.
    await recomputeAreaTimeSeries(client, upload.area_id);

    await client.query("COMMIT");

    // Eager cache refresh, same contract every other write path here honors.
    await invalidateMunicipalityCache(upload.municipality);

    res.json({
      message: active ? "Dataset activated" : "Dataset deactivated",
      uploadId: upload.id,
      active,
    });

    logAction(null, {
      actor: req.user,
      action: "upload_active_toggled",
      category: "data",
      severity: "normal",
      targetType: "upload_history",
      targetId: upload.id,
      details: {
        filename: upload.file_name,
        municipality: upload.municipality,
        specific_area: upload.specific_area,
        year: upload.year,
        active,
      },
    });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr.message);
      }
    }
    console.error("Error toggling dataset active state:", err);
    res.status(500).json({ error: "Failed to update dataset status" });
  } finally {
    if (client) client.release();
  }
});

/** Superadmin-only: delete an upload, its derived shoreline_zones/satellite_imagery rows, and refresh caches. */
router.delete("/:uploadId", verifySuperadmin, async (req, res) => {
  const { uploadId } = req.params;
  let client;

  try {
    const upload = await loadUploadForMutation(uploadId);
    if (!upload) {
      return res.status(404).json({ error: "Upload not found" });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    // Only cascade when derived data is identifiable; superseded rows (no area_id)
    // have no live data of their own, so only their file/audit row is removed.
    if (upload.area_id && upload.upload_type === "Satellite_Image") {
      await client.query(
        `DELETE FROM shoreline_zones
         WHERE area_id = $1 AND year = $2
           AND source_type LIKE 'Satellite Analysis%'`,
        [upload.area_id, upload.year]
      );
      await client.query(
        `DELETE FROM satellite_imagery WHERE area_id = $1 AND year = $2`,
        [upload.area_id, upload.year]
      );
      await recomputeAreaTimeSeries(client, upload.area_id);
    }

    await client.query("DELETE FROM upload_history WHERE id = $1", [upload.id]);

    await client.query("COMMIT");

    // Remove the stored file and its generated preview (best-effort — a
    // missing file must not fail an otherwise-committed delete).
    for (const p of [upload.file_path, upload.file_path && thumbnailPathFor(upload.file_path)]) {
      if (p && fs.existsSync(p)) {
        fs.unlink(p, (err) => {
          if (err) console.error("Error deleting file:", err);
        });
      }
    }

    // Same file, mirrored copy — only present once storageSync has caught up.
    if (upload.storage_url && process.env.SUPABASE_URL) {
      const { deleteFromStorage } = require("../services/supabaseStorage");
      const storagePath = path.relative(path.join(__dirname, "../uploads"), upload.file_path).split(path.sep).join("/");
      deleteFromStorage(storagePath).catch((err) => console.error("Error deleting from Supabase Storage:", err.message));
    }

    await invalidateMunicipalityCache(upload.municipality);

    res.json({
      message: "Upload, derived data, and files deleted",
      deletedId: upload.id,
    });

    logAction(null, {
      actor: req.user,
      action: "upload_deleted",
      category: "data",
      severity: "critical",
      targetType: "upload_history",
      targetId: upload.id,
      details: {
        filename: upload.file_name,
        municipality: upload.municipality,
        specific_area: upload.specific_area,
        year: upload.year,
        upload_type: upload.upload_type,
      },
    });
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr.message);
      }
    }
    console.error("Error deleting upload:", err);
    res.status(500).json({ error: "Failed to delete upload" });
  } finally {
    if (client) client.release();
  }
});

/**
 * Helper: Process CSV file
 */
module.exports = router;
// Exposed for one-off maintenance/backfill scripts (e.g. recomputing all
// existing satellite zones after a fix to the erosion-distance algorithm).
module.exports.recomputeAreaTimeSeries = recomputeAreaTimeSeries;
// Exposed so NDWI generation (single-year and batch) can feed a freshly
// generated GeoTIFF straight into the same processing pipeline a manual
// upload uses — this function only ever reads file.path/.filename/.size,
// never req/res, so a synthetic file object pointing at an on-disk NDWI
// export works identically to a real multer upload.
module.exports.processSatelliteImageFile = processSatelliteImageFile;
