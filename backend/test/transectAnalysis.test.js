const { test } = require("node:test");
const assert = require("node:assert");
const { computeTransectStatistics } = require("../services/transectAnalysis");
const { offsetCoastlineSeaward } = require("../services/geoUtils");

const base = [];
for (let i = 0; i <= 60; i++) base.push([14.75 - i * 0.001, 120.25 + Math.sin(i / 8) * 0.0004]);

function series(rate, years) {
  return years.map((year, idx) => ({
    year,
    points: offsetCoastlineSeaward(base, rate * (year - years[0])),
  }));
}

test("transect EPR, LRR, WLR, and NSM recover a known erosion rate", () => {
  const { summary, transects } = computeTransectStatistics(series(-2, [2018, 2020, 2022, 2024]), 100);
  assert.ok(summary.transectCount > 10, `expected many transects, got ${summary.transectCount}`);
  assert.ok(Math.abs(summary.meanRateMetersPerYear - -2) < 0.1, `mean rate ${summary.meanRateMetersPerYear}`);
  const mid = transects[Math.floor(transects.length / 2)];
  assert.ok(Math.abs(mid.eprMetersPerYear - -2) < 0.15, `EPR ${mid.eprMetersPerYear}`);
  assert.ok(Math.abs(mid.lrrMetersPerYear - -2) < 0.15, `LRR ${mid.lrrMetersPerYear}`);
  assert.ok(Math.abs(mid.wlrMetersPerYear - -2) < 0.15, `WLR ${mid.wlrMetersPerYear}`);
  assert.ok(Math.abs(mid.nsmMeters - -12) < 1, `NSM ${mid.nsmMeters}`);
  assert.ok(Math.abs(mid.sceMeters - 12) < 1, `SCE ${mid.sceMeters}`);
  assert.strictEqual(summary.erodingTransects, summary.transectCount);
});

test("stable shoreline classifies transects as stable", () => {
  const { summary } = computeTransectStatistics(series(0, [2018, 2021, 2024]), 100);
  assert.strictEqual(summary.stableTransects, summary.transectCount);
  assert.ok(Math.abs(summary.meanRateMetersPerYear) < 0.05);
});

test("throws with fewer than two shorelines", () => {
  assert.throws(() => computeTransectStatistics([{ year: 2020, points: base }]));
});
