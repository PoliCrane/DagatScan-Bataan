/**
 * Fake dataset generator: year-by-year shoreline progression for erosion/accretion
 */

/**
 * Seeded random from lat/lng only, so results stay deterministic per municipality
 */
const getMunicipalityRandom = (centerLat, centerLng) => {
  const latFactor = Math.floor(centerLat * 100000);
  const lngFactor = Math.floor(centerLng * 100000);

  let hash = 2166136261; // FNV offset basis (32-bit)
  const FNV_PRIME = 16777619;

  const hashString = `${latFactor}:${lngFactor}`;
  for (let i = 0; i < hashString.length; i++) {
    hash ^= hashString.charCodeAt(i);
    hash = (hash * FNV_PRIME) >>> 0;
  }

  return (hash >>> 0) / 4294967296;
};

/**
 * Average erosion rate in meters/year (negative = accretion, positive = erosion)
 */
const generateMunicipalityErosionRate = (centerLat, centerLng) => {
  const random = getMunicipalityRandom(centerLat, centerLng);

  // 15% chance of accretion
  if (random < 0.15) return -(0.5 + random * 1.5);

  // 25% chance of stable/low
  if (random < 0.4) return random * 0.5;

  // 35% chance of low to moderate
  if (random < 0.75) return 0.4 + random * 1.8;

  // 25% chance of moderate to high
  return 1.5 + random * 2.5;
};

/**
 * Generate deterministic variation for erosion rate (natural fluctuation)
 */
const generateYearVariation = (baseRate, year, centerLat, centerLng) => {
  const yearSeed = Math.floor(centerLat * 100 + centerLng * 1000 + year * 97);
  const variation = (Math.sin(yearSeed * 0.1) * 0.3); // ±0.3 m/year variation
  return baseRate + variation;
};

/**
 * Offsets coastline points; positive offset = erosion (inland), negative = accretion (seaward)
 */
const offsetCoastline = (coastlinePoints, offset) => {
  if (!coastlinePoints || coastlinePoints.length < 2) return [];

  return coastlinePoints.map((point, index) => {
    // Calculate perpendicular direction
    let normal = [0, 0];

    if (index === 0) {
      // First point: use direction to next point
      const next = coastlinePoints[1];
      normal = [next[1] - point[1], -(next[0] - point[0])];
    } else if (index === coastlinePoints.length - 1) {
      // Last point: use direction from previous point
      const prev = coastlinePoints[index - 1];
      normal = [point[1] - prev[1], -(point[0] - prev[0])];
    } else {
      // Middle point: average of surrounding directions
      const prev = coastlinePoints[index - 1];
      const next = coastlinePoints[index + 1];
      normal = [(next[1] - prev[1]) / 2, -((next[0] - prev[0]) / 2)];
    }

    // Normalize
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
    if (length === 0) return point;

    normal[0] /= length;
    normal[1] /= length;

    // Apply offset (convert from meters to degrees: 1 degree ≈ 111 km)
    const offsetDegrees = (offset / 111000);

    return [
      point[0] + normal[0] * offsetDegrees,
      point[1] + normal[1] * offsetDegrees,
    ];
  });
};

/**
 * Generates year-by-year shoreline progression from startYear to endYear
 */
export const generateYearlyShorelineData = (coastlinePoints, startYear = 2015, endYear = 2026) => {
  if (!coastlinePoints || coastlinePoints.length === 0) {
    console.warn("No coastline points provided");
    return [];
  }

  // Municipality center, for consistent random seeding
  const centerLat = coastlinePoints.reduce((sum, p) => sum + p[0], 0) / coastlinePoints.length;
  const centerLng = coastlinePoints.reduce((sum, p) => sum + p[1], 0) / coastlinePoints.length;

  const baseErosionRate = generateMunicipalityErosionRate(centerLat, centerLng);

  const yearlyData = [];
  let cumulativeOffset = 0; // Cumulative erosion/accretion in meters

  for (let year = startYear; year <= endYear; year++) {
    const yearErosionRate = generateYearVariation(baseErosionRate, year, centerLat, centerLng);

    cumulativeOffset += yearErosionRate;

    const yearShoreline = offsetCoastline(coastlinePoints, cumulativeOffset);

    yearlyData.push({
      year,
      erosionRate: parseFloat(yearErosionRate.toFixed(2)),
      cumulativeErosion: parseFloat(cumulativeOffset.toFixed(2)),
      shoreline: yearShoreline,
      dataQuality: "Simulated",
    });
  }

  return yearlyData;
};

// Kept for backward compatibility; segments are accepted but ignored, output is year-based
export const generateCoastlineDataset = (coastlineSegments, year = 2026) => {
  console.warn("generateCoastlineDataset called - consider using generateYearlyShorelineData instead");
  return [];
};

/**
 * Generates what the shoreline would have looked like in a past year
 */
export const generateComparisonShorelineForYear = (currentShoreline, targetYear = 2015, currentYear = 2026) => {
  if (!currentShoreline || currentShoreline.length === 0) {
    return [];
  }

  const centerLat = currentShoreline.reduce((sum, p) => sum + p[0], 0) / currentShoreline.length;
  const centerLng = currentShoreline.reduce((sum, p) => sum + p[1], 0) / currentShoreline.length;

  const baseErosionRate = generateMunicipalityErosionRate(centerLat, centerLng);

  // Calculate how much erosion happened between targetYear and currentYear
  const yearsDifference = currentYear - targetYear;
  
  let totalErosionAtTarget = 0;
  for (let year = targetYear; year < currentYear; year++) {
    const yearErosionRate = generateYearVariation(baseErosionRate, year, centerLat, centerLng);
    totalErosionAtTarget += yearErosionRate;
  }

  // Reverse the erosion to move back seaward
  const reverseOffset = -totalErosionAtTarget;

  return offsetCoastline(currentShoreline, reverseOffset);
};

/**
 * Filter segments by erosion threshold
 */
export const filterByErosionThreshold = (dataset, threshold) => {
  return dataset.filter((segment) => segment.erosionRate >= threshold);
};

/**
 * Interpolates erosion data at a coordinate — used for hover popups between segment points
 */
export const interpolateErosionDataAtPoint = (dataset, point) => {
  // Find nearest segment
  let nearestSegment = null;
  let minDistance = Infinity;

  dataset.forEach((segment) => {
    // Simple distance to center point
    const dx = segment.centerPoint[0] - point[0];
    const dy = segment.centerPoint[1] - point[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      nearestSegment = segment;
    }
  });

  return nearestSegment;
};

/**
 * Generate predicted data for future year
 */
export const predictFutureErosion = (currentData, yearsAhead = 5) => {
  return currentData.map((segment) => ({
    ...segment,
    year: segment.year + yearsAhead,
    projectedRetreat: (
      parseFloat(segment.projectedRetreat) +
      segment.erosionRate * yearsAhead
    ).toFixed(2),
    // Slightly increase uncertainty for future predictions
    confidence: (segment.confidence * 0.85).toFixed(2),
  }));
};
