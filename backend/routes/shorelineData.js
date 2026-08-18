/** Shoreline data API routes, backed by the eager analysis cache. */

const express = require("express");
const pool = require("../db");
const {
  getMunicipalityAnalysis,
  getBataanSummary,
  getMunicipalitySummary,
  getMunicipalityId,
  invalidateMunicipalityCache,
  invalidateAllCaches
} = require("../services/cacheService_FK_Version");
const { verifyToken, verifyAdmin } = require("../middleware/auth");
const { resolveAreaId, findAreaId } = require("../services/coastalAreas");
const { classifyErosionRisk } = require("../services/riskClassification");
const { getOrCreateMunicipalityId } = require("../services/municipalities");
const { logAction } = require("../services/auditLog");
const { runHindcast, storeRun, getLatestRun } = require("../services/hindcastValidation");
const { simplifyCoastline } = require("../services/geoUtils");

const router = express.Router();

// browser-side caching for the public reads: data only changes on new uploads,
// so a short max-age cuts repeat map loads without risking stale demos
router.use((req, res, next) => {
  if (req.method === "GET") res.set("Cache-Control", "public, max-age=300");
  next();
});

router.get("/config/risk-tiers", (req, res) => {
  const { RISK_COLORS, RISK_LABELS, STABLE_BAND_M_PER_YEAR } = require("../services/riskClassification");
  res.json({
    unit: "m/year",
    convention: "negative = erosion, positive = accretion",
    stableBand: STABLE_BAND_M_PER_YEAR,
    tiers: [
      { key: "VERY_HIGH", rule: "rate <= -5" },
      { key: "HIGH", rule: "-5 < rate <= -1" },
      { key: "MODERATE", rule: "-1 < rate < 1" },
      { key: "LOW", rule: "1 <= rate < 5" },
      { key: "VERY_LOW", rule: "rate >= 5" },
    ],
    colors: RISK_COLORS,
    labels: RISK_LABELS,
  });
});

router.post("/validation/run", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { municipality } = req.body || {};
    let municipalityId = null;
    let scope = "all";
    if (municipality) {
      municipalityId = await getMunicipalityId(municipality);
      if (!municipalityId) {
        return res.status(404).json({ error: `Unknown municipality: ${municipality}` });
      }
      scope = municipality.toLowerCase();
    }

    const result = await runHindcast({ municipalityId });
    const stored = await storeRun(scope, result);

    res.json({ runId: stored.id, runAt: stored.run_at, scope, ...result });
  } catch (err) {
    console.error("Hindcast validation failed:", err);
    res.status(500).json({ error: "Hindcast validation failed" });
  }
});

router.get("/validation/latest", async (req, res) => {
  try {
    const { municipality } = req.query;
    const scope = municipality ? municipality.toLowerCase() : "all";
    let run = await getLatestRun(scope);
    if (!run && scope !== "all") {
      run = await getLatestRun("all");
    }
    if (!run) {
      return res.status(404).json({ error: "No validation run recorded yet" });
    }
    res.json({
      runId: run.id,
      runAt: run.run_at,
      scope: run.scope,
      holdoutYears: run.holdout_years,
      summary: run.summary,
      details: run.details,
    });
  } catch (err) {
    console.error("Failed to load validation run:", err);
    res.status(500).json({ error: "Failed to load validation results" });
  }
});

