const { signedSeawardChanges, median } = require("./geoUtils");

// End-Point Rate (EPR): signed seaward-normal change between two shorelines.
// coords1 = earlier shoreline, coords2 = later shoreline, both [lon, lat].
// Negative rate = erosion (retreat), positive = accretion (advance).
function calculateEPR(coords1, coords2, year1, year2) {
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

  let earlier = coords1;
  let later = coords2;
  let earlierYear = year1;
  let laterYear = year2;
  if (year2 < year1) {
    earlier = coords2;
    later = coords1;
    earlierYear = year2;
    laterYear = year1;
  }

  const earlierLatLng = earlier.map(([lon, lat]) => [lat, lon]);
  const laterLatLng = later.map(([lon, lat]) => [lat, lon]);

  const changes = signedSeawardChanges(earlierLatLng, laterLatLng);
  const netChange = median(changes.map((c) => c.changeMeters));

  const yearsApart = laterYear - earlierYear;
  const erosionRate = netChange / yearsApart;

  return {
    erosionRate: erosionRate,
    netChange: netChange,
    distanceChange: Math.abs(netChange),
    yearsApart: yearsApart,
  };
}

// Linear Regression Rate (LRR): least-squares line across every available year,
// unlike calculateEPR which only uses the two endpoint years.
// @param {Array<{year: number, value: number}>} dataPoints - one point per year
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
