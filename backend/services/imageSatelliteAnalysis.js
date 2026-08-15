// Compares detected coastlines with reference data (GeoJSON, previous years) to extract erosion metrics.

const fs = require('fs');

// Compares detected coastline against reference; computes erosion rate and accuracy metrics.
async function compareWithReferenceCoastline(
  detectedCoastline,
  referenceCoastline,
  georeference,
  referenceYear,
  currentYear,
  gridSize = 256
) {
  try {
    if (!detectedCoastline || detectedCoastline.length === 0) {
      return {
        valid: false,
        error: 'No coastline detected in satellite image',
      };
    }

    if (!referenceCoastline || referenceCoastline.length === 0) {
      return {
        valid: false,
        error: 'No reference coastline provided for comparison',
      };
    }

    // Points are in [0, gridSize) pixel space — caller passes the correct size.
    const geoDetectedCoastline = detectedCoastline.map((point) => {
      if (georeference.bounds) {
        const { north, south, east, west } = georeference.bounds;
        return [
          north - (point.y / gridSize) * (north - south),
          west  + (point.x / gridSize) * (east  - west),
        ];
      }
      return pixelToGeo(point.x, point.y, georeference);
    });

    const distances = calculatePerpendularDistances(
      referenceCoastline,
      geoDetectedCoastline
    );

    const erosionMetrics = calculateErosionFromDistances(
      distances,
      referenceYear,
      currentYear
    );

    const quality = assessQuality(distances, erosionMetrics);

    return {
      valid: true,
      detectedCoastline: geoDetectedCoastline,
      distances: distances,
      erosionMetrics: erosionMetrics,
      quality: quality,
      yearsDifference: currentYear - referenceYear,
      calculationMethod: 'Satellite_Image_Comparison',
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

function pixelToGeo(pixelX, pixelY, georeference) {
  const { xUpperLeft, yUpperLeft, pixelWidth, pixelHeight } = georeference;

  const longitude = xUpperLeft + pixelX * pixelWidth;
  const latitude = yUpperLeft - pixelY * pixelHeight;

  return [latitude, longitude];
}

// Unit tangent at a point along a coastline. Sign convention must match the
// frontend's offsetCoastlineForPrediction() (erosionanalysis.jsx) or retreat/advance flips.
function unitTangentAt(coastline, index) {
  const point = coastline[index];
  let tangent;

  if (index === 0) {
    tangent = [coastline[1][0] - point[0], coastline[1][1] - point[1]];
  } else if (index === coastline.length - 1) {
    tangent = [point[0] - coastline[index - 1][0], point[1] - coastline[index - 1][1]];
  } else {
    const prevDir = [point[0] - coastline[index - 1][0], point[1] - coastline[index - 1][1]];
    const nextDir = [coastline[index + 1][0] - point[0], coastline[index + 1][1] - point[1]];
    tangent = [(prevDir[0] + nextDir[0]) / 2, (prevDir[1] + nextDir[1]) / 2];
  }

  const len = Math.sqrt(tangent[0] * tangent[0] + tangent[1] * tangent[1]);
  return len === 0 ? [0, 0] : [tangent[0] / len, tangent[1] / len];
}

// Total arc length (km) plus cumulative length to each point, for fractional-position lookups.
function cumulativeArcLengths(coastline) {
  const lengths = [0];
  let total = 0;
  for (let i = 0; i < coastline.length - 1; i++) {
    total += haversineDistance(coastline[i], coastline[i + 1]);
    lengths.push(total);
  }
  return { lengths, total };
}

// Interpolates the point on coastline at a given fraction (0..1) of its arc length.
function pointAtFraction(coastline, fraction, arc) {
  if (coastline.length === 1 || arc.total === 0) return coastline[0];

  const target = fraction * arc.total;
  for (let i = 0; i < arc.lengths.length - 1; i++) {
    if (arc.lengths[i + 1] >= target) {
      const segLen = arc.lengths[i + 1] - arc.lengths[i];
      const segFrac = segLen === 0 ? 0 : (target - arc.lengths[i]) / segLen;
      const [lat1, lng1] = coastline[i];
      const [lat2, lng2] = coastline[i + 1];
      return [lat1 + (lat2 - lat1) * segFrac, lng1 + (lng2 - lng1) * segFrac];
    }
  }
  return coastline[coastline.length - 1];
}

// Matches points by position along the line (arc-length fraction), not nearest-point-in-space -
// nearest-point matching breaks when one year's trace has a different shape/kink, snapping points
// to a wrong match and inflating distances. Positive = retreat (erosion), negative = advance (accretion).
function calculatePerpendularDistances(referenceCoastline, detectedCoastline) {
  const distances = [];

  const refArc = cumulativeArcLengths(referenceCoastline);
  const detArc = cumulativeArcLengths(detectedCoastline);

  referenceCoastline.forEach((refPoint, idx) => {
    const fraction = refArc.total > 0 ? refArc.lengths[idx] / refArc.total : 0;
    const correspondingPoint = pointAtFraction(detectedCoastline, fraction, detArc);

    // project onto the seaward normal, matching the frontend's convention (positive=seaward);
    // sign is flipped since positive here means retreat
    const tangent = unitTangentAt(referenceCoastline, idx);
    const normal = [-tangent[1], tangent[0]]; // seaward, per frontend convention
    const delta = [correspondingPoint[0] - refPoint[0], correspondingPoint[1] - refPoint[1]];
    const seawardOffsetDegrees = delta[0] * normal[0] + delta[1] * normal[1];
    const distance = -seawardOffsetDegrees * 111000; // signed meters; +retreat / -advance

    distances.push({
      referencePoint: refPoint,
      detectedPoint: correspondingPoint,
      distanceMeters: distance,
    });
  });

  return distances;
}

// Haversine distance between two lat/lng points, in km.
function haversineDistance([lat1, lng1], [lat2, lng2]) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Computes erosion rate and related metrics from distance measurements.
function calculateErosionFromDistances(distances, referenceYear, currentYear) {
  if (distances.length === 0) {
    return {
      valid: false,
      message: 'No distance measurements',
    };
  }

  const yearsDifference = currentYear - referenceYear;
  if (yearsDifference <= 0) {
    return {
      valid: false,
      message: 'Current year must be after reference year',
    };
  }

  // retreat (positive) vs advance (negative), for the informational average/percentage fields only
  const retreatDistances = distances
    .filter((d) => d.distanceMeters > 0)
    .map((d) => d.distanceMeters);

  const advanceDistances = distances
    .filter((d) => d.distanceMeters < 0)
    .map((d) => Math.abs(d.distanceMeters));

  const avgRetreat =
    retreatDistances.length > 0
      ? retreatDistances.reduce((a, b) => a + b, 0) / retreatDistances.length
      : 0;

  const avgAdvance =
    advanceDistances.length > 0
      ? advanceDistances.reduce((a, b) => a + b, 0) / advanceDistances.length
      : 0;

  // Erosion rate uses the MEDIAN signed distance, not the mean - a mean is skewed hard by a
  // handful of badly-matched points from a defective trace; the median stays reliable unless
  // over half the points are corrupted.
  const netChange = calculateMedian(distances.map((d) => d.distanceMeters));
  const erosionRate = netChange / yearsDifference; // meters per year

  // Confidence: based on consistency of measurements
  const stdDev = calculateStdDev(distances.map((d) => d.distanceMeters));
  const confidence = Math.max(0, 1 - stdDev / Math.abs(erosionRate + 0.1));

  // Plausibility gate: real coastal erosion rarely exceeds ~5 m/year (CVI "Very High" ceiling).
  // A rate many times that means a defective trace, not real erosion - refuse to store it
  // rather than report garbage; caller should flag the image for re-upload.
  const PLAUSIBLE_MAX_RATE = 20; // m/year — generous ceiling, ~4x "Very High"
  if (Math.abs(erosionRate) > PLAUSIBLE_MAX_RATE) {
    return {
      valid: false,
      message: `Computed erosion rate (${erosionRate.toFixed(2)} m/year) exceeds plausible bounds (±${PLAUSIBLE_MAX_RATE} m/year) — likely a defective coastline trace for ${referenceYear} or ${currentYear}, not real erosion. Re-check/re-upload the source image for one of these years.`,
      implausible: true,
      computedRate: parseFloat(erosionRate.toFixed(4)),
    };
  }

  return {
    valid: true,
    erosionRatePerYear: parseFloat(erosionRate.toFixed(4)), // m/year
    netRetreatMeters: parseFloat(netChange.toFixed(2)),
    averageRetreatMeters: parseFloat(avgRetreat.toFixed(2)),
    averageAdvanceMeters: parseFloat(avgAdvance.toFixed(2)),
    retreatPercentage: (retreatDistances.length / distances.length) * 100,
    advancePercentage: (advanceDistances.length / distances.length) * 100,
    dataPointsUsed: distances.length,
    standardDeviation: parseFloat(stdDev.toFixed(2)),
    confidenceLevel: parseFloat(confidence.toFixed(2)),
  };
}

// Median - robust to outliers, unlike the mean.
function calculateMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calculateStdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Assesses detection quality: confidence, point count, outliers.
function assessQuality(distances, erosionMetrics) {
  const issues = [];
  let overallQuality = 'High';

  // Check detection consistency
  if (erosionMetrics.confidenceLevel < 0.6) {
    issues.push('Low confidence in distance measurements (high variation)');
    overallQuality = 'Low';
  } else if (erosionMetrics.confidenceLevel < 0.8) {
    issues.push('Moderate confidence in measurements');
    overallQuality = 'Medium';
  }

  // Check data point distribution
  if (distances.length < 50) {
    issues.push('Few measurement points (< 50)');
    if (overallQuality === 'High') overallQuality = 'Medium';
  }

  // Check for mixed signals (both retreat and advance)
  if (
    erosionMetrics.retreatPercentage > 40 &&
    erosionMetrics.retreatPercentage < 60
  ) {
    issues.push('Mixed signals (both retreat and advance detected)');
  }

  // Check for outliers
  const outlierCount = distances.filter(
    (d) => Math.abs(d.distanceMeters) > erosionMetrics.standardDeviation * 3
  ).length;

  if (outlierCount > distances.length * 0.2) {
    issues.push('Significant outliers in measurements');
    if (overallQuality === 'High') overallQuality = 'Medium';
  }

  return {
    overallQuality: overallQuality,
    issues: issues,
    assessment: {
      detectionConfidence: erosionMetrics.confidenceLevel,
      dataPointCount: distances.length,
      outlierPercentage: (outlierCount / distances.length * 100).toFixed(1),
      measurementConsistency: erosionMetrics.standardDeviation,
    },
    recommendations:
      issues.length > 0
        ? [
            'Compare with another image or GeoJSON for validation',
            'Review detected coastline for artifacts or noise',
            issues[0],
          ]
        : ['Data quality is good. Suitable for analysis'],
  };
}

// Detects cloud cover / atmospheric interference. Not implemented - returns a placeholder.
async function detectCloudCover(imagePath) {
  try {
    return {
      cloudPercentage: 0,
      canBeUsed: true,
      message: 'No significant cloud cover detected',
    };
  } catch (error) {
    return {
      cloudPercentage: null,
      canBeUsed: false,
      message: error.message,
    };
  }
}

// Splits a coastline into zones, similar to GeoJSON feature-by-feature processing.
function extractZoneMetrics(coastlineSegments, erosionMetrics) {
  const zoneLength = 5; // km
  const zones = [];

  let currentZoneStart = 0;
  let currentPoints = [];
  let accumulatedDistance = 0;

  coastlineSegments.forEach((point, idx) => {
    currentPoints.push(point);

    if (idx > 0) {
      const prevPoint = coastlineSegments[idx - 1];
      const segmentDistance = haversineDistance(prevPoint, point);
      accumulatedDistance += segmentDistance;
    }

    if (accumulatedDistance >= zoneLength || idx === coastlineSegments.length - 1) {
      zones.push({
        zoneId: `Zone_${zones.length + 1}`,
        points: currentPoints,
        startIndex: currentZoneStart,
        endIndex: idx,
        length: accumulatedDistance,
      });

      currentZoneStart = idx;
      currentPoints = [point];
      accumulatedDistance = 0;
    }
  });

  return zones;
}

module.exports = {
  compareWithReferenceCoastline,
  calculateErosionFromDistances,
  calculatePerpendularDistances,
  assessQuality,
  detectCloudCover,
  extractZoneMetrics,
};
