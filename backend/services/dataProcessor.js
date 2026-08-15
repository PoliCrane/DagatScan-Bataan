const fs = require("fs");
const path = require("path");
const validateGeometry = require("geojson-validation").valid;

/**
 * Parse and validate GeoJSON file
 * @param {string} filePath - Path to GeoJSON file
 * @returns {object} - Parsed GeoJSON data with validation status
 */
async function parseGeoJSON(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const geojsonData = JSON.parse(fileContent);

    if (!validateGeometry(geojsonData)) {
      throw new Error("Invalid GeoJSON format");
    }

    const features = geojsonData.features || [];

    return {
      valid: true,
      data: geojsonData,
      features: features,
      featureCount: features.length,
      type: geojsonData.type,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

// Each GeoJSON feature becomes one erosion record (one DB row per zone/area).
function calculateErosionMetrics(features, municipality, year) {
  if (!features || features.length === 0) {
    return [];
  }

  const records = [];

  features.forEach((feature, index) => {
    const props = feature.properties || {};

    // null for missing values, not 0
    let erosionRate = null;
    if (props.erosionRate !== undefined && props.erosionRate !== null && props.erosionRate !== '') {
      const parsed = parseFloat(props.erosionRate);
      erosionRate = isNaN(parsed) ? null : parsed;
    } else if (props.change_meters !== undefined && props.change_meters !== null && props.change_meters !== '') {
      const parsed = parseFloat(props.change_meters);
      erosionRate = isNaN(parsed) ? null : parsed;
    }

    // set by eprAutoCalculator or from properties; null if missing
    let cumulativeErosion = null;
    if (props.cumulativeErosion !== undefined && props.cumulativeErosion !== null && props.cumulativeErosion !== '') {
      const parsed = parseFloat(props.cumulativeErosion);
      cumulativeErosion = isNaN(parsed) ? null : parsed;
    } else if (props.cumulativeChange !== undefined && props.cumulativeChange !== null && props.cumulativeChange !== '') {
      const parsed = parseFloat(props.cumulativeChange);
      cumulativeErosion = isNaN(parsed) ? null : parsed;
    }

    if (cumulativeErosion === null && erosionRate !== null) {
      console.log(
        `⚠️  DEBUG ${zoneArea}: erosionRate=${erosionRate} but cumulativeErosion=null (props.cumulativeErosion=${props.cumulativeErosion})`
      );
    }

    const zoneArea = props.area || props.name || `Zone ${index + 1}`;

    records.push({
      municipality,
      year,
      erosion_rate: erosionRate !== null ? parseFloat(erosionRate.toFixed(4)) : null,
      cumulative_erosion: cumulativeErosion !== null ? parseFloat(cumulativeErosion.toFixed(4)) : null,
      data_quality: props.data_quality || "Estimated",
      source_type: "GeoJSON",
      geojson_data: {
        type: feature.type,
        geometry: feature.geometry,
        properties: props,
      },
      data_source: props.source || "Not specified",
      specific_area: zoneArea,
    });
  });

  return records;
}

// Process and store satellite image metadata.
async function processSatelliteImage(filePath, metadata = {}) {
  try {
    const fileStats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    const imageInfo = {
      filename: fileName,
      filepath: filePath,
      filesize: fileStats.size,
      upload_date: new Date(),
      resolution: metadata.resolution || "Unknown",
      source: metadata.source || "Custom",
      capture_date: metadata.capture_date || null,
      municipality: metadata.municipality || null,
      year: metadata.year || new Date().getFullYear(),
      bounds: metadata.bounds || null, // Bounding box coordinates
      crs: metadata.crs || "EPSG:4326", // Coordinate reference system
    };

    return {
      valid: true,
      imageInfo: imageInfo,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

// Extract coordinate bounds and center from GeoJSON features.
function extractCoordinateBounds(features) {
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;

  features.forEach((feature) => {
    const coords = feature.geometry?.coordinates || [];
    extractBoundsFromCoords(coords, (lat, lng) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
  });

  return {
    bounds: {
      north: maxLat,
      south: minLat,
      east: maxLng,
      west: minLng,
    },
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    },
  };
}

// Walks nested coordinate arrays, invoking callback per [lng, lat] pair.
function extractBoundsFromCoords(coords, callback) {
  if (!coords || !Array.isArray(coords)) return;

  if (typeof coords[0] === "number") {
    // coords is [lng, lat]; callback wants (lat, lng)
    callback(coords[1], coords[0]);
  } else {
    coords.forEach((coord) => extractBoundsFromCoords(coord, callback));
  }
}

function validateLocationData(locationData) {
  const errors = [];

  if (!locationData.municipality || locationData.municipality.trim() === "") {
    errors.push("Municipality is required");
  }

  // specific_area is optional now; extracted from GeoJSON features if present
  // if (!locationData.specific_area || locationData.specific_area.trim() === "") {
  //   errors.push("Specific Area is required");
  // }

  if (!locationData.year || isNaN(parseInt(locationData.year))) {
    errors.push("Valid year is required");
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

// CSV columns: municipality,year,erosion_rate,cumulative_erosion,specific_area,data_quality,source_type
async function parseCSV(filePath, municipality = null, year = null) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const lines = fileContent.split("\n").filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error("CSV file must have header row and at least one data row");
    }

    const header = lines[0].split(",").map(h => h.trim().toLowerCase());

    const expectedColumns = [
      "municipality",
      "year",
      "erosion_rate",
      "cumulative_erosion",
      "specific_area",
      "data_quality",
      "source_type"
    ];

    const requiredCols = ["municipality", "year", "erosion_rate"];
    const missingCols = requiredCols.filter(col => !header.includes(col));
    
    if (missingCols.length > 0) {
      throw new Error(`Missing required columns: ${missingCols.join(", ")}`);
    }

    const records = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",").map(v => v.trim());
      
      if (values.length < requiredCols.length) {
        errors.push(`Row ${i + 1}: Not enough columns`);
        continue;
      }

      const record = {};
      header.forEach((col, idx) => {
        record[col] = values[idx];
      });

      const muni = municipality || record.municipality;
      const yr = parseInt(year || record.year);
      const rate = parseFloat(record.erosion_rate);

      if (!muni || muni.trim() === "") {
        errors.push(`Row ${i + 1}: Municipality is required`);
        continue;
      }

      if (isNaN(yr) || yr < 1900 || yr > 2100) {
        errors.push(`Row ${i + 1}: Invalid year: ${record.year}`);
        continue;
      }

      if (isNaN(rate)) {
        errors.push(`Row ${i + 1}: Invalid erosion_rate: ${record.erosion_rate}`);
        continue;
      }

      // Optional fields
      const cumErosion = record.cumulative_erosion ? parseFloat(record.cumulative_erosion) : null;
      const specificArea = record.specific_area || "Main Coastline";
      const dataQuality = record.data_quality || "Field Survey";
      const sourceType = record.source_type || "CSV Import";

      records.push({
        municipality: muni,
        year: yr,
        erosion_rate: rate,
        cumulative_erosion: !isNaN(cumErosion) ? cumErosion : null,
        specific_area: specificArea,
        data_quality: dataQuality,
        source_type: sourceType,
      });
    }

    if (records.length === 0 && errors.length > 0) {
      throw new Error(`Failed to parse CSV: ${errors.join("; ")}`);
    }

    return {
      valid: records.length > 0,
      data: records,
      recordCount: records.length,
      errors: errors.length > 0 ? errors : undefined,
      warning: errors.length > 0 ? `${errors.length} rows had errors and were skipped` : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      data: [],
      recordCount: 0,
    };
  }
}

// Full satellite image analysis pipeline: georeferencing, coastline detection, metric calculation.
async function processSatelliteImageWithAnalysis(imagePath, metadata = {}) {
  try {
    const {
      extractGeoreference,
      pixelToGeo,
    } = require("./imageGeoreference");
    const {
      compareWithReferenceCoastline,
      extractZoneMetrics,
      assessQuality,
    } = require("./imageSatelliteAnalysis");

    // Step 1: Extract georeferencing
    const georeference = await extractGeoreference(imagePath, metadata);
    if (!georeference.valid) {
      return {
        valid: false,
        error: georeference.error,
        correction: georeference.correction,
      };
    }

    // Step 2: Detect coastline using CNN (U-Net Lite, self-supervised)
    const { COASTLINE_GRID_SIZE, detectCoastlineWithCNN } = require('./imageCNNDetection');
    const detection = await detectCoastlineWithCNN(imagePath);
    if (!detection.valid) {
      return {
        valid: false,
        error: detection.error,
      };
    }

    // Step 3: Compare with reference if available
    let analysis = null;
    if (metadata.referenceCoastline && metadata.referenceYear) {
      analysis = await compareWithReferenceCoastline(
        detection.coastlinePoints,
        metadata.referenceCoastline,
        georeference.georeference,
        metadata.referenceYear,
        metadata.year || new Date().getFullYear(),
        detection.gridSize || 256
      );
    }

    // Step 4: extract zone metrics. No reference means no analysis.detectedCoastline yet,
    // so convert the raw pixel detection to geo coords ourselves.
    // CNN output is in [0, COASTLINE_GRID_SIZE) pixel space, not the original image's -
    // normalize against bounds, not the original pixelWidth/pixelHeight.
    const georef = georeference.georeference;
    const gridSize = detection.gridSize || COASTLINE_GRID_SIZE || 256;
    const cnnPixelToGeo = (px, py) => {
      if (georef.bounds) {
        const { north, south, east, west } = georef.bounds;
        return [
          north - (py / gridSize) * (north - south),
          west  + (px / gridSize) * (east  - west),
        ];
      }
      return pixelToGeo(px, py, georef);
    };

    const geoCoastline = analysis?.valid
      ? analysis.detectedCoastline
      : detection.coastlinePoints.map((p) => cnnPixelToGeo(p.x, p.y));

    const zones = extractZoneMetrics(geoCoastline, analysis?.erosionMetrics || {});

    return {
      valid: true,
      detection: detection,
      georeferencing: georeference,
      analysis: analysis,
      zones: zones,
      summary: {
        coastlinePointsDetected: detection.pointCount,
        zonesExtracted: zones.length,
        erosionRatePerYear: analysis?.erosionMetrics?.erosionRatePerYear || null,
        qualityAssessment: analysis?.quality?.overallQuality || 'Unknown',
        readyForDatabase: analysis?.valid || false,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      stage: 'Image analysis pipeline failed',
    };
  }
}

module.exports = {
  parseGeoJSON,
  parseCSV,
  calculateErosionMetrics,
  processSatelliteImage,
  processSatelliteImageWithAnalysis,
  extractCoordinateBounds,
  validateLocationData,
};
