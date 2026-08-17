const { test } = require("node:test");
const assert = require("node:assert");
const { calculateEPR, calculateLRR } = require("../services/eprCalculator");
const { offsetCoastlineSeaward } = require("../services/geoUtils");

const base = [
  [14.7, 120.25],
  [14.69, 120.251],
  [14.68, 120.25],
  [14.67, 120.249],
  [14.66, 120.25],
];
const toLonLat = (pts) => pts.map(([lat, lon]) => [lon, lat]);

test("EPR reports erosion as a negative rate", () => {
  const eroded = offsetCoastlineSeaward(base, -25);
  const r = calculateEPR(toLonLat(base), toLonLat(eroded), 2020, 2025);
  assert.ok(Math.abs(r.erosionRate - -5) < 0.05, `expected ~-5, got ${r.erosionRate}`);
  assert.ok(Math.abs(r.netChange - -25) < 0.25);
});

test("EPR reports accretion as a positive rate", () => {
  const accreted = offsetCoastlineSeaward(base, 15);
  const r = calculateEPR(toLonLat(base), toLonLat(accreted), 2020, 2025);
  assert.ok(Math.abs(r.erosionRate - 3) < 0.05, `expected ~+3, got ${r.erosionRate}`);
});

test("EPR is independent of point order and year order", () => {
  const eroded = offsetCoastlineSeaward(base, -25);
  const reversed = calculateEPR(toLonLat(base), toLonLat([...eroded].reverse()), 2020, 2025);
  const swappedYears = calculateEPR(toLonLat(eroded), toLonLat(base), 2025, 2020);
  assert.ok(Math.abs(reversed.erosionRate - -5) < 0.05);
  assert.ok(Math.abs(swappedYears.erosionRate - -5) < 0.05);
});

test("EPR rejects invalid input", () => {
  assert.throws(() => calculateEPR([], toLonLat(base), 2020, 2021));
  assert.throws(() => calculateEPR(toLonLat(base), toLonLat(base), 2020, 2020));
  assert.throws(() => calculateEPR([[999, 0]], toLonLat(base), 2020, 2021));
});

test("LRR fits a perfect linear trend exactly", () => {
  const r = calculateLRR([
    { year: 2020, value: 0 },
    { year: 2021, value: -5 },
    { year: 2022, value: -10 },
    { year: 2023, value: -15 },
  ]);
  assert.ok(Math.abs(r.slope - -5) < 1e-9);
  assert.strictEqual(r.confidence, 1);
  assert.strictEqual(r.sampleCount, 4);
});

test("LRR reports real r2 without a confidence floor", () => {
  const r = calculateLRR([
    { year: 2020, value: 0 },
    { year: 2021, value: -10 },
    { year: 2022, value: 2 },
    { year: 2023, value: -14 },
  ]);
  assert.ok(r.confidence < 0.5, `noisy fit must not be floored at 0.5, got ${r.confidence}`);
  assert.ok(r.confidence >= 0);
});

test("LRR requires at least two points", () => {
  assert.throws(() => calculateLRR([{ year: 2020, value: 0 }]));
});
