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

  const looErrors = leaveOneOutErrors(series);
  const looMae = looErrors.length
    ? parseFloat((looErrors.reduce((s, e) => s + Math.abs(e), 0) / looErrors.length).toFixed(2))
    : null;

  return {
    areaId: area.areaId,
    areaName: area.areaName,
    municipality: area.municipality,
    looMae,
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

async function storeRun(scope, result) {
  const inserted = await pool.query(
    `INSERT INTO validation_runs (scope, holdout_years, summary, details)
     VALUES ($1, $2, $3, $4)
     RETURNING id, run_at`,
    [scope, HOLDOUT_YEARS, result.summary, JSON.stringify(result.details)]
  );
  return inserted.rows[0];
}

async function getLatestRun(scope = null) {
  const params = [];
  let filter = "";
  if (scope) {
    params.push(scope);
    filter = `WHERE scope = $1`;
  }
  const result = await pool.query(
    `SELECT id, run_at, scope, holdout_years, summary, details
     FROM validation_runs ${filter}
     ORDER BY run_at DESC
     LIMIT 1`,
    params
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