/** Returns id+name for all municipalities; feeds the account-request form's municipality picker. */
router.get("/municipalities", async (req, res) => {
  try {
    // hasData: true once municipality_analysis_cache has a row for this municipality
    const result = await pool.query(`
      SELECT m.id, m.name, (mac.municipality_id IS NOT NULL) AS "hasData"
      FROM municipalities m
      LEFT JOIN municipality_analysis_cache mac ON mac.municipality_id = m.id
      ORDER BY m.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching municipalities:", err);
    res.status(500).json({ error: "Failed to fetch municipalities" });
  }
});

/**
 * GET /api/shoreline/municipality/:municipality
 * Returns all yearly shoreline zone data for a municipality (uploaded data)
 */
router.get("/municipality/:municipality", async (req, res) => {
  try {
    const { municipality } = req.params;
    const { startYear, endYear, sourceType } = req.query;

    let query = `
      SELECT 
        sz.id,
        m.name as municipality,
        sz.year,
        sz.erosion_rate,
        sz.cumulative_erosion,
        sz.data_quality,
        sz.source_type,
        sz.created_at
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      JOIN municipalities m ON ca.municipality_id = m.id
      WHERE LOWER(m.name) = LOWER($1)
    `;

    const params = [municipality];
    let paramIndex = 2;

    if (startYear) {
      query += ` AND year >= $${paramIndex}`;
      params.push(parseInt(startYear));
      paramIndex++;
    }

    if (endYear) {
      query += ` AND year <= $${paramIndex}`;
      params.push(parseInt(endYear));
      paramIndex++;
    }

    if (sourceType) {
      query += ` AND source_type = $${paramIndex}`;
      params.push(sourceType);
      paramIndex++;
    }

    query += " ORDER BY year ASC";

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `No shoreline data found for municipality: ${municipality}`,
        municipality,
      });
    }

    const data = result.rows.map((row) => ({
      year: row.year,
      erosionRate: parseFloat(row.erosion_rate),
      cumulativeErosion: parseFloat(row.cumulative_erosion),
      dataQuality: row.data_quality,
      sourceType: row.source_type,
      recordId: row.id,
    }));

    res.json({
      municipality,
      recordCount: data.length,
      yearRange: {
        start: Math.min(...data.map((d) => d.year)),
        end: Math.max(...data.map((d) => d.year)),
      },
      data,
    });
  } catch (err) {
    console.error("Error fetching municipality shoreline data:", err);
    res.status(500).json({ error: "Failed to fetch shoreline data" });
  }
});

/**
 * GET /api/shoreline/municipality/:municipality/year/:year
 * Returns specific year zone data for a municipality (uploaded data)
 */
router.get("/municipality/:municipality/year/:year", async (req, res) => {
  try {
    const { municipality, year } = req.params;

    const result = await pool.query(
      `SELECT 
        sz.id,
        m.name as municipality,
        sz.year,
        sz.erosion_rate,
        sz.cumulative_erosion,
        sz.data_quality,
        sz.source_type,
        sz.created_at
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      JOIN municipalities m ON ca.municipality_id = m.id
      WHERE LOWER(m.name) = LOWER($1) AND sz.year = $2
      ORDER BY sz.created_at DESC
      LIMIT 1`,
      [municipality, parseInt(year)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `No data found for ${municipality} in year ${year}`,
      });
    }

    const row = result.rows[0];
    res.json({
      year: row.year,
      municipality: row.municipality,
      erosionRate: parseFloat(row.erosion_rate),
      cumulativeErosion: parseFloat(row.cumulative_erosion),
      dataQuality: row.data_quality,
      sourceType: row.source_type,
      recordId: row.id,
    });
  } catch (err) {
    console.error("Error fetching year data:", err);
    res.status(500).json({ error: "Failed to fetch year data" });
  }
});

/** Coastline geometry per area in a municipality (latest, or ?year=YYYY), plus year history and EPR so the frontend can gate Compare/Predict (needs 2+ years). */
router.get("/satellite-coastline/:municipality", async (req, res) => {
  try {
    const { municipality } = req.params;
    const { year } = req.query;

    const geomQuery = year
      ? `SELECT DISTINCT ON (sz.area_id)
          sz.year, sz.source_type, sz.geojson_data, ca.name AS specific_area,
          ca.projected_lrr, ca.lrr_confidence
         FROM shoreline_zones sz
         JOIN coastal_areas ca ON sz.area_id = ca.id
         JOIN municipalities m ON ca.municipality_id = m.id
         WHERE LOWER(m.name) = LOWER($1)
           AND sz.year = $2
           AND sz.geojson_data IS NOT NULL
         ORDER BY sz.area_id, sz.id DESC`
      : `SELECT DISTINCT ON (sz.area_id)
          sz.year, sz.source_type, sz.geojson_data, ca.name AS specific_area,
          ca.projected_lrr, ca.lrr_confidence
         FROM shoreline_zones sz
         JOIN coastal_areas ca ON sz.area_id = ca.id
         JOIN municipalities m ON ca.municipality_id = m.id
         WHERE LOWER(m.name) = LOWER($1)
           AND sz.source_type IN ('Satellite Analysis', 'Satellite Analysis - Baseline')
           AND sz.geojson_data IS NOT NULL
         ORDER BY sz.area_id, sz.year DESC, sz.id DESC`;

    const geomParams = year ? [municipality, parseInt(year)] : [municipality];
    const result = await pool.query(geomQuery, geomParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ hasSatelliteCoastline: false, areas: [] });
    }

    // year list only gates Compare/Predict (>=2 years); LRR is precomputed and just read here
    const yearsResult = await pool.query(
      `SELECT sz.area_id, ca.name AS specific_area, CAST(sz.year AS INTEGER) as year
       FROM shoreline_zones sz
       JOIN coastal_areas ca ON sz.area_id = ca.id
       JOIN municipalities m ON ca.municipality_id = m.id
       WHERE LOWER(m.name) = LOWER($1) AND sz.cumulative_erosion IS NOT NULL
       GROUP BY sz.area_id, ca.name, sz.year
       ORDER BY sz.area_id, sz.year ASC`,
      [municipality]
    );

    const yearsByArea = {};
    for (const row of yearsResult.rows) {
      const key = row.specific_area || "Main Coastline";
      if (!yearsByArea[key]) yearsByArea[key] = [];
      yearsByArea[key].push(row.year);
    }

    const areas = result.rows
      .map((row) => {
        const geom = row.geojson_data?.geometry;
        if (!geom || !geom.coordinates) return null;

        // Flatten MultiLineString or LineString to [[lat,lng], ...]
        let coords = [];
        if (geom.type === 'LineString') {
          coords = geom.coordinates.map(([lon, lat]) => [lat, lon]);
        } else if (geom.type === 'MultiLineString') {
          coords = geom.coordinates.flatMap(line => line.map(([lon, lat]) => [lat, lon]));
        }
        if (coords.length === 0) return null;

        const yearsAvailable = yearsByArea[row.specific_area || "Main Coastline"] || [];
        const hasSufficientData = yearsAvailable.length >= 3;

        return {
          specificArea: row.specific_area,
          year: row.year,
          sourceType: row.source_type,
          isBaseline: row.source_type === 'Satellite Analysis - Baseline',
          coastlinePoints: simplifyCoastline(coords, 5),
          yearsAvailable,
          hasSufficientData,
          lrrRate: row.projected_lrr !== null ? parseFloat(row.projected_lrr) : null,
          lrrConfidence: row.lrr_confidence !== null ? parseFloat(row.lrr_confidence) : null,
        };
      })
      .filter(Boolean);

    if (areas.length === 0) {
      return res.status(404).json({ hasSatelliteCoastline: false, areas: [] });
    }

    res.json({
      hasSatelliteCoastline: true,
      municipality,
      requestedYear: year ? parseInt(year) : null,
      areas,
    });
  } catch (err) {
    console.error("Error fetching satellite coastline:", err);
    res.status(500).json({ error: "Failed to fetch satellite coastline" });
  }
});

/** LRR-based retreat estimate for Predict/Compare — reads stored projected_lrr and multiplies by year gap. ?baseYear=X&targetYear=Y&area=<specificArea> (area optional); estimatedRetreat is always positive. */
router.get("/municipality/:municipality/shoreline-estimate", async (req, res) => {
  try {
    const { municipality } = req.params;
    const baseYear = parseInt(req.query.baseYear);
    const targetYear = parseInt(req.query.targetYear);
    const { area } = req.query;

    if (!Number.isInteger(baseYear) || !Number.isInteger(targetYear)) {
      return res.status(400).json({ error: "baseYear and targetYear are required integers" });
    }

    const municipalityId = await getMunicipalityId(municipality);
    if (!municipalityId) {
      return res.status(404).json({ error: `Unknown municipality: ${municipality}` });
    }

    let areaRows;
    if (area) {
      const areaId = await findAreaId(pool, municipalityId, area);
      if (!areaId) {
        return res.status(400).json({ error: `Area "${area}" has insufficient data to estimate` });
      }
      const result = await pool.query(
        `SELECT id, name, projected_lrr, lrr_confidence, risk_level FROM coastal_areas WHERE id = $1`,
        [areaId]
      );
      areaRows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id, name, projected_lrr, lrr_confidence, risk_level FROM coastal_areas WHERE municipality_id = $1`,
        [municipalityId]
      );
      areaRows = result.rows;
    }

    const targetAreas = areaRows.filter((row) => row.projected_lrr !== null);
    if (targetAreas.length === 0) {
      return res.status(400).json({
        error: area
          ? `Area "${area}" has insufficient data to estimate`
          : "No areas with sufficient data to estimate",
      });
    }

    const segments = targetAreas.map((row) => {
      const projectedLrr = parseFloat(row.projected_lrr);
      return {
        area: row.name,
        erosionRate: projectedLrr,
        retreat: Math.abs(projectedLrr * (targetYear - baseYear)),
        riskLevel: row.risk_level,
        modelFit: row.lrr_confidence !== null ? parseFloat(row.lrr_confidence) : null,
      };
    });

    const avgLrr = segments.reduce((sum, s) => sum + s.erosionRate, 0) / segments.length;
    const avgRetreat = segments.reduce((sum, s) => sum + s.retreat, 0) / segments.length;
    const fits = segments.filter((s) => s.modelFit !== null).map((s) => s.modelFit);
    const avgFit = fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : null;

    res.json({
      predictedYear: targetYear.toString(),
      estimatedRetreat: avgRetreat.toFixed(1),
      estimatedRetreatUnit: "m",
      projectedLRR: Math.abs(avgLrr).toFixed(2),
      projectedLRRUnit: "m/year",
      modelFit: avgFit !== null ? parseFloat(avgFit.toFixed(2)) : null,
      segments,
    });
  } catch (err) {
    console.error("Error computing shoreline estimate:", err);
    res.status(500).json({ error: "Failed to compute shoreline estimate" });
  }
});


