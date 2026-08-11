/**
 * End-Point Rate (EPR) erosion rate via haversine formula.
 * coords1 = earlier shoreline, coords2 = later shoreline.
 * @throws {Error} for invalid inputs
 */
function calculateEPR(coords1, coords2, year1, year2) {
  // Validate inputs
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) {
    throw new Error("coords1 and coords2 must be arrays");
  }

  if (coords1.length === 0 || coords2.length === 0) {
    throw new Error("coords1 and coords2 cannot be empty");
  }

  if (typeof year1 !== "number" || typeof year2 !== "number") {
    throw new Error("year1 and year2 must be numbers");
  }

  if (year1 === year2) {
    throw new Error("year1 and year2 must be different");
  }

  // Validate coordinates
  const isValidCoord = (coord) => {
    return (
      Array.isArray(coord) &&
      coord.length === 2 &&
      typeof coord[0] === "number" &&
      typeof coord[1] === "number" &&
      isFinite(coord[0]) &&
      isFinite(coord[1]) &&
      coord[0] >= -180 &&
      coord[0] <= 180 &&
      coord[1] >= -90 &&
      coord[1] <= 90
    );
  };

  if (!coords1.every(isValidCoord)) {
    throw new Error("coords1 contains invalid coordinates");
  }

  if (!coords2.every(isValidCoord)) {
    throw new Error("coords2 contains invalid coordinates");
  }

  // Haversine distance between two [lon, lat] points, in meters.
  function haversineDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const R = 6371000; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  // Closest distance from a coords1 point to any point in coords2.
  function findClosestDistance(point) {
    let minDistance = Infinity;

    for (const targetPoint of coords2) {
      const distance = haversineDistance(point, targetPoint);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance;
  }

  // Calculate distances from each point in coords1 to its closest point in coords2
  const distances = coords1.map(findClosestDistance);

  // Calculate average distance
  const averageDistance =
    distances.reduce((sum, dist) => sum + dist, 0) / distances.length;

  // Calculate years apart
  const yearsApart = Math.abs(year2 - year1);

  // Calculate erosion rate (negative because retreat is erosion)
  // If year2 > year1, erosion rate is negative for retreat
  const sign = year2 > year1 ? -1 : 1;
  const erosionRate = (sign * averageDistance) / yearsApart;

  return {
    erosionRate: erosionRate, // meters/year (negative = retreat/erosion)
    distanceChange: averageDistance, // meters
    yearsApart: yearsApart, // years
  };
}

/**
 * Linear Regression Rate (LRR) — fits a least-squares regression line across
 * every available year, unlike calculateEPR above (which only ever uses the
 * two endpoint years). More years generally means a more reliable rate.
 * @param {Array<{year: number, value: number}>} dataPoints - one point per year
 */
function calculateLRR(dataPoints) {
  if (!Array.isArray(dataPoints) || dataPoints.length < 2) {
    throw new Error("At least 2 years of data are required for regression");
  }

  const years = dataPoints.map((d) => d.year);
  const values = dataPoints.map((d) => d.value);

  const n = years.length;
  const sumX = years.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = years.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = years.reduce((sum, x) => sum + x * x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  const totalSumSquares = values.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
  const residualSumSquares = values.reduce((sum, y, i) => {
    const predicted = slope * years[i] + intercept;
    return sum + Math.pow(y - predicted, 2);
  }, 0);

  const r2 = totalSumSquares === 0 ? 1 : 1 - residualSumSquares / totalSumSquares;
  const confidence = Math.min(0.95, Math.max(0.5, r2));

  return { slope, intercept, confidence, r2 };
}

module.exports = { calculateEPR, calculateLRR };
