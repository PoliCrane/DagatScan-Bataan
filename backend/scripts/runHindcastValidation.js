require("dotenv").config();
const pool = require("../db");
const { runHindcast, storeRun } = require("../services/hindcastValidation");

async function main() {
  const result = await runHindcast();
  const stored = await storeRun("all", result);
  const s = result.summary;

  console.log("Hindcast validation complete.");
  console.log(`Run id: ${stored.id} (${stored.run_at})`);
  console.log(`Method: ${result.method}`);
  console.log("");
  console.log(`Areas evaluated: ${s.areasEvaluated} (skipped, <${result.minYearsRequired} years: ${s.areasSkipped})`);
  console.log(`Holdout points: ${s.holdoutPoints}`);
  console.log(`Position MAE:  ${s.positionMaeMeters} m (baseline no-change: ${s.baseline.positionMaeMeters} m)`);
  console.log(`Position RMSE: ${s.positionRmseMeters} m (baseline no-change: ${s.baseline.positionRmseMeters} m)`);
  console.log(`Status accuracy (Erosion/Accretion/Stable): ${s.statusAccuracyPct}% (baseline: ${s.baseline.statusAccuracyPct}%)`);
  console.log(`Risk tier accuracy (exact): ${s.riskTierAccuracyPct}%`);
  console.log(`Risk tier accuracy (within one tier): ${s.riskTierAdjacentPct}%`);
  console.log(`Mean model fit (r2): ${s.meanR2}`);
  console.log(`Leave-one-out MAE: ${s.leaveOneOutMaeMeters} m`);
  for (const lt of s.leadTimes || []) {
    console.log(`Lead ${lt.leadYears} yr: status accuracy ${lt.statusAccuracyPct}% (MAE ${lt.maeMeters} m, n=${lt.samples})`);
  }
  console.log("");

  for (const area of result.details) {
    console.log(
      `${area.municipality} / ${area.areaName}: predicted ${area.predictedStatus} (${area.predictedRate} m/yr), observed ${area.observedStatus} (${area.observedRate} m/yr) — ${area.statusMatch ? "MATCH" : "MISS"}, r2=${area.r2}`
    );
  }
}

main()
  .catch((err) => {
    console.error("Hindcast run failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