/** POST /api/shoreline/seed — admin: seeds simulated erosion data for testing (skips if data already exists). */
router.post("/seed", verifyToken, verifyAdmin, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Seeding simulated data is disabled in production" });
  }
  // single client inside BEGIN/COMMIT so a mid-loop failure rolls back entirely
  const client = await pool.connect();
  try {
    const { municipality, startYear = 2015, endYear = 2025, skipIfExists = true } = req.body;

    if (!municipality) {
      return res.status(400).json({ error: "municipality required" });
    }

    await client.query("BEGIN");

    const municipalityId = await getOrCreateMunicipalityId(client, municipality);

    const existing = await client.query(
      "SELECT COUNT(*) as count FROM shoreline_zones WHERE area_id IN (SELECT id FROM coastal_areas WHERE municipality_id = $1)",
      [municipalityId]
    );

    if (existing.rows[0].count > 0) {
      await client.query("ROLLBACK");
      if (skipIfExists) {
        return res.json({
          message: `Data already exists for ${municipality}. Seeding skipped.`,
          municipality,
          skipped: true,
        });
      } else {
        return res.status(400).json({
          error: `Data already exists for ${municipality}. Set skipIfExists=false to force reseed.`,
        });
      }
    }

    const inserted = [];
    const areaId = await resolveAreaId(client, municipalityId, "Main Coastline");

    // seeded randomness so the same municipality always gets the same values
    const seedHash = municipality.toLowerCase()
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // Base erosion rate: 0.5-1.5 m/year (realistic for Philippine coasts)
    const baseRate = 0.5 + ((seedHash % 100) / 100);

    let cumulativeErosion = 0;

    for (let year = startYear; year <= endYear; year++) {
      const yearVariation = Math.sin(year * 0.5 + seedHash) * 0.3;
      const erosionRate = Math.max(0.1, baseRate + yearVariation);
      cumulativeErosion += erosionRate;

      const result = await client.query(
        `INSERT INTO shoreline_zones
         (area_id, year, erosion_rate, cumulative_erosion, data_quality, source_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          areaId,
          year,
          erosionRate.toFixed(2),
          cumulativeErosion.toFixed(2),
          "Simulated",
          "Seed Data",
          req.user.id,
        ]
      );

      inserted.push({
        year,
        erosionRate: erosionRate.toFixed(2),
        cumulativeErosion: cumulativeErosion.toFixed(2),
        recordId: result.rows[0].id,
      });
    }

    await client.query("COMMIT");

    await invalidateMunicipalityCache(municipality);

    res.json({
      success: true,
      message: `Seeded ${municipality} with ${inserted.length} years of sample data (${startYear}-${endYear})`,
      municipality,
      yearRange: {
        start: startYear,
        end: endYear,
      },
      recordCount: inserted.length,
      records: inserted,
      note: "Replace this with actual data as it becomes available"
    });

    logAction(null, {
      actor: req.user,
      action: "sample_data_seeded",
      category: "data",
      severity: "normal",
      targetType: "municipality",
      targetId: municipality,
      details: { municipality, startYear, endYear, recordCount: inserted.length },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error seeding data:", err);
    res.status(500).json({ error: "Failed to seed data", details: err.message });
  } finally {
    client.release();
  }
});

/** Admin: insert or update a single year of shoreline data without a file upload. */
router.post("/admin/insert-yearly", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { 
      municipality, 
      year, 
      erosion_rate, 
      cumulative_erosion, 
      specific_area = "Main Coastline",
      data_quality = "Field Survey",
      source_type = "Manual Entry"
    } = req.body;

    if (!municipality || !year || erosion_rate === undefined) {
      return res.status(400).json({
        error: "Missing required fields: municipality, year, erosion_rate",
      });
    }

    const yearNum = parseInt(year);
    const rateNum = parseFloat(erosion_rate);
    const cumNum = cumulative_erosion !== undefined ? parseFloat(cumulative_erosion) : null;

    if (isNaN(yearNum) || isNaN(rateNum)) {
      return res.status(400).json({
        error: "Invalid values: year and erosion_rate must be numbers",
      });
    }

    const municipalityId = await getOrCreateMunicipalityId(pool, municipality);
    const areaId = await resolveAreaId(pool, municipalityId, specific_area);

    const existing = await pool.query(
      `SELECT id FROM shoreline_zones
       WHERE area_id = $1
       AND year = $2`,
      [areaId, yearNum]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE shoreline_zones
         SET erosion_rate = $1,
             cumulative_erosion = $2,
             data_quality = $3,
             source_type = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id, area_id, year, erosion_rate, cumulative_erosion`,
        [rateNum, cumNum, data_quality, source_type, existing.rows[0].id]
      );

      await invalidateMunicipalityCache(municipality);

      res.json({
        success: true,
        message: `Updated ${municipality} data for year ${yearNum}. Cache invalidated.`,
        action: "updated",
        data: result.rows[0]
      });

      logAction(null, {
        actor: req.user,
        action: "shoreline_year_data_saved",
        category: "data",
        severity: "normal",
        targetType: "shoreline_zones",
        targetId: result.rows[0].id,
        details: { municipality, year: yearNum, specific_area, dbAction: "updated" },
      });
      return;
    } else {
      result = await pool.query(
        `INSERT INTO shoreline_zones
         (area_id, year, erosion_rate, cumulative_erosion, data_quality, source_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, area_id, year, erosion_rate, cumulative_erosion`,
        [areaId, yearNum, rateNum, cumNum, data_quality, source_type, req.user.id]
      );

      await invalidateMunicipalityCache(municipality);

      res.json({
        success: true,
        message: `Added ${municipality} data for year ${yearNum}. Cache invalidated.`,
        action: "inserted",
        data: result.rows[0]
      });

      logAction(null, {
        actor: req.user,
        action: "shoreline_year_data_saved",
        category: "data",
        severity: "normal",
        targetType: "shoreline_zones",
        targetId: result.rows[0].id,
        details: { municipality, year: yearNum, specific_area, dbAction: "inserted" },
      });
      return;
    }
  } catch (err) {
    console.error("Error inserting yearly data:", err);
    res.status(500).json({ 
      error: "Failed to insert yearly data", 
      details: err.message 
    });
  }
});

