import { describe, expect, test } from "vitest";
import {
  boxFromCenter,
  centerAndSizeFromBox,
  normalizeBox,
  toPolylines,
  nearestPointOnPolylines,
  polylinesCrossBox,
  effectiveMetersPerPixel,
  resolutionQuality,
  estimateCoastlineBendDegrees,
  estimateFittedSizeMeters,
  isPointOnLand,
  estimateLandFraction,
  validateAoi,
  DEFAULT_AOI_METERS,
  SNAP_RADIUS_M,
  MAX_SNAP_DISTANCE_M,
  CURVE_STRAIGHT_SIZE_M,
  CURVE_SHARP_SIZE_M,
} from "./aoiGeometry";

// A 0.02deg-square "land" polygon (outer ring only, raw GeoJSON [lon, lat] order)
// centered on [14.56, 120.385] — big enough to fully contain some test boxes and only
// partially overlap others.
const squareLandRing = [
  [120.375, 14.55],
  [120.395, 14.55],
  [120.395, 14.57],
  [120.375, 14.57],
  [120.375, 14.55],
];

// A north-south line just off Bagac's west coast.
const coast = [
  [14.55, 120.385],
  [14.56, 120.385],
  [14.57, 120.385],
];

// An L-shaped line: straight north, then a sharp 90-degree turn east.
const bentCoast = [
  [14.55, 120.385],
  [14.56, 120.385],
  [14.56, 120.395],
];

describe("boxFromCenter / centerAndSizeFromBox", () => {
  test("round-trips a centre and size", () => {
    const box = boxFromCenter([14.56, 120.385], DEFAULT_AOI_METERS);
    const { center, widthMeters, heightMeters } = centerAndSizeFromBox(box);
    expect(center[0]).toBeCloseTo(14.56, 6);
    expect(center[1]).toBeCloseTo(120.385, 6);
    expect(widthMeters).toBeCloseTo(DEFAULT_AOI_METERS, 0);
    expect(heightMeters).toBeCloseTo(DEFAULT_AOI_METERS, 0);
  });

  test("corrects longitude for latitude, so the box is square on the ground", () => {
    const box = boxFromCenter([14.56, 120.385], 1700);
    const lonSpan = box.lonMax - box.lonMin;
    const latSpan = box.latMax - box.latMin;
    // A degree of longitude is shorter here, so it takes more of them to cover 1700 m.
    expect(lonSpan).toBeGreaterThan(latSpan);
  });
});

describe("normalizeBox", () => {
  test("swaps inverted bounds", () => {
    const n = normalizeBox({ lonMin: 120.4, lonMax: 120.3, latMin: 14.6, latMax: 14.5 });
    expect(n).toEqual({ lonMin: 120.3, lonMax: 120.4, latMin: 14.5, latMax: 14.6 });
  });
});

describe("toPolylines", () => {
  test("wraps a single flat polyline", () => {
    expect(toPolylines(coast)).toEqual([coast]);
  });

  test("passes through a list of polylines", () => {
    expect(toPolylines([coast, coast])).toHaveLength(2);
  });

  test("handles empty and malformed input", () => {
    expect(toPolylines([])).toEqual([]);
    expect(toPolylines(null)).toEqual([]);
  });
});

describe("nearestPointOnPolylines", () => {
  test("projects onto a segment, not just its endpoints", () => {
    // Due east of the middle of the line — the nearest point is on the segment interior.
    const result = nearestPointOnPolylines([14.56, 120.395], [coast]);
    expect(result.point[0]).toBeCloseTo(14.56, 4);
    expect(result.point[1]).toBeCloseTo(120.385, 4);
    expect(result.distanceMeters).toBeGreaterThan(900);
    expect(result.distanceMeters).toBeLessThan(1200);
  });

  test("reports which line and segment the nearest point came from", () => {
    const result = nearestPointOnPolylines([14.56, 120.395], [coast]);
    expect(result.lineIndex).toBe(0);
    // The nearest point lands exactly on the shared vertex between segments 0 and 1;
    // ties go to whichever segment is checked first.
    expect(result.segmentIndex).toBe(0);
    expect(result.t).toBeCloseTo(1, 5);
  });

  test("clamps beyond an endpoint instead of running off the line", () => {
    // Well north of the line's end; the answer must be the endpoint itself.
    const result = nearestPointOnPolylines([14.6, 120.385], [coast]);
    expect(result.point[0]).toBeCloseTo(14.57, 4);
    expect(result.point[1]).toBeCloseTo(120.385, 4);
  });

  test("returns null when there is nothing to snap to", () => {
    expect(nearestPointOnPolylines([14.56, 120.385], [])).toBeNull();
  });
});

