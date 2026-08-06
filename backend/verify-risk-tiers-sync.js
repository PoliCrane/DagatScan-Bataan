/**
 * Verifies the backend's and frontend's independent risk-tier classifiers
 * agree. No shared package exists between the CommonJS backend and ESM
 * Vite frontend, so services/riskClassification.js and
 * frontend/src/utils/segmentData.js are two hand-maintained copies of the
 * same five-tier scheme (VERY_HIGH/HIGH/MODERATE/LOW/VERY_LOW). This
 * actually executes both and diffs their output across a sweep of sample
 * rates (including the exact tier boundaries) instead of just trusting a
 * comment — run this after editing either file's thresholds.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { classifyErosionRisk: backendClassify } = require("./services/riskClassification");

async function main() {
  const frontendPath = path.resolve(__dirname, "../frontend/src/utils/segmentData.js");
  const { classifyErosionRisk: frontendClassify } = await import(pathToFileURL(frontendPath).href);

  const samples = [];
  for (let r = -20; r <= 20; r += 0.25) samples.push(Math.round(r * 100) / 100);
  samples.push(-5, -1, 1, 5, 0, null, undefined, NaN);

  const mismatches = samples
    .map((r) => ({ r, backend: backendClassify(r), frontend: frontendClassify(r) }))
    .filter(({ backend, frontend }) => backend !== frontend);

  if (mismatches.length > 0) {
    console.error(`Risk tier MISMATCH between backend and frontend (${mismatches.length}/${samples.length} samples):`);
    for (const { r, backend, frontend } of mismatches) {
      console.error(`  rate=${r}: backend=${backend} frontend=${frontend}`);
    }
    process.exit(1);
  }

  console.log(`OK - risk tiers match across ${samples.length} sample rates (backend services/riskClassification.js vs frontend src/utils/segmentData.js).`);
}

main().catch((err) => {
  console.error("verify-risk-tiers-sync failed to run:", err.message);
  process.exit(1);
});
