const path = require("path");
const fs = require("fs");
const { autoCalculateErosionRates } = require("./eprAutoCalculator");
const { resolveAreaId } = require("./coastalAreas");
const { getOrCreateMunicipalityId } = require("./municipalities");
const { generateThumbnail, thumbnailPathFor } = require("./thumbnailGenerator");
const { extractGeoreference } = require("./imageGeoreference");
const {
  parseGeoJSON,
  parseCSV,
  calculateErosionMetrics,
  processSatelliteImage,
  processSatelliteImageWithAnalysis,
  extractCoordinateBounds,
} = require("./dataProcessor");

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

  const { extractCoordinatesFromGeoJSON } = require("./eprAutoCalculator");
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
  const { extractCoordinatesFromGeoJSON } = require("./eprAutoCalculator");
  const { calculatePerpendularDistances, calculateErosionFromDistances } = require("./imageSatelliteAnalysis");

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
      [metrics.erosionRatePerYear, metrics.netChangeMeters, rows[i].id]
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


module.exports = {
  insertZoneRecords,
  processGeoJSONFile,
  findReferenceCoastline,
  recomputeAreaTimeSeries,
  processSatelliteImageFile,
  computeThumbnailUrl,
  processCSVFile,
};