/** Redirects callers to POST /api/admin/uploads/upload — CSV handled there via multer. */
/** GET .../municipality/:municipality/latest — most recent year of data for a municipality; feeds dashboard cards. */
router.get("/municipality/:municipality/latest", async (req, res) => {
  try {
    const { municipality } = req.params;

    const result = await pool.query(
      `SELECT
        m.name as municipality,
        sz.year,
        sz.erosion_rate,
        sz.cumulative_erosion,
        ca.name as specific_area,
        sz.data_quality,
        sz.source_type,
        sz.created_at
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      JOIN municipalities m ON ca.municipality_id = m.id
      WHERE LOWER(m.name) = LOWER($1)
      ORDER BY sz.year DESC, sz.created_at DESC
      LIMIT 1`,
      [municipality]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `No data found for municipality: ${municipality}`,
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error fetching latest data:", err);
    res.status(500).json({ error: "Failed to fetch latest data" });
  }
});

/** Bataan-wide summary, aggregated live from municipality_analysis_cache each request (cheap at ~12 rows). */
router.get("/bataan/summary", async (req, res) => {
  try {
    const summary = await getBataanSummary();

    if (!summary) {
      return res.status(404).json({
        message: "No Bataan summary data available",
      });
    }

    res.json(summary);
  } catch (err) {
    console.error("Error fetching Bataan summary:", err);
    res.status(500).json({ error: "Failed to fetch Bataan summary" });
  }
});

/** Same shape as /bataan/summary, scoped to one municipality; feeds the municipal-tier Dashboard. */
router.get("/municipality/:municipality/summary", async (req, res) => {
  try {
    const { municipality } = req.params;
    const municipalityId = await getMunicipalityId(municipality);

    if (!municipalityId) {
      return res.status(404).json({ message: `Municipality not found: ${municipality}` });
    }

    const summary = await getMunicipalitySummary(municipalityId);
    if (!summary) {
      return res.status(404).json({ message: `No summary data available for ${municipality}` });
    }

    res.json(summary);
  } catch (err) {
    console.error("Error fetching municipality summary:", err);
    res.status(500).json({ error: "Failed to fetch municipality summary" });
  }
});

/** All zones/segments across all municipalities, with risk classification, for the Reports page. */
router.get("/bataan/all-zones", async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ON (sz.id)
        sz.id,
        m.name as municipality,
        sz.year,
        sz.erosion_rate,
        sz.cumulative_erosion,
        sz.data_quality,
        sz.source_type,
        ca.name as specific_area,
        sz.created_at
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      JOIN municipalities m ON ca.municipality_id = m.id
      ORDER BY sz.id
    `;

    const result = await pool.query(query);

    const zones = result.rows.map((row) => {
      const erosionRate = row.erosion_rate !== null ? parseFloat(row.erosion_rate) : null;
      const riskLevel = classifyErosionRisk(erosionRate);

      return {
        id: row.id,
        municipality: row.municipality,
        year: row.year,
        erosionRate: erosionRate,
        cumulativeErosion: row.cumulative_erosion !== null ? parseFloat(row.cumulative_erosion) : null,
        dataQuality: row.data_quality || "Unknown",
        sourceType: row.source_type || "Unknown",
        specificArea: row.specific_area,
        name: row.specific_area || `Zone ${row.id}`,
        riskLevel: riskLevel,
      };
    });

    console.log(`✓ Fetched ${zones.length} zones across all municipalities for Reports (deduplicated)`);
    res.json({
      zones: zones,
      totalCount: zones.length,
    });
  } catch (err) {
    console.error("Error fetching all zones:", err.message);
    res.status(500).json({ error: "Failed to fetch zones", details: err.message });
  }
});

/** Zones/segments for a municipality, with geometries and risk classification. */
router.get("/municipality/:municipality/zones", async (req, res) => {
  try {
    const { municipality } = req.params;
    const { year } = req.query;

    let query = `
      SELECT
        sz.id,
        m.name as municipality,
        sz.year,
        sz.erosion_rate,
        sz.cumulative_erosion,
        sz.data_quality,
        sz.source_type,
        ca.name as specific_area,
        sz.geojson_data,
        sz.created_at
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      JOIN municipalities m ON ca.municipality_id = m.id
      WHERE LOWER(m.name) = LOWER($1)
    `;

    const params = [municipality];
    let paramIndex = 2;

    if (year) {
      query += ` AND year = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }

    query += " ORDER BY year DESC, erosion_rate DESC";

    const result = await pool.query(query, params);

    const zones = result.rows.map((row) => {
      const erosionRate = row.erosion_rate !== null ? parseFloat(row.erosion_rate) : null;
      const riskLevel = classifyErosionRisk(erosionRate);

      return {
        id: row.id,
        municipality: row.municipality,
        year: row.year,
        erosionRate: erosionRate,
        cumulativeErosion: parseFloat(row.cumulative_erosion),
        dataQuality: row.data_quality,
        sourceType: row.source_type,
        specificArea: row.specific_area,
        geojsonData: row.geojson_data,
        riskLevel: riskLevel,
      };
    });

    // empty array is a valid response, not an error
    res.json({
      municipality,
      zoneCount: zones.length,
      year: year || "all",
      zones,
      dataSource: zones.length > 0 ? "zones" : "empty",
    });
  } catch (err) {
    console.error("Error fetching zones:", err);
    res.status(500).json({ 
      error: "Failed to fetch zones",
      municipality: req.params.municipality,
      zones: []
    });
  }
});

