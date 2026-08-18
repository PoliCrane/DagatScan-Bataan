const BINS = 256;

// Otsu's method over a float array: picks the threshold that maximizes between-class
// variance of the value histogram. Returns the fallback when the data is too flat for a
// meaningful split, or when the result lands outside the plausible NDWI water/land band.
function otsuThreshold(values, fallback = 0.0, plausibleBand = 0.35) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max) || max - min < 1e-6) return fallback;

  const range = max - min;
  const hist = new Array(BINS).fill(0);
  let total = 0;
  for (const v of values) {
    if (!isFinite(v)) continue;
    const bin = Math.min(BINS - 1, Math.floor(((v - min) / range) * BINS));
    hist[bin]++;
    total++;
  }

  let sumAll = 0;
  for (let i = 0; i < BINS; i++) sumAll += i * hist[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let bestBin = 0;

  for (let i = 0; i < BINS; i++) {
    weightBackground += hist[i];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * hist[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const betweenVariance =
      weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);

    if (betweenVariance > bestVariance) {
      bestVariance = betweenVariance;
      bestBin = i;
    }
  }

  const threshold = min + ((bestBin + 0.5) / BINS) * range;
  if (Math.abs(threshold) > plausibleBand) return fallback;
  return threshold;
}

module.exports = { otsuThreshold };
