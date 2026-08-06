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

    // Validate GeoJSON format
    if (!validateGeometry(geojsonData)) {
      throw new Error("Invalid GeoJSON format");
    }

    // Extract features
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

/**
 * Calculate erosion metrics from GeoJSON features (Row-by-row storage)
 * Each feature becomes a separate database row with zone/area identifier
 * @param {array} features - GeoJSON features array
 * @param {string} municipality - Municipality name
 * @param {number} year - Year of data
 * @returns {array} - Array of individual erosion records (one per feature/zone)
 */
function calculateErosionMetrics(features, municipality, year) {
  if (!features || features.length === 0) {
    return [];
  }

  const records = [];

  features.forEach((feature, index) => {
    const props = feature.properties || {};

    // Extract erosion rate (use null for missing values, not 0)
    let erosionRate = null;
    if (props.erosionRate !== undefined && props.erosionRate !== null && props.erosionRate !== '') {
      const parsed = parseFloat(props.erosionRate);
      erosionRate = isNaN(parsed) ? null : parsed;
    } else if (props.change_meters !== undefined && props.change_meters !== null && props.change_meters !== '') {
      const parsed = parseFloat(props.change_meters);
      erosionRate = isNaN(parsed) ? null : parsed;
    }

    // Extract cumulative erosion (set by eprAutoCalculator or from properties, use null for missing)
    let cumulativeErosion = null;
    if (props.cumulativeErosion !== undefined && props.cumulativeErosion !== null && props.cumulativeErosion !== '') {
      const parsed = parseFloat(props.cumulativeErosion);
      cumulativeErosion = isNaN(parsed) ? null : parsed;
    } else if (props.cumulativeChange !== undefined && props.cumulativeChange !== null && props.cumulativeChange !== '') {
      const parsed = parseFloat(props.cumulativeChange);
      cumulativeErosion = isNaN(parsed) ? null : parsed;
    }

    // DEBUG logging
    if (cumulativeErosion === null && erosionRate !== null) {
      console.log(
        `⚠️  DEBUG ${zoneArea}: erosionRate=${erosionRate} but cumulativeErosion=null (props.cumulativeErosion=${props.cumulativeErosion})`
      );
    }

    // Get zone/area name from properties
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

/**
 * Process and store satellite image metadata
 * @param {string} filePath - Path to satellite image
 * @param {object} metadata - Image metadata
 * @returns {object} - Processed image information
 */
async function processSatelliteImage(filePath, metadata = {}) {
  try {
    const fileStats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    // Extract image info
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

/**
 * Extract coordinates from GeoJSON features
 * @param {array} features - GeoJSON features
 * @returns {object} - Bounds and coordinate information
 */
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

/**
 * Helper to extract bounds from nested coordinates
 * @param {array} coords - Coordinate array (can be nested)
 * @param {function} callback - Callback for each coordinate
 */
function extractBoundsFromCoords(coords, callback) {
  if (!coords || !Array.isArray(coords)) return;

  if (typeof coords[0] === "number") {
    // This is a [lng, lat] pair
    callback(coords[1], coords[0]);
  } else {
    // Recurse into nested arrays
    coords.forEach((coord) => extractBoundsFromCoords(coord, callback));
  }
}

/**
 * Validate location data
 * @param {object} locationData - Location information
 * @returns {object} - Validation result
 */
function validateLocationData(locationData) {
  const errors = [];

  if (!locationData.municipality || locationData.municipality.trim() === "") {
    errors.push("Municipality is required");
  }

  // Specific area is now optional - will be extracted from GeoJSON features if available
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

/**
 * Parse and validate CSV file for shoreline data
 * Expected CSV format:
 * municipality,year,erosion_rate,cumulative_erosion,specific_area,data_quality,source_type
 * 
 * @param {string} filePath - Path to CSV file
 * @param {string} municipality - Override municipality (optional)
 * @param {number} year - Override year (optional)
 * @returns {object} - Parsed CSV data with validation status
 */
async function parseCSV(filePath, municipality = null, year = null) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const lines = fileContent.split("\n").filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error("CSV file must have header row and at least one data row");
    }

    // Parse header
    const header = lines[0].split(",").map(h => h.trim().toLowerCase());
    
    // Expected columns
    const expectedColumns = [
      "municipality",
      "year",
      "erosion_rate",
      "cumulative_erosion",
      "specific_area",
      "data_quality",
      "source_type"
    ];

    // Validate columns (minimum required: municipality, year, erosion_rate)
    const requiredCols = ["municipality", "year", "erosion_rate"];
    const missingCols = requiredCols.filter(col => !header.includes(col));
    
    if (missingCols.length > 0) {
      throw new Error(`Missing required columns: ${missingCols.join(", ")}`);
    }

    // Parse data rows
    const records = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = line.split(",").map(v => v.trim());
      
      if (values.length < requiredCols.length) {
        errors.push(`Row ${i + 1}: Not enough columns`);
        continue;
      }

      // Create record object
      const record = {};
      header.forEach((col, idx) => {
        record[col] = values[idx];
      });

      // Validate and convert numeric values
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

/**
 * Enhanced processSatelliteImage with full analysis pipeline
 * Integrates georeferencing, coastline detection, and metric calculation
 */
async function processSatelliteImageWithAnalysis(imagePath, metadata = {}) {
  try {
    const {
      extractGeoreference,
      pixelToGeo,
    } = require("./imageGeoreference");
    const {
      detectCoastlineWithCNN,
    } = require("./imageCNNDetection");
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
    const { COASTLINE_GRID_SIZE } = require('./imageCNNDetection');
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

    // Step 4: Extract zone metrics. When there's no reference to compare
    // against (e.g. this is the first image for an area), there's no
    // `analysis.detectedCoastline` yet, so convert the raw pixel detection
    // to geographic coordinates ourselves rather than leaving zones in
    // pixel-space.
    //
    // CNN resizes images to 128×128 before detection, so CNN pixel coords
    // (0–128) must be normalised against the image extent via bounds, NOT
    // scaled by the original-image pixelWidth/pixelHeight — those are based
    // on the original (e.g. 1024×768) pixel grid and would give wildly wrong
    // coordinates for CNN output.
    // Points are in [0, COASTLINE_GRID_SIZE) space (currently 256px).
    // Normalise against image extent via bounds so geo coords are correct.
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
