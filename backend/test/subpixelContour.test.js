const { test } = require("node:test");
const assert = require("node:assert");
const { extractSubpixelShoreline } = require("../services/subpixelContour");

function syntheticNdwi(width, height, boundaryX) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = 0.8 * Math.tanh((boundaryX - x) / 2);
    }
  }
  return data;
}

test("subpixel contour recovers a fractional boundary position", () => {
  const width = 120;
  const height = 80;
  const trueBoundary = 60.35;
  const points = extractSubpixelShoreline(syntheticNdwi(width, height, trueBoundary), width, height, 0);
  assert.ok(points.length > 30, `expected a long contour, got ${points.length}`);
  const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
  assert.ok(Math.abs(meanX - trueBoundary) < 0.25, `mean x ${meanX.toFixed(3)} vs true ${trueBoundary}`);
  const spread = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  assert.ok(spread < 1, `straight boundary must stay tight, spread=${spread.toFixed(3)}`);
});

test("subpixel beats integer thresholding on a shifted boundary", () => {
  const width = 100;
  const height = 60;
  for (const frac of [0.2, 0.5, 0.8]) {
    const trueBoundary = 50 + frac;
    const points = extractSubpixelShoreline(syntheticNdwi(width, height, trueBoundary), width, height, 0);
    const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
    assert.ok(Math.abs(meanX - trueBoundary) < 0.25, `frac ${frac}: got ${meanX.toFixed(3)}`);
  }
});

test("empty or uniform rasters return no contour", () => {
  const flat = new Float32Array(50 * 50).fill(0.5);
  assert.deepStrictEqual(extractSubpixelShoreline(flat, 50, 50, 0), []);
});
