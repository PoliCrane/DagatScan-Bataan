const {
  cumulativeArcMeters,
  pointAtArcFraction,
  seawardUnitNormals,
  metersPerDegreeLon,
  METERS_PER_DEGREE_LAT,
  alignOrientation,
} = require("./geoUtils");
const { calculateLRR } = require("./eprCalculator");

const DEFAULT_SPACING_METERS = 100;

// DSAS-style transect statistics. The earliest shoreline is the baseline; transects are
// sampled every spacingMeters along it, and every year's shoreline position is measured
// as the signed seaward offset at the matching arc-length fraction.
// Per transect: NSM (net movement, m), SCE (envelope, m), EPR (endpoint rate, m/yr),
// LRR (least-squares rate, m/yr) and WLR (uncertainty-weighted rate, m/yr).
// yearlyShorelines: [{ year, points: [[lat,lng],...], uncertaintyMeters? }] sorted or not.
function computeTransectStatistics(yearlyShorelines, spacingMeters = DEFAULT_SPACING_METERS) {
  if (!Array.isArray(yearlyShorelines) || yearlyShorelines.length < 2) {
    throw new Error("At least 2 years of shorelines are required for transect statistics");
  }

  const series = [...yearlyShorelines]
    .filter((s) => Array.isArray(s.points) && s.points.length >= 2)
    .sort((a, b) => a.year - b.year);
  if (series.length < 2) {
    throw new Error("At least 2 usable shorelines are required");
  }

  const baseline = series[0];
  const baseArc = cumulativeArcMeters(baseline.points);
  if (baseArc.total === 0) throw new Error("Baseline shoreline has zero length");

  const transectCount = Math.max(2, Math.floor(baseArc.total / spacingMeters) + 1);
  const normals = seawardUnitNormals(baseline.points);

  const aligned = series.map((s) => ({
    ...s,
    points: alignOrientation(baseline.points, s.points),
    arc: cumulativeArcMeters(alignOrientation(baseline.points, s.points)),
  }));

  const transects = [];
  for (let t = 0; t < transectCount; t++) {
    const fraction = transectCount === 1 ? 0 : t / (transectCount - 1);
    const origin = pointAtArcFraction(baseline.points, fraction, baseArc);

    let originIdx = 0;
    let best = Infinity;
    for (let i = 0; i < baseline.points.length; i++) {
      const d = Math.abs(baseArc.lengths[i] - fraction * baseArc.total);
      if (d < best) {
        best = d;
        originIdx = i;
      }
    }
    const [nN, nE] = normals[originIdx];
    const mLon = metersPerDegreeLon(origin[0]);

    const positions = aligned.map((s) => {
      const matched = pointAtArcFraction(s.points, fraction, s.arc);
      const dNorth = (matched[0] - origin[0]) * METERS_PER_DEGREE_LAT;
      const dEast = (matched[1] - origin[1]) * mLon;
      return {
        year: s.year,
        offsetMeters: dNorth * nN + dEast * nE,
        uncertaintyMeters: s.uncertaintyMeters ?? null,
      };
    });

    const first = positions[0];
    const last = positions[positions.length - 1];
    const offsets = positions.map((p) => p.offsetMeters);
    const nsm = last.offsetMeters - first.offsetMeters;
    const sce = Math.max(...offsets) - Math.min(...offsets);
    const yearSpan = last.year - first.year;
    const epr = yearSpan > 0 ? nsm / yearSpan : null;

    let lrr = null;
    let lrrR2 = null;
    if (positions.length >= 3) {
      const fit = calculateLRR(positions.map((p) => ({ year: p.year, value: p.offsetMeters })));
      lrr = fit.slope;
      lrrR2 = fit.r2;
    }

    const wlr = positions.length >= 3 ? weightedRate(positions) : null;

    transects.push({
      transectId: t + 1,
      origin: [parseFloat(origin[0].toFixed(6)), parseFloat(origin[1].toFixed(6))],
      distanceAlongBaselineMeters: parseFloat((fraction * baseArc.total).toFixed(1)),
      nsmMeters: round2(nsm),
      sceMeters: round2(sce),
      eprMetersPerYear: epr !== null ? round2(epr) : null,
      lrrMetersPerYear: lrr !== null ? round2(lrr) : null,
      lrrR2: lrrR2 !== null ? parseFloat(lrrR2.toFixed(3)) : null,
      wlrMetersPerYear: wlr !== null ? round2(wlr) : null,
    });
  }

  const rates = transects.map((t) => t.lrrMetersPerYear ?? t.eprMetersPerYear).filter((v) => v !== null);
  const summary = {
    transectCount: transects.length,
    spacingMeters,
    baselineYear: baseline.year,
    latestYear: series[series.length - 1].year,
    baselineLengthMeters: parseFloat(baseArc.total.toFixed(1)),
    meanRateMetersPerYear: rates.length ? round2(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
    maxErosionMetersPerYear: rates.length ? round2(Math.min(...rates)) : null,
    maxAccretionMetersPerYear: rates.length ? round2(Math.max(...rates)) : null,
    erodingTransects: rates.filter((r) => r < -0.5).length,
    accretingTransects: rates.filter((r) => r > 0.5).length,
    stableTransects: rates.filter((r) => Math.abs(r) <= 0.5).length,
  };

  return { summary, transects };
}

// Weighted least squares slope; weight = 1 / uncertainty^2 when per-year positional
// uncertainty is available, otherwise uniform (reduces to ordinary LRR).
function weightedRate(positions) {
  const weights = positions.map((p) =>
    p.uncertaintyMeters && p.uncertaintyMeters > 0 ? 1 / (p.uncertaintyMeters * p.uncertaintyMeters) : 1
  );
  const sw = weights.reduce((a, b) => a + b, 0);
  const meanX = positions.reduce((s, p, i) => s + weights[i] * p.year, 0) / sw;
  const meanY = positions.reduce((s, p, i) => s + weights[i] * p.offsetMeters, 0) / sw;
  let num = 0;
  let den = 0;
  for (let i = 0; i < positions.length; i++) {
    num += weights[i] * (positions[i].year - meanX) * (positions[i].offsetMeters - meanY);
    den += weights[i] * Math.pow(positions[i].year - meanX, 2);
  }
  return den === 0 ? 0 : num / den;
}

function round2(v) {
  return parseFloat(v.toFixed(2));
}

module.exports = { computeTransectStatistics, DEFAULT_SPACING_METERS };
