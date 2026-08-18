// Cache service: raw data -> calculations -> cache tables -> API response.
// Derived values are recomputed and stored eagerly on every write; reads are
// plain SELECTs, recomputing only if a row is unexpectedly missing.
// getBataanSummary is the exception - it aggregates live, no cache table of its own.

const logger = require("../utils/logger");
const pool = require("../db");
const { classifyErosionRisk } = require("./riskClassification");
const { calculateLRR, calculateRobustLRR } = require("./eprCalculator");
const { MIN_YEARS_FOR_LRR } = require("../config/constants");

// Row predicate for active, satellite-detected zones only (excludes GeoJSON/CSV/manual/seed rows).
// @param {string} alias - table alias with trailing dot (e.g. "sz."), or "" if unjoined.
function activeSatelliteZones(alias = "") {
  return `${alias}source_type LIKE 'Satellite Analysis%' AND ${alias}active`;
}

// Get municipality ID from name; returns null if not found.
async function getMunicipalityId(municipalityName) {
  try {
    const result = await pool.query(
      `SELECT id FROM municipalities WHERE LOWER(name) = LOWER($1)`,
      [municipalityName]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (err) {
    logger.error(`Error finding municipality ID for ${municipalityName}:`, err.message);
    return null;
  }
}

// Line string length (km) via Haversine formula.
// @param {Array} coordinates - [lng, lat] pairs, GeoJSON order
function calculateLineStringLength(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0;

  let totalDistance = 0;
  const R = 6371; // Earth's radius in km

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[i + 1];

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalDistance += R * c;
  }

  return totalDistance;
}

// Tallies risk-tier counts across erosion rates; single source of truth for risk-distribution numbers.
function tallyRiskTiers(erosionRates) {
  const counts = { VERY_HIGH: 0, HIGH: 0, MODERATE: 0, LOW: 0, VERY_LOW: 0 };
  for (const rate of erosionRates) {
    if (rate === null || rate === undefined) continue;
    const tier = classifyErosionRisk(rate);
    if (tier in counts) counts[tier]++;
  }
  return counts;
}

// snake_case shape for municipality_analysis_cache.risk_distribution
function tierCountsToStorageJson(counts) {
  return {
    very_high: counts.VERY_HIGH || 0,
    high: counts.HIGH || 0,
    moderate: counts.MODERATE || 0,
    low: counts.LOW || 0,
    very_low: counts.VERY_LOW || 0,
  };
}

// Converts stored risk_distribution JSON to the camelCase shape callers expect.
function riskDistributionFromStorage(stored) {
  const d = stored || {};
  return {
    veryHighRisk: d.very_high || 0,
    highRisk: d.high || 0,
    moderateRisk: d.moderate || 0,
    lowRisk: d.low || 0,
    veryLowRisk: d.very_low || 0,
  };
}

// Recomputes a municipality's aggregate erosion metrics and risk distribution, stores in municipality_analysis_cache.
async function computeAndStoreMunicipalityAnalysis(municipalityId) {
  try {
    const currentYear = new Date().getFullYear();
    let analysisYear = currentYear;

    const result = await pool.query(
      `SELECT
        sz.year,
        COUNT(*) as zone_count,
        AVG(CAST(sz.erosion_rate AS FLOAT)) as avg_erosion_rate,
        AVG(CAST(sz.cumulative_erosion AS FLOAT)) as avg_cumulative_erosion,
        ARRAY_AGG(CAST(sz.erosion_rate AS FLOAT)) as erosion_rates,
        ARRAY_AGG(sz.geojson_data) as geojson_samples,
        STRING_AGG(DISTINCT sz.data_quality, ', ') as data_qualities,
        STRING_AGG(DISTINCT sz.source_type, ', ') as data_sources
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      WHERE ca.municipality_id = $1 AND sz.year = $2
        AND ${activeSatelliteZones("sz.")}
      GROUP BY sz.year`,
      [municipalityId, currentYear]
    );

    // If no current year, get latest
    let processedData = null;
    if (result.rows.length === 0) {
      const latestResult = await pool.query(
        `SELECT
          sz.year,
          COUNT(*) as zone_count,
          AVG(CAST(sz.erosion_rate AS FLOAT)) as avg_erosion_rate,
          AVG(CAST(sz.cumulative_erosion AS FLOAT)) as avg_cumulative_erosion,
          ARRAY_AGG(CAST(sz.erosion_rate AS FLOAT)) as erosion_rates,
          ARRAY_AGG(sz.geojson_data) as geojson_samples,
          STRING_AGG(DISTINCT sz.data_quality, ', ') as data_qualities,
          STRING_AGG(DISTINCT sz.source_type, ', ') as data_sources
        FROM shoreline_zones sz
        JOIN coastal_areas ca ON sz.area_id = ca.id
        WHERE ca.municipality_id = $1
          AND ${activeSatelliteZones("sz.")}
        GROUP BY sz.year
        ORDER BY sz.year DESC
        LIMIT 1`,
        [municipalityId]
      );

      if (latestResult.rows.length === 0) {
        // No satellite-detected data at all — remove any stale cache row.
        await pool.query(
          `DELETE FROM municipality_analysis_cache WHERE municipality_id = $1`,
          [municipalityId]
        );
        return null;
      }

      processedData = latestResult.rows[0];
      analysisYear = processedData.year;
    } else {
      processedData = result.rows[0];
    }

    const erosionRate = parseFloat(processedData.avg_erosion_rate || 0);
    let coastlineLength = 2.5; // Default

    if (processedData.geojson_samples && Array.isArray(processedData.geojson_samples)) {
      try {
        for (const geojson of processedData.geojson_samples.slice(0, 3)) {
          if (!geojson) continue;

          const geometry = geojson.geometry || geojson;
          if (geometry && geometry.coordinates) {
            if (geometry.type === "LineString") {
              const length = calculateLineStringLength(geometry.coordinates);
              coastlineLength = Math.max(coastlineLength, length);
            } else if (geometry.type === "MultiLineString") {
              for (const lineCoords of geometry.coordinates) {
                coastlineLength += calculateLineStringLength(lineCoords);
              }
            }
          }
        }
      } catch (e) {
        logger.warn(`Error calculating coastline for municipality ${municipalityId}:`, e.message);
      }
    }

    const cumulativeErosion = parseFloat(processedData.avg_cumulative_erosion || 0);
    const affectedArea = Math.abs(cumulativeErosion) * coastlineLength;
    const riskLevel = classifyErosionRisk(erosionRate);
    const tierCounts = tallyRiskTiers(processedData.erosion_rates || []);

    await pool.query(
      `INSERT INTO municipality_analysis_cache
        (municipality_id, analysis_year, coastline_length, affected_area, avg_erosion_rate,
         cumulative_erosion, zone_count, risk_level, data_quality, data_sources,
         risk_distribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (municipality_id) DO UPDATE SET
        analysis_year = $2,
        coastline_length = $3,
        affected_area = $4,
        avg_erosion_rate = $5,
        cumulative_erosion = $6,
        zone_count = $7,
        risk_level = $8,
        data_quality = $9,
        data_sources = $10,
        risk_distribution = $11,
        updated_at = CURRENT_TIMESTAMP`,
      [
        municipalityId,
        analysisYear,
        coastlineLength.toFixed(4),
        affectedArea.toFixed(4),
        erosionRate.toFixed(4),
        cumulativeErosion.toFixed(4),
        processedData.zone_count,
        riskLevel,
        processedData.data_qualities || "Mixed",
        processedData.data_sources || "",
        JSON.stringify(tierCountsToStorageJson(tierCounts)),
      ]
    );

    return {
      coastlineLength: coastlineLength.toFixed(2),
      affectedArea: affectedArea.toFixed(2),
      avgErosionRate: erosionRate.toFixed(2),
      riskLevel,
      zoneCount: processedData.zone_count,
      analysisYear,
      riskDistribution: riskDistributionFromStorage(tierCountsToStorageJson(tierCounts)),
      dataSource: "Database",
    };
  } catch (err) {
    logger.error("Error in computeAndStoreMunicipalityAnalysis:", err.message);
    throw err;
  }
}

// Reads the cache row; recomputes only if missing (e.g. first-ever analysis).
async function getMunicipalityAnalysis(municipalityId) {
  try {
    const cached = await pool.query(
      `SELECT * FROM municipality_analysis_cache WHERE municipality_id = $1`,
      [municipalityId]
    );

    if (cached.rows.length === 0) {
      return computeAndStoreMunicipalityAnalysis(municipalityId);
    }

    const row = cached.rows[0];
    return {
      coastlineLength: Number(row.coastline_length),
      affectedArea: Number(row.affected_area),
      avgErosionRate: Number(row.avg_erosion_rate),
      riskLevel: row.risk_level,
      zoneCount: row.zone_count,
      analysisYear: row.analysis_year,
      dataQuality: row.data_quality,
      dataSources: row.data_sources,
      riskDistribution: riskDistributionFromStorage(row.risk_distribution),
      dataSource: "Database (Cached)",
    };
  } catch (err) {
    logger.error("Error in getMunicipalityAnalysis:", err.message);
    throw err;
  }
}

// Province-wide summary, aggregated live from municipality_analysis_cache.
// avg_erosion_rate is zone-count-weighted across municipalities.
async function getBataanSummary() {
  try {
    const latestYear = new Date().getFullYear();

    const result = await pool.query(
      `SELECT
        mac.municipality_id,
        m.name as municipality_name,
        CAST(mac.avg_erosion_rate AS FLOAT) as avg_erosion_rate,
        mac.zone_count,
        mac.risk_distribution
      FROM municipality_analysis_cache mac
      JOIN municipalities m ON mac.municipality_id = m.id
      WHERE mac.analysis_year = $1`,
      [latestYear]
    );

    if (result.rows.length === 0) return null;

    const municipalityNames = new Set();
    const tierCounts = { VERY_HIGH: 0, HIGH: 0, MODERATE: 0, LOW: 0, VERY_LOW: 0 };
    let weightedSum = 0;
    let totalZones = 0;
    for (const row of result.rows) {
      municipalityNames.add(row.municipality_name);
      const d = row.risk_distribution || {};
      tierCounts.VERY_HIGH += d.very_high || 0;
      tierCounts.HIGH += d.high || 0;
      tierCounts.MODERATE += d.moderate || 0;
      tierCounts.LOW += d.low || 0;
      tierCounts.VERY_LOW += d.very_low || 0;
      if (row.avg_erosion_rate !== null && row.avg_erosion_rate !== undefined && row.zone_count) {
        weightedSum += row.avg_erosion_rate * row.zone_count;
        totalZones += row.zone_count;
      }
    }
    const avgErosionRate = totalZones > 0 ? weightedSum / totalZones : null;

    return {
      totalMunicipalities: municipalityNames.size,
      riskDistribution: riskDistributionFromStorage(tierCountsToStorageJson(tierCounts)),
      avgErosionRate,
      municipalities: [...municipalityNames].sort(),
    };
  } catch (err) {
    logger.error("Error in getBataanSummary:", err.message);
    throw err;
  }
}

// Same shape as getBataanSummary(), scoped to one municipality.
async function getMunicipalitySummary(municipalityId) {
  try {
    const result = await pool.query(
      `SELECT risk_distribution, avg_erosion_rate, zone_count
       FROM municipality_analysis_cache WHERE municipality_id = $1`,
      [municipalityId]
    );

    if (result.rows.length === 0) {
      const computed = await computeAndStoreMunicipalityAnalysis(municipalityId);
      if (!computed) return null;
      return {
        totalMunicipalities: 1,
        riskDistribution: computed.riskDistribution,
        avgErosionRate: Number(computed.avgErosionRate) || 0,
        zoneCount: computed.zoneCount,
      };
    }

    const row = result.rows[0];
    return {
      totalMunicipalities: 1,
      riskDistribution: riskDistributionFromStorage(row.risk_distribution),
      avgErosionRate: row.avg_erosion_rate !== null ? Number(row.avg_erosion_rate) : 0,
      zoneCount: row.zone_count,
    };
  } catch (err) {
    logger.error("Error in getMunicipalitySummary:", err.message);
    throw err;
  }
}

// Recomputes LRR regression (projected_lrr, lrr_confidence, risk_level) for every
// coastal_area under a municipality. History is fetched in one batched query; updates stay per-area.
async function recomputeMunicipalityAreaLRR(municipalityId) {
  const areasResult = await pool.query(
    `SELECT id FROM coastal_areas WHERE municipality_id = $1`,
    [municipalityId]
  );
  const areaIds = areasResult.rows.map((row) => row.id);
  if (areaIds.length === 0) return;

  const historyResult = await pool.query(
    `SELECT area_id, CAST(year AS INTEGER) as year, AVG(CAST(cumulative_erosion AS FLOAT)) as cumulative_erosion
     FROM shoreline_zones
     WHERE area_id = ANY($1::int[]) AND cumulative_erosion IS NOT NULL
       AND ${activeSatelliteZones()}
     GROUP BY area_id, year
     ORDER BY area_id, year ASC`,
    [areaIds]
  );

  const historyByArea = new Map(areaIds.map((id) => [id, []]));
  for (const row of historyResult.rows) {
    historyByArea.get(row.area_id).push({
      year: row.year,
      value: parseFloat(row.cumulative_erosion),
    });
  }

  for (const areaId of areaIds) {
    const history = historyByArea.get(areaId);

    if (history.length >= MIN_YEARS_FOR_LRR) {
      const regression = calculateRobustLRR(history);
      const projectedLrr = parseFloat(regression.slope.toFixed(4));
      const lrrConfidence = parseFloat(regression.confidence.toFixed(2));
      const riskLevel = classifyErosionRisk(projectedLrr);

      await pool.query(
        `UPDATE coastal_areas
         SET projected_lrr = $1, lrr_confidence = $2, risk_level = $3, lrr_calculated_at = NOW(),
             lrr_ci95 = $5, lrr_p_value = $6, lrr_outliers_removed = $7
         WHERE id = $4`,
        [
          projectedLrr,
          lrrConfidence,
          riskLevel,
          areaId,
          regression.ci95 !== null ? parseFloat(regression.ci95.toFixed(4)) : null,
          regression.pValue !== null ? parseFloat(regression.pValue.toFixed(6)) : null,
          regression.outliersRemoved,
        ]
      );
    } else {
      // Below the 3-year regression threshold — clear any previously-computed value.
      await pool.query(
        `UPDATE coastal_areas
         SET projected_lrr = NULL, lrr_confidence = NULL, risk_level = NULL, lrr_calculated_at = NULL, lrr_ci95 = NULL, lrr_p_value = NULL, lrr_outliers_removed = NULL
         WHERE id = $1`,
        [areaId]
      );
    }
  }
}

// Refreshes per-area LRR/risk plus the municipality_analysis_cache row.
async function refreshMunicipalityDerived(municipalityId) {
  await recomputeMunicipalityAreaLRR(municipalityId);
  await computeAndStoreMunicipalityAnalysis(municipalityId);
}

// Refresh cache for a municipality by name; recomputes immediately.
async function invalidateMunicipalityCache(municipality) {
  try {
    const municipalityId = await getMunicipalityId(municipality);
    if (!municipalityId) {
      logger.warn(`Municipality not found for cache refresh: ${municipality}`);
      return;
    }

    await refreshMunicipalityDerived(municipalityId);
  } catch (err) {
    logger.error("Error refreshing cache:", err.message);
    throw err;
  }
}

// Refresh derived values for every municipality (admin "invalidate all").
async function invalidateAllCaches() {
  const { rows } = await pool.query(`SELECT id FROM municipalities`);
  for (const { id } of rows) {
    await refreshMunicipalityDerived(id);
  }
}

module.exports = {
  getMunicipalityAnalysis,
  computeAndStoreMunicipalityAnalysis,
  getBataanSummary,
  getMunicipalitySummary,
  invalidateMunicipalityCache,
  invalidateAllCaches,
  refreshMunicipalityDerived,
  recomputeMunicipalityAreaLRR,
  calculateLineStringLength,
  getMunicipalityId,
};
