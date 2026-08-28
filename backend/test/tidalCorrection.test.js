const { test } = require("node:test");
const assert = require("node:assert");
const { horizontalTideDisplacementMeters, correctShorelineToDatum } = require("../services/tidalCorrection");
const { signedSeawardChanges, median } = require("../services/geoUtils");

test("displacement follows tide over tan(slope)", () => {
  const d = horizontalTideDisplacementMeters(1.0, 3);
  assert.ok(Math.abs(d - 19.08) < 0.1, `1m tide over 3 deg slope ~19.1m, got ${d.toFixed(2)}`);
  assert.ok(Math.abs(horizontalTideDisplacementMeters(-0.5, 3) + 9.54) < 0.1);
  assert.throws(() => horizontalTideDisplacementMeters(1, 0));
});

test("high-water shoreline is pushed seaward to the datum", () => {
  const base = [
    [14.7, 120.25],
    [14.68, 120.25],
    [14.66, 120.25],
  ];
  const corrected = correctShorelineToDatum(base, 1.0, 3);
  const changes = signedSeawardChanges(base, corrected);
  const net = median(changes.map((c) => c.changeMeters));
  assert.ok(Math.abs(net - 19.08) < 0.5, `expected ~+19m seaward, got ${net.toFixed(2)}`);
});
