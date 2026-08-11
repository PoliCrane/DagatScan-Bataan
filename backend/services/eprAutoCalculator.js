/**
 * Erosion Rate Auto-Calculation Service
 * Automatically computes EPR for features missing erosionRate by comparing with previous year data
 * 
 * Usage:
 *   const { autoCalculateErosionRates } = require("./eprAutoCalculator");
 *   await autoCalculateErosionRates(dbClient, features, municipality, year);
 */

const { calculateEPR } = require("./eprCalculator");
const { findAreaId } = require("./coastalAreas");

/**
 * Automatically calculate erosion rates and cumulative erosion for features missing them
 * Queries database for previous year data and computes EPR via haversine distance
 * Also calculates cumulative erosion from baseline (earliest available) year
 * 
 * @param {object} client - PostgreSQL client from pool.connect()
 * @param {array} features - GeoJSON features array
 * @param {string} municipality - Municipality name
 * @param {number} year - Current year
 * @returns {void} - Modifies features in-place, adding erosionRate and cumulativeErosion to properties
 */
async function autoCalculateErosionRates(client, features, municipality, year) {
  console.log(
    `\n📋 Auto-calculating EPR for ${municipality} (${year}) - ${features.length} features`
  );

  const muniResult = await client.query(
    `SELECT id FROM municipalities WHERE LOWER(name) = LOWER($1)`,
    [municipality]
  );
  const municipalityId = muniResult.rows[0]?.id;

  for (const feature of features) {
    const props = feature.properties || {};
    const specificArea = props.area || props.name || "Unknown";

    // Skip if erosionRate already exists (including 0 values)
    if (props.erosionRate !== undefined && props.erosionRate !== null) {
      console.log(
        `  ⏭️  ${specificArea}: Skipped (erosionRate already exists: ${props.erosionRate})`
      );
      continue;
    }

    console.log(`  Checking ${specificArea}...`);

    // Extract current coordinates from feature
    const currentCoords = extractFeatureCoordinates(feature);
    if (!currentCoords || currentCoords.length === 0) {
      console.log(`  ⚠️  ${specificArea}: No valid coordinates found`);
      continue;
    }

    // No municipality on file yet, or no area on file matching this name yet
    // — either way there's nothing previous to compare against.
    const areaId = municipalityId ? await findAreaId(client, municipalityId, specificArea) : null;
    if (!areaId) {
      console.log(`  ℹ️  ${specificArea}: No existing area on file yet`);
      continue;
    }

    try {
      // Query for previous year data (most recent before current year)
      // Using shoreline_zones table where data is actually being inserted
      const prevData = await client.query(
        `SELECT
          sz.year,
          sz.geojson_data
        FROM shoreline_zones sz
        WHERE sz.area_id = $1
        AND sz.year < $2
        AND sz.geojson_data IS NOT NULL
        ORDER BY sz.year DESC
        LIMIT 1`,
        [areaId, year]
      );

      if (prevData.rows.length === 0) {
        console.log(`  ℹ️  ${specificArea}: No previous year data found`);
        continue;
      }

      // Extract previous data
      const prevRecord = prevData.rows[0];
      const prevYear = parseInt(prevRecord.year); // Ensure number type
      const prevGeoJSON = prevRecord.geojson_data;

      console.log(`    Previous year found: ${prevYear}`);

      // Extract previous coordinates
      const prevCoords = extractCoordinatesFromGeoJSON(prevGeoJSON);
      if (!prevCoords || prevCoords.length === 0) {
        console.log(
          `  ⚠️  ${specificArea}: Previous coordinates could not be extracted`
        );
        continue;
      }

      // Calculate EPR (erosion rate between consecutive years)
      try {
        const eprResult = calculateEPR(
          prevCoords,
          currentCoords,
          prevYear,
          parseInt(year) // Ensure number type
        );

        // Calculate cumulative erosion from baseline year
        let cumulativeErosion = eprResult.distanceChange; // Start with current measurement
        let baselineYear = null;

        // Query for BASELINE year (earliest record)
        // Using shoreline_zones table
        const baselineData = await client.query(
          `SELECT
            sz.year,
            sz.geojson_data
          FROM shoreline_zones sz
          WHERE sz.area_id = $1
          AND sz.geojson_data IS NOT NULL
          ORDER BY sz.year ASC
          LIMIT 1`,
          [areaId]
        );

        if (baselineData.rows.length > 0) {
          const baseline = baselineData.rows[0];
          baselineYear = parseInt(baseline.year);
          console.log(`    📊 Baseline year found: ${baselineYear}`);

          // If baseline year is different from previous year, calculate cumulative
          if (baselineYear < prevYear) {
            const baselineCoords = extractCoordinatesFromGeoJSON(baseline.geojson_data);
            if (baselineCoords && baselineCoords.length > 0) {
              try {
                const cumulativeResult = calculateEPR(
                  baselineCoords,
                  currentCoords,
                  baselineYear,
                  parseInt(year)
                );
                cumulativeErosion = cumulativeResult.distanceChange;
                console.log(
                  `    📏 Cumulative distance: ${cumulativeErosion.toFixed(1)}m from ${baselineYear} to ${year}`
                );
              } catch (cumulError) {
                console.log(
                  `    ℹ️  Using distance change as cumulative estimate: ${cumulativeErosion.toFixed(1)}m`
                );
              }
            }
          } else if (baselineYear === prevYear) {
            // If baseline IS the previous year, cumulative = distance change
            console.log(
              `    📏 Cumulative distance: ${cumulativeErosion.toFixed(1)}m (same as distance change)`
            );
          }
        } else {
          // No baseline found - this is first year, cumulative = distance change
          console.log(
            `    📏 No baseline found - cumulative distance: ${cumulativeErosion.toFixed(1)}m (first year)`
          );
        }

        // Attach results to feature
        feature.properties.erosionRate = eprResult.erosionRate;
        feature.properties.distanceChange = eprResult.distanceChange;
        feature.properties.cumulativeErosion = cumulativeErosion;
        feature.properties.calculatedFrom = {
          previousYear: prevYear,
          currentYear: parseInt(year),
          baselineYear: baselineYear,
          method: "haversine_epr",
        };

        console.log(
          `  ✅ ${specificArea}: EPR = ${eprResult.erosionRate.toFixed(2)} m/year | Cumulative = ${cumulativeErosion.toFixed(1)}m`
        );
      } catch (eprError) {
        console.warn(
          `  ❌ ${specificArea}: Calculation failed - ${eprError.message}`
        );
      }
    } catch (dbError) {
      console.error(
        `  ⚠️  ${specificArea}: Database error - ${dbError.message}`
      );
    }
  }

  console.log(`✅ Auto-calculation complete for ${municipality}\n`);
}