/** Distinct coastal area names for a municipality, for populating upload dropdowns. */
router.get("/municipality/:municipality/areas", async (req, res) => {
  try {
    const { municipality } = req.params;

    // bounds: most recent uploaded image's bounds, if any — lets the frontend pre-fill NDWI generation bounds
    const result = await pool.query(
      `SELECT ca.id, ca.name,
              (SELECT bounds FROM satellite_imagery WHERE area_id = ca.id ORDER BY year DESC LIMIT 1) AS bounds
       FROM coastal_areas ca
       JOIN municipalities m ON m.id = ca.municipality_id
       WHERE LOWER(m.name) = LOWER($1)
       ORDER BY ca.name`,
      [municipality]
    );

    res.json({ areas: result.rows });
  } catch (err) {
    console.error("Error fetching coastal areas:", err.message);
    res.status(500).json({ error: "Failed to fetch coastal areas", areas: [] });
  }
});

/** LineString length in km; GeoJSON coordinates are [lon, lat]. */
function calculateLineStringLength(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0;

  const toRadians = (deg) => deg * (Math.PI / 180);
  const R = 6371; // Earth radius in km

  let totalLength = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalLength += R * c;
  }

  return totalLength;
}

/** Erosion analysis card data, read from the eagerly-maintained analysis cache. */
router.get("/municipality/:municipality/analysis", async (req, res) => {
  try {
    const { municipality } = req.params;
    const currentYear = new Date().getFullYear();

    const municipalityId = await getMunicipalityId(municipality);
    if (!municipalityId) {
      return res.status(404).json({ message: `Municipality not found: ${municipality}` });
    }

    // reads the cache row; not recomputed here
    const cachedAnalysis = await getMunicipalityAnalysis(municipalityId);

    if (!cachedAnalysis) {
      return res.status(404).json({
        message: `No analysis data found for ${municipality}`,
      });
    }

    // Prediction Result card is fed client-side, not included here
    res.json({
      erosionData: {
        coastlineLength: cachedAnalysis.coastlineLength,
        affectedArea: cachedAnalysis.affectedArea,
        riskLevel: cachedAnalysis.riskLevel,
        municipalityName: municipality
      },
      metadata: {
        analysisYear: cachedAnalysis.analysisYear,
        dataYearNote: cachedAnalysis.analysisYear < currentYear ? 
          `(Latest available: ${cachedAnalysis.analysisYear})` : undefined,
        erosionRate: cachedAnalysis.avgErosionRate,
        cumulativeErosion: cachedAnalysis.cumulativeErosion,
        dataQuality: cachedAnalysis.dataQuality,
        zoneCount: cachedAnalysis.zoneCount,
        dataSource: "Cache"
      }
    });
  } catch (err) {
    console.error("❌ Error fetching analysis for " + municipality + ":", err.message);
    res.status(500).json({ error: "Failed to fetch analysis data", details: err.message });
  }
});

