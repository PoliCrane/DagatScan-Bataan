const pool = require("../db");
const { calculateLRR } = require("./eprCalculator");
const {
  classifyErosionRisk,
  classifyShorelineStatus,
} = require("./riskClassification");

const RISK_TIER_ORDER = ["VERY_HIGH", "HIGH", "MODERATE", "LOW", "VERY_LOW"];
const {
  MIN_YEARS_FOR_HINDCAST,
  HINDCAST_HOLDOUT_YEARS: HOLDOUT_YEARS,
} = require("../config/constants");

function tierDistance(a, b) {
  const ia = RISK_TIER_ORDER.indexOf(a);
  const ib = RISK_TIER_ORDER.indexOf(b);
  if (ia === -1 || ib === -1) return null;
  return Math.abs(ia - ib);
}

async function loadAreaSeries(municipalityId) {
  const params = [];
  let scopeFilter = "";
  if (municipalityId) {
    params.push(municipalityId);
    scopeFilter = `AND ca.municipality_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT ca.id AS area_id, ca.name AS area_name, m.name AS municipality,
            CAST(sz.year AS INTEGER) AS year,
            AVG(CAST(sz.cumulative_erosion AS FLOAT)) AS cumulative_erosion
     FROM shoreline_zones sz
     JOIN coastal_areas ca ON ca.id = sz.area_id
     JOIN municipalities m ON m.id = ca.municipality_id
     WHERE sz.cumulative_erosion IS NOT NULL
       AND sz.source_type LIKE 'Satellite Analysis%' AND sz.active
       ${scopeFilter}
     GROUP BY ca.id, ca.name, m.name, sz.year
     ORDER BY ca.id, sz.year ASC`,
    params
  );

  const byArea = new Map();
  for (const row of result.rows) {
    if (!byArea.has(row.area_id)) {
      byArea.set(row.area_id, {
        areaId: row.area_id,
        areaName: row.area_name,
        municipality: row.municipality,
        series: [],
      });
    }
    byArea.get(row.area_id).series.push({
      year: row.year,
      value: parseFloat(row.cumulative_erosion),
    });
  }
  return [...byArea.values()];
}

function leaveOneOutErrors(series) {
  if (series.length < 4) return [];
  const errors = [];
  for (let i = 0; i < series.length; i++) {
    const rest = series.filter((_, idx) => idx !== i);
    const fit = calculateLRR(rest);
    const predicted = fit.slope * series[i].year + fit.intercept;
    errors.push(predicted - series[i].value);
  }
  return errors;
}

// Walk-forward lead-time evaluation: every prefix with >=3 years becomes a training set,
// and every later year is a prediction target at lead = target year - train end year.
// Aggregated by lead, this answers "how far ahead can the model still classify correctly".
function leadTimeSamples(series) {
  const samples = [];
  for (let i = 2; i < series.length - 1; i++) {
    const train = series.slice(0, i + 1);
    const fit = calculateLRR(train);
    const trainEnd = series[i];
    for (let j = i + 1; j < series.length; j++) {
      const target = series[j];
      const lead = target.year - trainEnd.year;
      if (lead <= 0) continue;
      const predicted = fit.slope * target.year + fit.intercept;
      const predictedStatus = classifyShorelineStatus(fit.slope);
      const observedRate = (target.value - trainEnd.value) / lead;
      samples.push({
        lead,
        absError: Math.abs(predicted - target.value),
        statusMatch: predictedStatus === classifyShorelineStatus(observedRate),
      });
    }
  }
  return samples;
}

function aggregateLeadTimes(allSamples) {
  const buckets = new Map();
  for (const s of allSamples) {
    const key = s.lead >= 5 ? "5+" : String(s.lead);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(s);
  }
  const order = ["1", "2", "3", "4", "5+"];
  return order
    .filter((k) => buckets.has(k))
    .map((k) => {
      const rows = buckets.get(k);
      return {
        leadYears: k,
        samples: rows.length,
        statusAccuracyPct: parseFloat(((rows.filter((r) => r.statusMatch).length / rows.length) * 100).toFixed(1)),
        maeMeters: parseFloat((rows.reduce((s, r) => s + r.absError, 0) / rows.length).toFixed(2)),
      };
    });
}

function evaluateArea(area) {
  const series = area.series;
  const train = series.slice(0, series.length - HOLDOUT_YEARS);
  const holdout = series.slice(series.length - HOLDOUT_YEARS);

  const regression = calculateLRR(train);
  const trainEnd = train[train.length - 1];

  const points = holdout.map((point) => {
    const predicted = regression.slope * point.year + regression.intercept;
    const baselinePredicted = trainEnd.value;
    return {
      year: point.year,
      observed: parseFloat(point.value.toFixed(2)),
      predicted: parseFloat(predicted.toFixed(2)),
      errorMeters: parseFloat((predicted - point.value).toFixed(2)),
      baselineErrorMeters: parseFloat((baselinePredicted - point.value).toFixed(2)),
    };
  });

  const lastHoldout = holdout[holdout.length - 1];
  const observedRate =
    (lastHoldout.value - trainEnd.value) / (lastHoldout.year - trainEnd.year);
  const predictedRate = regression.slope;

  const predictedStatus = classifyShorelineStatus(predictedRate);
  const observedStatus = classifyShorelineStatus(observedRate);
  const predictedTier = classifyErosionRisk(predictedRate);
  const observedTier = classifyErosionRisk(observedRate);
  const distance = tierDistance(predictedTier, observedTier);

  const leadSamples = leadTimeSamples(series);
  const looErrors = leaveOneOutErrors(series);
  const looMae = looErrors.length
    ? parseFloat((looErrors.reduce((s, e) => s + Math.abs(e), 0) / looErrors.length).toFixed(2))
    : null;

  return {
    areaId: area.areaId,
    areaName: area.areaName,
    municipality: area.municipality,
    looMae,
    leadSamples,
    yearsUsed: train.map((p) => p.year),
    holdoutYears: holdout.map((p) => p.year),
    r2: parseFloat(regression.r2.toFixed(3)),
    predictedRate: parseFloat(predictedRate.toFixed(3)),
    observedRate: parseFloat(observedRate.toFixed(3)),
    predictedStatus,
    observedStatus,
    statusMatch: predictedStatus === observedStatus,
    predictedTier,
    observedTier,
    tierMatch: predictedTier === observedTier,
    tierAdjacent: distance !== null && distance <= 1,
    points,
  };
}

