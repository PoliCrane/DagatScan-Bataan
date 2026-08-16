// Computes EPR for features missing erosionRate by comparing against the previous year's data.

const { calculateEPR } = require("./eprCalculator");
const { findAreaId } = require("./coastalAreas");

// Computes erosion rate and cumulative erosion (from baseline year) for features
// missing them; modifies features in-place.
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

    const currentCoords = extractFeatureCoordinates(feature);
    if (!currentCoords || currentCoords.length === 0) {
      console.log(`  ⚠️  ${specificArea}: No valid coordinates found`);
      continue;
    }

    // no municipality or matching area on file yet - nothing to compare against
    const areaId = municipalityId ? await findAreaId(client, municipalityId, specificArea) : null;
    if (!areaId) {
      console.log(`  ℹ️  ${specificArea}: No existing area on file yet`);
      continue;
    }

    try {
      // most recent year before current, from shoreline_zones
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

      const prevRecord = prevData.rows[0];
      const prevYear = parseInt(prevRecord.year);
      const prevGeoJSON = prevRecord.geojson_data;

      console.log(`    Previous year found: ${prevYear}`);

      const prevCoords = extractCoordinatesFromGeoJSON(prevGeoJSON);
      if (!prevCoords || prevCoords.length === 0) {
        console.log(
          `  ⚠️  ${specificArea}: Previous coordinates could not be extracted`
        );
        continue;
      }

      try {
        const eprResult = calculateEPR(
          prevCoords,
          currentCoords,
          prevYear,
          parseInt(year)
        );

        let cumulativeErosion = eprResult.netChange; // starting value; overwritten below if a baseline exists
        let baselineYear = null;

        // baseline = earliest record in shoreline_zones
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
                cumulativeErosion = cumulativeResult.netChange;
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
            console.log(
              `    📏 Cumulative distance: ${cumulativeErosion.toFixed(1)}m (same as distance change)`
            );
          }
        } else {
          console.log(
            `    📏 No baseline found - cumulative distance: ${cumulativeErosion.toFixed(1)}m (first year)`
          );
        }

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

// Extracts coordinates from LineString/MultiLineString/Polygon/MultiPolygon features.
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

// Same as extractFeatureCoordinates but for GeoJSON pulled from the database.
function extractCoordinatesFromGeoJSON(geoJsonData) {
  if (!geoJsonData || !geoJsonData.geometry) return null;
  return extractFeatureCoordinates(geoJsonData);
}

module.exports = {
  autoCalculateErosionRates,
  extractFeatureCoordinates,
  extractCoordinatesFromGeoJSON,
};