describe("polylinesCrossBox", () => {
  test("true when the coastline runs through the box", () => {
    expect(polylinesCrossBox([coast], boxFromCenter([14.56, 120.385], 1700))).toBe(true);
  });

  test("true when a segment cuts across without either end inside", () => {
    // Box is small and sits on the line, between two widely spaced vertices.
    const sparse = [[14.5, 120.385], [14.7, 120.385]];
    expect(polylinesCrossBox([sparse], boxFromCenter([14.6, 120.385], 500))).toBe(true);
  });

  test("false for a box well inland", () => {
    expect(polylinesCrossBox([coast], boxFromCenter([14.56, 120.45], 1700))).toBe(false);
  });
});

describe("effectiveMetersPerPixel", () => {
  test("a 1.7 km box traces at about 6.6 m per pixel", () => {
    expect(effectiveMetersPerPixel(boxFromCenter([14.56, 120.385], 1700))).toBeCloseTo(6.64, 1);
  });

  test("the longer side sets the resolution", () => {
    const wide = { lonMin: 120.3, lonMax: 120.4, latMin: 14.56, latMax: 14.565 };
    const { widthMeters } = centerAndSizeFromBox(wide);
    expect(effectiveMetersPerPixel(wide)).toBeCloseTo(widthMeters / 256, 3);
  });

  test("grades resolution", () => {
    expect(resolutionQuality(6.6)).toBe("recommended");
    expect(resolutionQuality(10)).toBe("acceptable");
    expect(resolutionQuality(40)).toBe("coarse");
  });
});