function aggregate(evaluated, skipped) {
  const allPoints = evaluated.flatMap((a) => a.points);
  const absErrors = allPoints.map((p) => Math.abs(p.errorMeters));
  const sqErrors = allPoints.map((p) => p.errorMeters * p.errorMeters);
  const baselineAbsErrors = allPoints.map((p) => Math.abs(p.baselineErrorMeters));
  const baselineSqErrors = allPoints.map((p) => p.baselineErrorMeters * p.baselineErrorMeters);

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const pct = (num, den) => (den ? parseFloat(((num / den) * 100).toFixed(1)) : null);

  const statusMatches = evaluated.filter((a) => a.statusMatch).length;
  const tierMatches = evaluated.filter((a) => a.tierMatch).length;
  const tierAdjacent = evaluated.filter((a) => a.tierAdjacent).length;
  const baselineStatusMatches = evaluated.filter(
    (a) => a.observedStatus === "STABLE"
  ).length;

  return {
    areasEvaluated: evaluated.length,
    areasSkipped: skipped,
    holdoutPoints: allPoints.length,
    positionMaeMeters: absErrors.length ? parseFloat(mean(absErrors).toFixed(2)) : null,
    positionRmseMeters: sqErrors.length ? parseFloat(Math.sqrt(mean(sqErrors)).toFixed(2)) : null,
    statusAccuracyPct: pct(statusMatches, evaluated.length),
    riskTierAccuracyPct: pct(tierMatches, evaluated.length),
    riskTierAdjacentPct: pct(tierAdjacent, evaluated.length),
    meanR2: evaluated.length
      ? parseFloat(mean(evaluated.map((a) => a.r2)).toFixed(3))
      : null,
    leadTimes: aggregateLeadTimes(evaluated.flatMap((a) => a.leadSamples || [])),
    leaveOneOutMaeMeters: evaluated.some((a) => a.looMae !== null)
      ? parseFloat(mean(evaluated.filter((a) => a.looMae !== null).map((a) => a.looMae)).toFixed(2))
      : null,
    baseline: {
      model: "no-change",
      positionMaeMeters: baselineAbsErrors.length
        ? parseFloat(mean(baselineAbsErrors).toFixed(2))
        : null,
      positionRmseMeters: baselineSqErrors.length
        ? parseFloat(Math.sqrt(mean(baselineSqErrors)).toFixed(2))
        : null,
      statusAccuracyPct: pct(baselineStatusMatches, evaluated.length),
    },
  };
}

async function runHindcast({ municipalityId = null } = {}) {
  const areas = await loadAreaSeries(municipalityId);

  const eligible = [];
  let skipped = 0;
  for (const area of areas) {
    if (area.series.length >= MIN_YEARS_FOR_HINDCAST) {
      eligible.push(area);
    } else {
      skipped++;
    }
  }

  const evaluated = eligible.map(evaluateArea);
  const summary = aggregate(evaluated, skipped);

  return {
    method: `LRR fit on first N-${HOLDOUT_YEARS} years, last ${HOLDOUT_YEARS} years held out`,
    minYearsRequired: MIN_YEARS_FOR_HINDCAST,
    summary,
    details: evaluated,
  };
}

async function storeRun(municipalityId, result) {
  const inserted = await pool.query(
    `INSERT INTO validation_runs (municipality_id, holdout_years, summary, details)
     VALUES ($1, $2, $3, $4)
     RETURNING id, run_at`,
    [municipalityId, HOLDOUT_YEARS, result.summary, JSON.stringify(result.details)]
  );
  return inserted.rows[0];
}

// municipalityId omitted (or null) fetches the latest province-wide ("all") run —
// IS NOT DISTINCT FROM treats that the same as an explicit NULL match, unlike =.
async function getLatestRun(municipalityId = null) {
  const result = await pool.query(
    `SELECT vr.id, vr.run_at, vr.municipality_id, m.name AS municipality,
            vr.holdout_years, vr.summary, vr.details
     FROM validation_runs vr
     LEFT JOIN municipalities m ON m.id = vr.municipality_id
     WHERE vr.municipality_id IS NOT DISTINCT FROM $1
     ORDER BY vr.run_at DESC
     LIMIT 1`,
    [municipalityId]
  );
  return result.rows[0] || null;
}

module.exports = {
  runHindcast,
  storeRun,
  getLatestRun,
  MIN_YEARS_FOR_HINDCAST,
  HOLDOUT_YEARS,
};
