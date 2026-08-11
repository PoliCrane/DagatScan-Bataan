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
// Router is mounted behind verifyToken + verifyAdmin in server.js; the two
// mutating routes below additionally require superadmin, applied per-route.
const { verifySuperadmin } = require("../middleware/auth");
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
async function insertZoneRecords(client, records, municipalityId, adminId) {
  let insertedCount = 0;
  let transactionError = null;
  const errors = [];

  for (const record of records) {
    try {
      await client.query(`SAVEPOINT sp_${insertedCount}`);

      const areaId = await resolveAreaId(client, municipalityId, record.specific_area);

      const zoneResult = await client.query(
        `INSERT INTO shoreline_zones
         (area_id, year, erosion_rate, cumulative_erosion,
          data_quality, source_type, geojson_data, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          areaId,
          record.year,
          record.erosion_rate !== undefined ? record.erosion_rate : null,
          record.cumulative_erosion !== undefined ? record.cumulative_erosion : null,
          record.data_quality || "Unknown",
          record.source_type || "User Upload",
          record.geojson_data || null,
          adminId,
        ]
      );

      const zoneId = zoneResult.rows[0].id;
      console.log(`   ✓ Inserted zone: ${record.specific_area} (ID: ${zoneId})`);

      insertedCount++;
    } catch (err) {
      console.error(`Error inserting zone record for ${record.specific_area}:`, err.message);
      errors.push(`${record.specific_area}: ${err.message}`);
      try {
        await client.query(`ROLLBACK TO sp_${insertedCount}`);
      } catch (rollbackErr) {
        transactionError = rollbackErr;
        break;
      }
    }
  }

  return { insertedCount, errors, transactionError };
}

/**
 * Helper: Process GeoJSON file (Simplified - uses shoreline_zones with FK)
 */
async function processGeoJSONFile(
  client,
  file,
  municipality,
  year,
  specific_area,
  adminId
) {
  // Resolved first, before any upload_history writes (including the
  // failure-path one below) so every insert can use the FK'd id.
  const municipalityId = await getOrCreateMunicipalityId(client, municipality);

  try {
    // 1. Parse GeoJSON
    const parseResult = await parseGeoJSON(file.path);

    if (!parseResult.valid) {
      // Create failed upload record
      const failedUpload = await client.query(
        `INSERT INTO upload_history
         (admin_id, upload_type, municipality_id, year, file_name, file_path,
          file_size, process_status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, process_status`,
        [
          adminId,
          "GeoJSON",
          municipalityId,
          parseInt(year),
          file.filename,
          file.path,
          file.size,
          "Failed",
          parseResult.error,
        ]
      );

      // Delete the file since it's invalid
      fs.unlink(file.path, (err) => {
        if (err) console.error("Error deleting invalid file:", err);
      });

      return {
        type: "GeoJSON",
        success: false,
        uploadId: failedUpload.rows[0].id,
        error: parseResult.error,
      };
    }

    // 2. Auto-calculate erosion rates for features without them
    console.log(`\n🚀 PROCESSING UPLOAD - AUTO-CALCULATION PHASE`);
    console.log(`   Municipality: ${municipality}, Year: ${year}, Features: ${parseResult.features.length}`);
    await autoCalculateErosionRates(client, parseResult.features, municipality, year);

    // 3. Calculate erosion metrics from GeoJSON features (row-by-row for each zone)
    console.log(`\n📊 CALCULATING METRICS FROM FEATURES`);
    const records = calculateErosionMetrics(
      parseResult.features,
      municipality,
      year
    );
    
    // Log what we extracted
    console.log(`   Records extracted: ${records.length}`);
    records.forEach((rec, i) => {
      console.log(`   [${i}] ${rec.specific_area}: erosionRate=${rec.erosion_rate}`);
    });

    // 4. Extract geographic bounds
    const bounds = extractCoordinateBounds(parseResult.features);
    console.log(`   Municipality ID: ${municipalityId}`);

    // 6. Begin transaction to insert records
    await client.query("BEGIN");

    // 7. Insert each zone directly into shoreline_zones and extract geometries
    const { insertedCount, errors, transactionError } = await insertZoneRecords(
      client,
      records,
      municipalityId,
      adminId
    );

    // 8. Handle transaction completion
    let uploadStatus = "Complete";
    let errorMessage = null;
    
    if (transactionError || errors.length === records.length) {
      // All records failed - rollback the entire transaction
      await client.query("ROLLBACK");
      uploadStatus = "Failed";
      errorMessage = transactionError?.message || `All ${records.length} records failed to insert`;
    } else if (errors.length > 0) {
      // Some records failed - commit what we have
      await client.query("COMMIT");
      uploadStatus = "Partial";
      errorMessage = `Inserted ${insertedCount}/${records.length} records. Errors: ${errors.join("; ")}`;
    } else {
      // All successful - commit
      await client.query("COMMIT");
    }

    // 9. Create upload history record
    const uploadRecord = await client.query(
      `INSERT INTO upload_history
       (admin_id, upload_type, municipality_id, year, file_name, file_path,
        file_size, process_status, processed_records, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, process_status`,
      [
        adminId,
        "GeoJSON",
        municipalityId,
        parseInt(year),
        file.filename,
        file.path,
        file.size,
        uploadStatus,
        insertedCount > 0 ? insertedCount : null,
        errorMessage,
      ]
    );

    console.log(`   ✓ Upload complete: ${insertedCount} records inserted`);
    console.log(`   ✓ Triggers automatically invalidated cache`);

    return {
      type: "GeoJSON",
      success: uploadStatus !== "Failed",
      uploadId: uploadRecord.rows[0].id,
      status: uploadRecord.rows[0].process_status,
      recordsProcessed: insertedCount,
      bounds: bounds,
      message: `Successfully processed ${insertedCount} coastal zone(s) from ${municipality} in ${year}. Cache invalidated automatically. On next request, analytics will recalculate.`,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error processing GeoJSON:", error);

    // Create failed upload record
    const failedUpload = await client.query(
      `INSERT INTO upload_history
       (admin_id, upload_type, municipality_id, year, file_name, file_path,
        file_size, process_status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        adminId,
        "GeoJSON",
        municipalityId,
        parseInt(year),
        file.filename,
        file.path,
        file.size,
        "Failed",
        error.message,
      ]
    );

    return {
      type: "GeoJSON",
      success: false,
      uploadId: failedUpload.rows[0].id,
      error: error.message,
    };
  }
}

/**
 * Helper: Look up the most recent shoreline geometry recorded before `year`
 * for this area, to use as the reference coastline for satellite-image
 * change detection. Returns [[lat, lng], ...] or null.
 */
async function findReferenceCoastline(client, areaId, year) {
  console.log(`[findRef] Looking for reference: area_id=${areaId}, year<${year}`);

  const result = await client.query(
    `SELECT sz.year, sz.source_type, sz.geojson_data, sz.cumulative_erosion
     FROM shoreline_zones sz
     WHERE sz.area_id = $1
       AND sz.year < $2
       AND sz.geojson_data IS NOT NULL
     ORDER BY sz.year DESC
     LIMIT 1`,
    [areaId, year]
  );

  console.log(`[findRef] DB rows found: ${result.rows.length}`);
  if (result.rows.length > 0) {
    const r = result.rows[0];
    console.log(`[findRef] Found: year=${r.year}, source_type=${r.source_type}`);
  }

  if (result.rows.length === 0) return null;

  const { extractCoordinatesFromGeoJSON } = require("../services/eprAutoCalculator");
  const lonLatCoords = extractCoordinatesFromGeoJSON(result.rows[0].geojson_data);
  console.log(`[findRef] Extracted coords: ${lonLatCoords ? lonLatCoords.length : 'null'}`);
  if (!lonLatCoords || lonLatCoords.length === 0) return null;

  return {
    year: result.rows[0].year,
    coastline: lonLatCoords.map(([lon, lat]) => [lat, lon]),
    cumulativeErosion: result.rows[0].cumulative_erosion !== null
      ? parseFloat(result.rows[0].cumulative_erosion)
      : 0,
  };
}

/**
 * Recompute erosion_rate/cumulative_erosion/source_type for every satellite zone in
 * one area, in chronological year order, independent of upload order. Earliest active
 * year is always the baseline (End Point Rate methodology).
 */
async function recomputeAreaTimeSeries(client, areaId) {
  const { extractCoordinatesFromGeoJSON } = require("../services/eprAutoCalculator");
  const { calculatePerpendularDistances, calculateErosionFromDistances } = require("../services/imageSatelliteAnalysis");

  // A deactivated dataset drops out of the series entirely, including baseline
  // selection (rows[0] becomes the baseline), shifting it forward if needed.
  const result = await client.query(
    `SELECT id, year, geojson_data
     FROM shoreline_zones
     WHERE area_id = $1
       AND source_type LIKE 'Satellite Analysis%'
       AND active
       AND geojson_data IS NOT NULL
     ORDER BY year ASC, id ASC`,
    [areaId]
  );

  const rows = result.rows;
  if (rows.length === 0) return;

  const coastlines = rows.map((row) => {
    const lonLat = extractCoordinatesFromGeoJSON(row.geojson_data);
    return lonLat && lonLat.length > 0 ? lonLat.map(([lon, lat]) => [lat, lon]) : null;
  });

  // Earliest year is always the baseline; data_quality must stay in sync with
  // source_type so a zone promoted to/from baseline doesn't show a stale label.
  await client.query(
    `UPDATE shoreline_zones
     SET erosion_rate = NULL, cumulative_erosion = 0, source_type = 'Satellite Analysis - Baseline',
         data_quality = 'Baseline (Satellite Detection)'
     WHERE id = $1`,
    [rows[0].id]
  );

  // Each later year compares directly against the baseline (standard End Point
  // Rate), not chained hop-to-hop, so one bad intermediate year can't drag down later years.
  const baselineCoastline = coastlines[0];
  const baselineYear = rows[0].year;

  for (let i = 1; i < rows.length; i++) {
    const currCoastline = coastlines[i];

    if (!baselineCoastline || !currCoastline || rows[i].year === baselineYear) {
      console.warn(`[recompute] Skipping area_id=${areaId} year ${rows[i].year}: missing coastline data or duplicate year`);
      await client.query(
        `UPDATE shoreline_zones
         SET erosion_rate = NULL, cumulative_erosion = NULL, data_quality = 'Needs Review (Missing Data)'
         WHERE id = $1`,
        [rows[i].id]
      );
      continue;
    }

    const distances = calculatePerpendularDistances(baselineCoastline, currCoastline);
    const metrics = calculateErosionFromDistances(distances, baselineYear, rows[i].year);

    if (!metrics.valid) {
      console.warn(`[recompute] area_id=${areaId} year ${rows[i].year}: ${metrics.message}`);
      // Clear stale erosion figures so a rejected comparison doesn't keep showing old numbers.
      await client.query(
        `UPDATE shoreline_zones
         SET erosion_rate = NULL, cumulative_erosion = NULL,
             data_quality = $1
         WHERE id = $2`,
        [
          metrics.implausible ? 'Needs Review (Implausible Trace)' : 'Needs Review (Comparison Failed)',
          rows[i].id,
        ]
      );
      continue;
    }

    await client.query(
      `UPDATE shoreline_zones
       SET erosion_rate = $1, cumulative_erosion = $2, source_type = 'Satellite Analysis',
           data_quality = 'Estimated'
       WHERE id = $3`,
      [metrics.erosionRatePerYear, metrics.netRetreatMeters, rows[i].id]
    );
  }
}

/**
 * Store a satellite image and attempt coastline-detection/erosion analysis. Detection
 * needs a georeference and a prior reference coastline; if either is missing, the image
 * is still stored and the skip reason is reported back.
 */
async function processSatelliteImageFile(
  client,
  file,
  municipality,
  year,
  specific_area,
  adminId,
  bounds
) {
  // Resolved first so every upload_history write below (including the
  // failure path) can use the FK'd id.
  const municipalityId = await getOrCreateMunicipalityId(client, municipality);

  // Declared outside the try block (not `const` inside it) because the
  // catch block's failure INSERT also needs it — stays null if the
  // exception happened before resolveAreaId ran below.
  let areaId = null;

  try {
    // Always validate + store basic image metadata first
    const imageProcessResult = await processSatelliteImage(file.path, {
      municipality,
      year,
      source: "User Upload",
      bounds,
    });

    if (!imageProcessResult.valid) {
      const failedUpload = await client.query(
        `INSERT INTO upload_history
         (admin_id, upload_type, municipality_id, year, file_name, file_path,
          file_size, process_status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          adminId,
          "Satellite_Image",
          municipalityId,
          parseInt(year),
          file.filename,
          file.path,
          file.size,
          "Failed",
          imageProcessResult.error,
        ]
      );

      fs.unlink(file.path, (err) => {
        if (err) console.error("Error deleting invalid file:", err);
      });

      return {
        type: "Satellite_Image",
        success: false,
        uploadId: failedUpload.rows[0].id,
        error: imageProcessResult.error,
      };
    }

    // Bounds are stored (not just used transiently) so inconsistent bounding boxes across
    // years can be audited later — they'd otherwise show up as phantom "erosion".
    // Keyed on (area_id, year), not (municipality, year), so different areas in the same
    // municipality/year don't overwrite each other; areaId is reused for the rest of this function.
    areaId = await resolveAreaId(client, municipalityId, specific_area);

    // Captured before satellite_imagery's upsert below overwrites it — used
    // after a successful reprocess to delete the now-superseded file from
    // disk (see priorImagePath usage further down).
    const priorImageResult = await client.query(
      `SELECT image_path FROM satellite_imagery WHERE area_id = $1 AND year = $2`,
      [areaId, parseInt(year)]
    );
    const priorImagePath = priorImageResult.rows[0]?.image_path || null;

    // Reprocessing the same area/year replaces its upload_history record
    // rather than appending another one — satellite_imagery already upserts
    // on (area_id, year) below; this keeps upload_history at the same grain
    // instead of accumulating what look like duplicate rows in Data Management.
    await client.query(
      `DELETE FROM upload_history WHERE area_id = $1 AND year = $2 AND upload_type = 'Satellite_Image'`,
      [areaId, parseInt(year)]
    );

    const satelliteRecord = await client.query(
      `INSERT INTO satellite_imagery
       (area_id, year, image_path, capture_date, resolution, source, bounds, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (area_id, year)
       DO UPDATE SET
        image_path = $3,
        bounds = $7,
        updated_at = NOW()
       RETURNING id`,
      [
        areaId,
        parseInt(year),
        file.path,
        new Date(),
        "High",
        "User Upload",
        bounds ? JSON.stringify(bounds) : null,
        adminId,
      ]
    );

    // Render a browser-viewable preview for the Data Management page —
    // the stored file is a single-band GeoTIFF that no browser can display.
    // Best-effort: a preview failure must never fail the upload itself.
    try {
      await generateThumbnail(file.path);
    } catch (thumbErr) {
      console.warn("[Upload] Thumbnail generation failed (non-fatal):", thumbErr.message);
    }

    // Persist the image's own embedded georeferencing onto satellite_imagery.bounds
    // (preferred over hand-typed form bounds) regardless of whether detection below succeeds,
    // so later features don't require bounds to have been manually entered.
    try {
      const geo = await extractGeoreference(file.path, { bounds });
      if (geo.valid && geo.georeference?.bounds) {
        await client.query(
          `UPDATE satellite_imagery SET bounds = $1, updated_at = NOW() WHERE area_id = $2 AND year = $3`,
          [JSON.stringify(geo.georeference.bounds), areaId, parseInt(year)]
        );
      }
    } catch (geoErr) {
      console.warn("[Upload] Bounds auto-detection failed (non-fatal):", geoErr.message);
    }

    // Best-effort coastline-detection/erosion pipeline; requires georeferencing.
    // If a prior-year shoreline exists, compare and store the erosion rate. Otherwise,
    // store the detected coastline as a baseline zone for the next upload to compare against.
    let analysisOutcome = { ran: false, reason: "Not attempted" };
    // Declared outside the try block (not `const` inside it) because the
    // no-usable-result message below (after the try/catch closes) also
    // reads it — a block-scoped `const` there would throw ReferenceError
    // whenever detection found nothing, which is exactly the case that
    // message exists to describe.
    let reference = null;
    try {
      reference = await findReferenceCoastline(client, areaId, parseInt(year));

      const analysis = await processSatelliteImageWithAnalysis(file.path, {
        municipality,
        year: parseInt(year),
        bounds,
        referenceCoastline: reference?.coastline,
        referenceYear: reference?.year,
      });

      if (!analysis.valid) {
        analysisOutcome = {
          ran: false,
          reason: analysis.error || "Image analysis failed (likely missing georeferencing — supply image bounds)",
        };
      } else if (reference && (!analysis.analysis || !analysis.analysis.valid)) {
        // A reference existed but the comparison itself failed.
        analysisOutcome = {
          ran: false,
          reason: analysis.analysis?.error || "Could not compare detected coastline with reference data",
        };
      } else if (!analysis.zones || analysis.zones.length === 0) {
        analysisOutcome = { ran: false, reason: "No coastline zones could be extracted from the image" };
      } else {
        // Same fallback resolveAreaId() itself applies — must match so this
        // record resolves to the exact same areaId already computed above.
        const resolvedArea = (specific_area || "Main Coastline").trim() || "Main Coastline";
        const dataQuality = reference
          ? (analysis.analysis?.quality?.overallQuality === "High" ? "Estimated" : "Simulated")
          : "Baseline (Satellite Detection)";

        // Store with placeholder erosion values — recomputeAreaTimeSeries derives the
        // real figures for every zone in this area from chronological year order.
        const records = [{
          specific_area: resolvedArea,
          year: parseInt(year),
          erosion_rate: null,
          cumulative_erosion: null,
          data_quality: dataQuality,
          source_type: "Satellite Analysis - Baseline",
          geojson_data: {
            type: "Feature",
            properties: {
              detectionMethod: analysis.detection.method,
              segmentsDetected: analysis.zones.length,
              totalPoints: analysis.zones.reduce((n, z) => n + z.points.length, 0),
            },
            geometry: analysis.zones.length === 1
              ? {
                  type: "LineString",
                  coordinates: analysis.zones[0].points.map(([lat, lon]) => [lon, lat]),
                }
              : {
                  type: "MultiLineString",
                  coordinates: analysis.zones.map((zone) =>
                    zone.points.map(([lat, lon]) => [lon, lat])
                  ),
                },
          },
        }];

        await client.query("BEGIN");

        // Re-uploading for the same area/year replaces the prior detected zone rather than duplicating it.
        await client.query(
          `DELETE FROM shoreline_zones
           WHERE area_id = $1
             AND year = $2
             AND source_type LIKE 'Satellite Analysis%'`,
          [areaId, parseInt(year)]
        );

        const { insertedCount, errors, transactionError } = await insertZoneRecords(
          client,
          records,
          municipalityId,
          adminId
        );

        if (transactionError || insertedCount === 0) {
          await client.query("ROLLBACK");
          analysisOutcome = {
            ran: false,
            reason: transactionError?.message || "Failed to store detected coastline zones",
          };
        } else {
          // Recompute the area's whole time series so figures are correct regardless of upload order.
          await recomputeAreaTimeSeries(client, areaId);

          const finalRow = await client.query(
            `SELECT erosion_rate, cumulative_erosion, source_type
             FROM shoreline_zones
             WHERE area_id = $1 AND year = $2
               AND source_type LIKE 'Satellite Analysis%'`,
            [areaId, parseInt(year)]
          );
          const finalIsBaseline = finalRow.rows[0]?.source_type === "Satellite Analysis - Baseline";
          const finalErosionRate = finalRow.rows[0]?.erosion_rate !== null
            ? parseFloat(finalRow.rows[0]?.erosion_rate)
            : null;

          await client.query("COMMIT");
          // Update satellite_imagery analysis_status now that pipeline succeeded
          await client.query(
            `UPDATE satellite_imagery SET analysis_status = $1, updated_at = NOW()
             WHERE area_id = $2 AND year = $3`,
            [finalIsBaseline ? "Baseline" : "Analyzed", areaId, parseInt(year)]
          );
          analysisOutcome = {
            ran: true,
            baseline: finalIsBaseline,
            zonesDetected: analysis.zones.length,
            zonesStored: insertedCount,
            erosionRatePerYear: finalErosionRate,
            quality: analysis.analysis?.quality?.overallQuality || "Unknown",
            referenceYear: reference?.year,
            errors: errors.length > 0 ? errors : undefined,
          };
        }
      }
    } catch (analysisError) {
      console.error("Satellite image analysis pipeline error:", analysisError);
      analysisOutcome = { ran: false, reason: analysisError.message };
    }

    // Create upload history record
    const uploadRecord = await client.query(
      `INSERT INTO upload_history
       (admin_id, upload_type, municipality_id, area_id, year, file_name, file_path,
        file_size, process_status, processed_records)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, process_status`,
      [
        adminId,
        "Satellite_Image",
        municipalityId,
        areaId,
        parseInt(year),
        file.filename,
        file.path,
        file.size,
        "Complete",
        analysisOutcome.zonesStored || 1,
      ]
    );

    // Only reached once the new file is fully processed and recorded — a
    // failed reprocess (caught below) never touches the last known-good file.
    if (priorImagePath && priorImagePath !== file.path) {
      for (const p of [priorImagePath, thumbnailPathFor(priorImagePath)]) {
        if (fs.existsSync(p)) {
          fs.unlink(p, (err) => {
            if (err) console.error("Error deleting superseded file:", err);
          });
        }
      }
    }

    return {
      type: "Satellite_Image",
      success: true,
      uploadId: uploadRecord.rows[0].id,
      status: uploadRecord.rows[0].process_status,
      satelliteId: satelliteRecord.rows[0].id,
      fileSize: file.size,
      analysis: analysisOutcome,
      message: analysisOutcome.ran
        ? analysisOutcome.baseline
          ? `Satellite image stored. No prior data existed for this area, so the detected coastline (${analysisOutcome.zonesStored} zone(s)) was saved as a baseline — the next satellite image uploaded for this municipality/area will be compared against it automatically.`
          : `Satellite image stored. Coastline detection extracted ${analysisOutcome.zonesDetected} zone(s), ${analysisOutcome.zonesStored} stored for erosion analysis (compared against ${analysisOutcome.referenceYear} reference).`
        // A failed detection attempt doesn't touch previously stored data.
        : `Satellite image stored, but automated coastline detection did not produce a usable result this time: ${analysisOutcome.reason}.${
            reference ? ` This does not affect the existing ${reference.year} data already on file for this area.` : ""
          }`,
    };
  } catch (error) {
    console.error("Error processing satellite image:", error);

    const failedUpload = await client.query(
      `INSERT INTO upload_history
       (admin_id, upload_type, municipality_id, area_id, year, file_name, file_path,
        file_size, process_status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        adminId,
        "Satellite_Image",
        municipalityId,
        areaId,
        parseInt(year),
        file.filename,
        file.path,
        file.size,
        "Failed",
        error.message,
      ]
    );

    return {
      type: "Satellite_Image",
      success: false,
      uploadId: failedUpload.rows[0].id,
      error: error.message,
    };
  }
}

/**
 * Derives a thumbnail's public URL from a row's actual file_path, rather
 * than assuming a fixed folder — different upload paths store files under
 * different subdirectories (uploads/satellite-images/ for manual uploads,
 * uploads/ndwi/ for NDWI-generated ones), but thumbnailPathFor always
 * places the preview in a sibling "thumbnails" dir either way.
 */
function computeThumbnailUrl(filePath) {
  if (!filePath) return null;
  const thumbPath = thumbnailPathFor(filePath);
  const relative = path.relative(path.join(__dirname, "../uploads"), thumbPath).split(path.sep).join("/");
  return `/uploads/${relative}`;
}

/**
 * GET /api/admin/uploads
 * List all uploaded files with their status
 */
router.get("/", async (req, res) => {
  try {
    const { municipality, status, limit = 50, offset = 0 } = req.query;

    // uploaded_by: LEFT JOIN since some legacy rows predate admin_id being populated.
    // can_deactivate: only true for satellite uploads with an area_id — rows without
    // one are superseded re-uploads whose data no longer exists anywhere.
    // has_bounds: whether a true-color Earth Engine fetch is possible for this area/year.
    let query = `SELECT uh.*,
                        m.name AS municipality,
                        ca.name AS coastal_area,
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
        thumbnail_url: computeThumbnailUrl(row.file_path),
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
async function processCSVFile(
  client,
  file,
  defaultMunicipality,
  defaultYear,
  adminId
) {
  // Resolved first so every upload_history write below (including the
  // failure path) can use the FK'd id.
  const municipalityId = await getOrCreateMunicipalityId(client, defaultMunicipality);

  try {
    // 1. Parse CSV
    const parseResult = await parseCSV(
      file.path,
      defaultMunicipality,
      defaultYear
    );

    if (!parseResult.valid || parseResult.data.length === 0) {
      // Create failed upload record
      const failedUpload = await client.query(
        `INSERT INTO upload_history
         (admin_id, upload_type, municipality_id, year, file_name, file_path,
          file_size, process_status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, process_status`,
        [
          adminId,
          "CSV",
          municipalityId,
          parseInt(defaultYear),
          file.filename,
          file.path,
          file.size,
          "Failed",
          parseResult.error || "No valid records found",
        ]
      );

      // Delete the file since it's invalid
      fs.unlink(file.path, (err) => {
        if (err) console.error("Error deleting invalid file:", err);
      });

      return {
        type: "CSV",
        success: false,
        uploadId: failedUpload.rows[0].id,
        error: parseResult.error || "No valid records found",
      };
    }

    // 3. Begin transaction to insert records
    await client.query("BEGIN");

    let insertedCount = 0;
    let transactionError = null;
    const errors = [];

    // 4. Insert each record directly into shoreline_zones (simplified!)
    for (const record of parseResult.data) {
      try {
        await client.query(`SAVEPOINT sp_${insertedCount}`);

        // Resolve (or create) this record's area once, then use area_id for
        // both the existence check and the insert below.
        const areaId = await resolveAreaId(client, municipalityId, record.specific_area);

        // Check if this record already exists
        const existingResult = await client.query(
          `SELECT id FROM shoreline_zones
           WHERE area_id = $1 AND year = $2`,
          [areaId, record.year]
        );

        if (existingResult.rows.length > 0) {
          // Update existing record
          await client.query(
            `UPDATE shoreline_zones SET
             erosion_rate = $1,
             cumulative_erosion = $2,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [record.erosion_rate, record.cumulative_erosion, existingResult.rows[0].id]
          );
        } else {
          // Insert new record
          await client.query(
            `INSERT INTO shoreline_zones
             (area_id, year, erosion_rate, cumulative_erosion,
              data_quality, source_type, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              areaId,
              record.year,
              record.erosion_rate || 0,
              record.cumulative_erosion || 0,
              record.data_quality || "Unknown",
              record.source_type || "CSV Upload",
              adminId
            ]
          );
        }

        insertedCount++;
      } catch (err) {
        console.error(`Error inserting CSV record for ${record.specific_area}:`, err.message);
        errors.push(`${record.specific_area}: ${err.message}`);
        try {
          await client.query(`ROLLBACK TO sp_${insertedCount}`);
        } catch (rollbackErr) {
          transactionError = rollbackErr;
          break;
        }
      }
    }

    // 5. Handle transaction completion
    let uploadStatus = "Complete";
    let errorMessage = null;
    
    if (transactionError || errors.length === parseResult.data.length) {
      await client.query("ROLLBACK");
      uploadStatus = "Failed";
      errorMessage = transactionError?.message || `All ${parseResult.data.length} records failed to insert`;
    } else if (errors.length > 0) {
      await client.query("COMMIT");
      uploadStatus = "Partial";
      errorMessage = `Inserted ${insertedCount}/${parseResult.data.length} records. Errors: ${errors.join("; ")}`;
    } else {
      await client.query("COMMIT");
    }

    // 6. Create upload history record
    const uploadRecord = await client.query(
      `INSERT INTO upload_history
       (admin_id, upload_type, municipality_id, year, file_name, file_path,
        file_size, process_status, processed_records, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, process_status`,
      [
        adminId,
        "CSV",
        municipalityId,
        parseInt(defaultYear),
        file.filename,
        file.path,
        file.size,
        uploadStatus,
        insertedCount > 0 ? insertedCount : null,
        errorMessage,
      ]
    );

    console.log(`   ✓ CSV upload complete: ${insertedCount} records inserted/updated`);

    return {
      type: "CSV",
      success: uploadStatus !== "Failed",
      uploadId: uploadRecord.rows[0].id,
      status: uploadRecord.rows[0].process_status,
      recordsProcessed: insertedCount,
      message: `Successfully processed ${insertedCount} CSV record(s). Cache invalidated automatically.`,
    };
  } catch (error) {
    console.error("Error processing CSV:", error);

    const failedUpload = await client.query(
      `INSERT INTO upload_history
       (admin_id, upload_type, municipality_id, year, file_name, file_path,
        file_size, process_status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        adminId,
        "CSV",
        municipalityId,
        parseInt(defaultYear),
        file.filename,
        file.path,
        file.size,
        "Failed",
        error.message,
      ]
    );

    return {
      type: "CSV",
      success: false,
      uploadId: failedUpload.rows[0].id,
      error: error.message,
    };
  }
}

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
