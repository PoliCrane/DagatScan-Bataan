const { test } = require("node:test");
const assert = require("node:assert");
const g = require("../services/geoUtils");

const westCoast = [
  [14.7, 120.25],
  [14.68, 120.25],
  [14.66, 120.25],
];
const eastCoast = [
  [14.7, 120.55],
  [14.68, 120.55],
  [14.66, 120.55],
];

test("seaward normal points west on the west coast", () => {
  const normals = g.seawardUnitNormals(westCoast);
  assert.ok(normals[1][1] < -0.9, `expected east component ~-1, got ${normals[1][1]}`);
});

test("seaward normal points east on the east coast", () => {
  const normals = g.seawardUnitNormals(eastCoast);
  assert.ok(normals[1][1] > 0.9, `expected east component ~+1, got ${normals[1][1]}`);
});

test("longitude meters shrink with latitude (cos correction)", () => {
  const atEquator = g.metersPerDegreeLon(0);
  const atBataan = g.metersPerDegreeLon(14.7);
  assert.ok(atBataan < atEquator);
  assert.ok(Math.abs(atBataan - 107676) < 500);
});

test("offset then measure round-trips the distance", () => {
  const moved = g.offsetCoastlineSeaward(westCoast, -50);
  const changes = g.signedSeawardChanges(westCoast, moved);
  const net = g.median(changes.map((c) => c.changeMeters));
  assert.ok(Math.abs(net - -50) < 0.5, `expected ~-50, got ${net}`);
});

test("alignOrientation reverses a flipped line", () => {
  const flipped = [...westCoast].reverse();
  const aligned = g.alignOrientation(westCoast, flipped);
  assert.deepStrictEqual(aligned[0], westCoast[0]);
});

test("haversine distance matches a known value", () => {
  const d = g.haversineMeters([14.7, 120.25], [14.7, 120.26]);
  assert.ok(Math.abs(d - 1076) < 10, `expected ~1076 m, got ${d}`);
});