/**
 * Extract coordinates from a GeoJSON feature
 * Supports LineString, MultiLineString, Polygon, MultiPolygon
 * 
 * @param {object} feature - GeoJSON feature object
 * @returns {array|null} - Array of [lon, lat] coordinates or null
 */
function extractFeatureCoordinates(feature) {
  if (!feature || !feature.geometry) return null;

  const type = feature.geometry.type;
  const coords = feature.geometry.coordinates;

  if (type === "LineString") {
    return coords; // [[lon, lat], ...]
  } else if (type === "MultiLineString") {
    // Return the longest line
    let longest = [];
    for (const line of coords) {
      if (line.length > longest.length) {
        longest = line;
      }
    }
    return longest;
  } else if (type === "Polygon") {
    // Return outer ring
    return coords[0];
  } else if (type === "MultiPolygon") {
    // Return outer ring of first polygon
    return coords[0][0];
  }

  return null;
}

/**
 * Extract coordinates from stored GeoJSON data (from database)
 * 
 * @param {object} geoJsonData - GeoJSON object with geometry property
 * @returns {array|null} - Array of [lon, lat] coordinates or null
 */
function extractCoordinatesFromGeoJSON(geoJsonData) {
  if (!geoJsonData || !geoJsonData.geometry) return null;
  return extractFeatureCoordinates(geoJsonData);
}

module.exports = {
  autoCalculateErosionRates,
  extractFeatureCoordinates,
  extractCoordinatesFromGeoJSON,
};