/** DELETE .../municipality/:municipality — admin: deletes all shoreline_zones data for a municipality. */
router.delete("/municipality/:municipality", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { municipality } = req.params;

    const result = await pool.query(
      `DELETE FROM shoreline_zones
       WHERE area_id IN (
         SELECT ca.id FROM coastal_areas ca
         JOIN municipalities m ON ca.municipality_id = m.id
         WHERE LOWER(m.name) = LOWER($1)
       )`,
      [municipality]
    );

    await invalidateMunicipalityCache(municipality);

    res.json({
      message: `Deleted ${result.rowCount} zone records for ${municipality}`,
      deleted: result.rowCount,
    });

    logAction(null, {
      actor: req.user,
      action: "shoreline_zones_bulk_deleted",
      category: "data",
      severity: "critical",
      targetType: "shoreline_zones",
      targetId: municipality,
      details: { municipality, deleted: result.rowCount },
    });
  } catch (err) {
    console.error("Error deleting data:", err);
    res.status(500).json({ error: "Failed to delete data" });
  }
});

/** POST .../cache/invalidate — admin: force cache invalidation for a municipality. */
router.post("/cache/invalidate", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { municipality } = req.body;

    if (!municipality) {
      return res.status(400).json({ error: "municipality parameter required" });
    }

    await invalidateMunicipalityCache(municipality);

    res.json({
      message: `Cache invalidated for ${municipality}`,
      municipality,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error invalidating cache:", err);
    res.status(500).json({ error: "Failed to invalidate cache" });
  }
});

/** POST .../cache/invalidate-all — admin: force cache refresh for all municipalities. */
router.post("/cache/invalidate-all", verifyToken, verifyAdmin, async (req, res) => {
  try {
    // refreshes every municipality's derived values, doesn't just mark stale
    await invalidateAllCaches();

    res.json({
      message: "All caches refreshed",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error refreshing all caches:", err);
    res.status(500).json({ error: "Failed to refresh caches" });
  }
});

/** Cache row counts. Every row is fresh by construction (recomputed synchronously on write). */
router.get("/cache/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [analysisCache, municipalityCount] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM municipality_analysis_cache`),
      pool.query(`SELECT COUNT(*) as count FROM municipalities`),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      caches: {
        municipality_analysis: {
          rows: parseInt(analysisCache.rows[0].count),
          municipalities: parseInt(municipalityCount.rows[0].count)
        }
      }
    });
  } catch (err) {
    console.error("Error fetching cache status:", err);
    res.status(500).json({ error: "Failed to fetch cache status" });
  }
});

module.exports = router;