describe("validateAoi", () => {
  const good = boxFromCenter([14.56, 120.385], 1700);

  test("an empty form raises nothing", () => {
    expect(validateAoi({ box: null })).toEqual({ errors: [], warnings: [] });
  });

  test("a sensible coastal box is clean", () => {
    const { errors, warnings } = validateAoi({ box: good, polylines: [coast] });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("blocks inverted bounds", () => {
    const { errors } = validateAoi({ box: { lonMin: 120.4, lonMax: 120.3, latMin: 14.6, latMax: 14.5 } });
    expect(errors.map((e) => e.code)).toContain("ORDER");
  });

  test("blocks swapped latitude and longitude", () => {
    const { errors } = validateAoi({ box: { lonMin: 14.5, lonMax: 14.6, latMin: 120.3, latMax: 120.4 } });
    expect(errors.map((e) => e.code)).toContain("OUT_OF_RANGE");
  });

  test("blocks a box outside Bataan", () => {
    const { errors } = validateAoi({ box: boxFromCenter([14.6, 121.0], 1700) });
    expect(errors.map((e) => e.code)).toContain("OUTSIDE_BATAAN");
  });

  test("blocks boxes that are too small or too large", () => {
    expect(validateAoi({ box: boxFromCenter([14.56, 120.385], 100) }).errors.map((e) => e.code))
      .toContain("TOO_SMALL");
    expect(validateAoi({ box: boxFromCenter([14.56, 120.385], 30000) }).errors.map((e) => e.code))
      .toContain("TOO_LARGE");
  });

  test("warns, but does not block, when no coastline crosses the box", () => {
    const { errors, warnings } = validateAoi({
      box: boxFromCenter([14.56, 120.45], 1700),
      polylines: [coast],
    });
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain("NO_STRADDLE");
  });

  test("warns about coarse resolution on a wide box", () => {
    const { warnings } = validateAoi({ box: boxFromCenter([14.56, 120.385], 8000), polylines: [coast] });
    expect(warnings.map((w) => w.code)).toContain("COARSE_RESOLUTION");
  });

  test("blocks when there is no coastline data at all for the municipality", () => {
    const { errors } = validateAoi({ box: good, polylines: [] });
    expect(errors.map((e) => e.code)).toContain("NO_COASTLINE_DATA");
  });

  test("warns, but does not block, between the snap radius and the hard distance cutoff", () => {
    const { errors, warnings } = validateAoi({
      box: good,
      polylines: [coast],
      snapDistanceMeters: (SNAP_RADIUS_M + MAX_SNAP_DISTANCE_M) / 2,
    });
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain("FAR_FROM_COAST");
  });

  test("blocks past the hard distance cutoff", () => {
    const { errors } = validateAoi({
      box: good,
      polylines: [coast],
      snapDistanceMeters: MAX_SNAP_DISTANCE_M + 1,
    });
    expect(errors.map((e) => e.code)).toContain("TOO_FAR_FROM_COAST");
  });

  test("blocks a landlocked municipality outright, even with an otherwise fine box", () => {
    const { errors, warnings } = validateAoi({ box: good, polylines: [coast], isLandlockedMunicipality: true });
    expect(errors.map((e) => e.code)).toEqual(["LANDLOCKED_MUNICIPALITY"]);
    expect(warnings).toEqual([]);
  });

  test("an empty form with a landlocked municipality still raises nothing", () => {
    expect(validateAoi({ box: null, isLandlockedMunicipality: true })).toEqual({ errors: [], warnings: [] });
  });

  test("warns when the box diverges from an existing area's stored bounds", () => {
    const stored = { west: 120.38, east: 120.395, south: 14.553, north: 14.568 };
    const moved = boxFromCenter([14.59, 120.385], 1700);
    const { warnings } = validateAoi({ box: moved, polylines: [coast], storedBounds: stored, areaName: "Bagac Bay" });
    expect(warnings.map((w) => w.code)).toContain("AREA_DIVERGENCE");
  });

  test("does not warn when the box matches the stored bounds", () => {
    const stored = { west: 120.38, east: 120.395, south: 14.553, north: 14.568 };
    const same = { lonMin: stored.west, lonMax: stored.east, latMin: stored.south, latMax: stored.north };
    const { warnings } = validateAoi({ box: same, polylines: [coast], storedBounds: stored });
    expect(warnings.map((w) => w.code)).not.toContain("AREA_DIVERGENCE");
  });

  test("warns when the box is mostly water", () => {
    const { errors, warnings } = validateAoi({ box: good, polylines: [coast], landFraction: 0.02 });
    expect(errors).toEqual([]);
    const w = warnings.find((x) => x.code === "LOPSIDED_BOX");
    expect(w).toBeTruthy();
    expect(w.message).toMatch(/mostly water/);
  });

  test("warns when the box is mostly land", () => {
    const { warnings } = validateAoi({ box: good, polylines: [coast], landFraction: 0.97 });
    const w = warnings.find((x) => x.code === "LOPSIDED_BOX");
    expect(w).toBeTruthy();
    expect(w.message).toMatch(/mostly land/);
  });

  test("does not warn about a reasonably balanced box", () => {
    const { warnings } = validateAoi({ box: good, polylines: [coast], landFraction: 0.5 });
    expect(warnings.map((w) => w.code)).not.toContain("LOPSIDED_BOX");
  });

  test("says nothing about balance when there's no land data to check", () => {
    const { warnings } = validateAoi({ box: good, polylines: [coast], landFraction: null });
    expect(warnings.map((w) => w.code)).not.toContain("LOPSIDED_BOX");
  });
});

describe("isPointOnLand", () => {
  test("true for a point inside the polygon", () => {
    expect(isPointOnLand([14.56, 120.385], [squareLandRing])).toBe(true);
  });

  test("false for a point outside the polygon", () => {
    expect(isPointOnLand([14.56, 120.5], [squareLandRing])).toBe(false);
  });

  test("false with no rings to test against", () => {
    expect(isPointOnLand([14.56, 120.385], [])).toBe(false);
  });
});

describe("estimateLandFraction", () => {
  test("1 for a box entirely inside land", () => {
    const box = boxFromCenter([14.56, 120.385], 500);
    expect(estimateLandFraction(box, [squareLandRing])).toBe(1);
  });

  test("0 for a box entirely outside land", () => {
    const box = boxFromCenter([14.56, 120.5], 500);
    expect(estimateLandFraction(box, [squareLandRing])).toBe(0);
  });

  test("somewhere in between for a box straddling the land's edge", () => {
    const box = boxFromCenter([14.56, 120.395], 1000);
    const fraction = estimateLandFraction(box, [squareLandRing]);
    expect(fraction).toBeGreaterThan(0.2);
    expect(fraction).toBeLessThan(0.8);
  });

  test("null with no land data available", () => {
    expect(estimateLandFraction(boxFromCenter([14.56, 120.385], 500), [])).toBeNull();
  });
});

describe("estimateCoastlineBendDegrees", () => {
  test("reads near zero on a dead-straight stretch", () => {
    const bend = estimateCoastlineBendDegrees([14.56, 120.385], [coast]);
    expect(bend).toBeCloseTo(0, 0);
  });

  test("reads close to 90 degrees at a sharp corner", () => {
    // Querying the corner itself: the sample window lands squarely on one straight
    // leg on each side, so the measured turn matches the corner's real angle.
    const bend = estimateCoastlineBendDegrees([14.56, 120.385], [bentCoast]);
    expect(bend).toBeCloseTo(90, 0);
  });

  test("reads a smaller angle near, but not exactly at, a corner", () => {
    // The sample window straddles the bend, blending both legs — a real limitation of
    // this heuristic worth having a test pin down, not just a comment.
    const bend = estimateCoastlineBendDegrees([14.5595, 120.385], [bentCoast]);
    expect(bend).toBeGreaterThan(30);
    expect(bend).toBeLessThan(90);
  });

  test("returns null with nothing to measure against", () => {
    expect(estimateCoastlineBendDegrees([14.56, 120.385], [])).toBeNull();
  });
});

describe("estimateFittedSizeMeters", () => {
  test("picks the larger, straight-coast size", () => {
    expect(estimateFittedSizeMeters([14.56, 120.385], [coast])).toBe(CURVE_STRAIGHT_SIZE_M);
  });

  test("picks the smaller, sharp-bend size", () => {
    expect(estimateFittedSizeMeters([14.5595, 120.385], [bentCoast])).toBe(CURVE_SHARP_SIZE_M);
  });

  test("falls back to the default with no coastline to measure", () => {
    expect(estimateFittedSizeMeters([14.56, 120.385], [])).toBe(DEFAULT_AOI_METERS);
  });
});
