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
  const confidence = Math.max(0, Math.min(1, r2));

  const df = n - 2;
  const xMean = sumX / n;
  const sxx = years.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);
  let slopeStdError = null;
  let ci95 = null;
  let pValue = null;
  if (df > 0 && sxx > 0) {
    const residualVariance = residualSumSquares / df;
    slopeStdError = Math.sqrt(residualVariance / sxx);
    if (slopeStdError === 0) {
      ci95 = 0;
      pValue = slope === 0 ? 1 : 0;
    } else {
      const t = tCritical95(df);
      ci95 = t * slopeStdError;
      pValue = twoTailedPValue(Math.abs(slope) / slopeStdError, df);
    }
  }

  return {
    slope,
    intercept,
    confidence,
    r2,
    sampleCount: n,
    slopeStdError,
    ci95,
    pValue,
    significant: pValue !== null ? pValue < 0.05 : null,
  };
}

const T_CRITICAL_95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];

function tCritical95(df) {
  if (df <= 0) return Infinity;
  if (df <= T_CRITICAL_95.length) return T_CRITICAL_95[df - 1];
  return 1.96 + 2.4 / df;
}

function twoTailedPValue(tAbs, df) {
  const x = df / (df + tAbs * tAbs);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.max(0, Math.min(1, p));
}

function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta =
    logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;
  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let numerator;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= c * d;
    if (Math.abs(1 - c * d) < 1e-8) break;
  }
  return front * (f - 1);
}

function logGamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Robust variant: fits, drops points whose standardized residual exceeds 2.5 (kept to at
// most one pass and only with 5+ points so a genuine trend change is not discarded), refits.
function calculateRobustLRR(dataPoints) {
  const first = calculateLRR(dataPoints);
  if (dataPoints.length < 5 || first.slopeStdError === null) return { ...first, outliersRemoved: 0 };

  const residuals = dataPoints.map((d) => d.value - (first.slope * d.year + first.intercept));
  const std = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (residuals.length - 2));
  if (std === 0) return { ...first, outliersRemoved: 0 };

  const kept = dataPoints.filter((d, i) => Math.abs(residuals[i] / std) <= 2.5);
  if (kept.length === dataPoints.length || kept.length < 3) {
    return { ...first, outliersRemoved: 0 };
  }
  const refit = calculateLRR(kept);
  return { ...refit, outliersRemoved: dataPoints.length - kept.length };
}

module.exports = { calculateEPR, calculateLRR, calculateRobustLRR };
