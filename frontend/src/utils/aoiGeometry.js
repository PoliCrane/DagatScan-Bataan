// Area-of-interest maths for the Data Upload map picker: turning a pinned point into the
// bounding box the NDWI pipeline wants, snapping that pin to the real coastline, and
// catching the box mistakes that would otherwise only surface as an Earth Engine failure
// a minute and a half later. Pure — no React, no Leaflet.

import { METERS_PER_DEGREE_LAT, metersPerDegreeLon, haversineMeters } from "./geometry";

// The production norm: earthEngineService.js describes an AOI as "~1.7 km across", and
// Docs/ERROR_BUDGET.md names a tight box the single biggest accuracy lever there is.
export const DEFAULT_AOI_METERS = 1700;
export const MIN_AOI_METERS = 300;
export const MAX_AOI_METERS = 20000;
// Slider range stops well short of MAX_AOI_METERS so the recommended size isn't crushed
// into the first few percent of the travel; bigger boxes stay reachable by typing.
// Capped at 2.5 km specifically so the slider itself can't offer a box that reads
// "Coarse" — that end of the scale is still reachable by typing, just not by dragging.
export const SLIDER_MIN_METERS = 300;
export const SLIDER_MAX_METERS = 2500;

// Within this radius, a click moves the pin onto the coastline — it's still a nudge
// toward what the admin was aiming at. Beyond it (but inside MAX_SNAP_DISTANCE_M) the
// pin stays put and we just report the distance instead of relocating them.
export const SNAP_RADIUS_M = 250;
// Past this, the click is too far from any known coastline to trust — blocks generation
// outright instead of leaving it as a warning an admin could miss.
export const MAX_SNAP_DISTANCE_M = 500;

// The shoreline tracer resamples every image to 256x256 (imageCNNDetection.js), which is
// what makes box extent and ground resolution the same decision.
export const TRACE_SIZE = 256;
export const RECOMMENDED_M_PER_PX = 8;
export const ACCEPTABLE_M_PER_PX = 12;

// BATAAN.geojson measures W 120.2231 / S 14.3659 / E 120.6153 / N 14.9492; padded so a
// legitimately offshore box still counts as being in the province.
export const BATAAN_BBOX = { west: 120.15, south: 14.3, east: 120.7, north: 15.0 };

/** Guarantees lonMin < lonMax and latMin < latMax — ee.Geometry.Rectangle fails opaquely otherwise. */
export function normalizeBox(box) {
  return {
    lonMin: Math.min(box.lonMin, box.lonMax),
    lonMax: Math.max(box.lonMin, box.lonMax),
    latMin: Math.min(box.latMin, box.latMax),
    latMax: Math.max(box.latMin, box.latMax),
  };
}

/** Square-in-metres box around a [lat, lng] centre. */
export function boxFromCenter([lat, lng], sizeMeters) {
  const halfLat = sizeMeters / 2 / METERS_PER_DEGREE_LAT;
  const halfLon = sizeMeters / 2 / metersPerDegreeLon(lat);
  return {
    lonMin: lng - halfLon,
    lonMax: lng + halfLon,
    latMin: lat - halfLat,
    latMax: lat + halfLat,
  };
}

/** Centre plus real ground dimensions of a box — which need not be square if it was typed. */
export function centerAndSizeFromBox(box) {
  const n = normalizeBox(box);
  const lat = (n.latMin + n.latMax) / 2;
  const lng = (n.lonMin + n.lonMax) / 2;
  return {
    center: [lat, lng],
    widthMeters: (n.lonMax - n.lonMin) * metersPerDegreeLon(lat),
    heightMeters: (n.latMax - n.latMin) * METERS_PER_DEGREE_LAT,
  };
}

/**
 * Ground resolution the tracer will actually work at. The grid is square, so the longer
 * side of the box sets the pixel size for both axes.
 */
export function effectiveMetersPerPixel(box) {
  const { widthMeters, heightMeters } = centerAndSizeFromBox(box);
  return Math.max(widthMeters, heightMeters) / TRACE_SIZE;
}

export function resolutionQuality(metersPerPixel) {
  if (metersPerPixel <= RECOMMENDED_M_PER_PX) return "recommended";
  if (metersPerPixel <= ACCEPTABLE_M_PER_PX) return "acceptable";
  return "coarse";
}

/**
 * extractCoastline returns a bare [lat,lng] list when the coastline came out as one
 * polyline, and a list of those when it didn't. Everything downstream wants the latter.
 */
export function toPolylines(coastline) {
  if (!Array.isArray(coastline) || coastline.length === 0) return [];
  const first = coastline[0];
  if (Array.isArray(first) && typeof first[0] === "number") return [coastline];
  return coastline.filter((line) => Array.isArray(line) && line.length >= 2);
}

/**
 * Closest point on any polyline to `point`, as
 * { point: [lat, lng], distanceMeters, lineIndex, segmentIndex, t }.
 *
 * lineIndex/segmentIndex/t locate the result within `polylines` (which line, which
 * segment of it, how far along that segment) so a caller can keep walking the same
 * line from there — estimateCoastlineBendDegrees below is exactly that caller.
 *
 * Projection is clamped to each segment: these polylines are open and their real
 * endpoints are ordinary points, which an unclamped perpendicular would fly past.
 * Distances are computed in a local metre frame pinned at `point`, so the longitude
 * scaling is right for this latitude.
 */
export function nearestPointOnPolylines([lat, lng], polylines) {
  const mLat = METERS_PER_DEGREE_LAT;
  const mLon = metersPerDegreeLon(lat);
  const toLocal = ([pLat, pLng]) => [(pLng - lng) * mLon, (pLat - lat) * mLat];

  let best = null;

  for (let li = 0; li < polylines.length; li++) {
    const line = polylines[li];
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = toLocal(line[i]);
      const [bx, by] = toLocal(line[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx + -ay * dy) / lenSq));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const distSq = cx * cx + cy * cy;
      if (!best || distSq < best.distSq) best = { distSq, cx, cy, lineIndex: li, segmentIndex: i, t };
    }
  }

  if (!best) return null;
  return {
    point: [lat + best.cy / mLat, lng + best.cx / mLon],
    distanceMeters: Math.sqrt(best.distSq),
    lineIndex: best.lineIndex,
    segmentIndex: best.segmentIndex,
    t: best.t,
  };
}

// Arc-length walked on either side of the snapped point when judging how sharply the
// coast bends there — short enough to stay local to one cove or point, long enough that
// pixel-level jitter in a traced line doesn't dominate the angle.
export const CURVATURE_SAMPLE_M = 150;

// A dead-straight stretch gets the larger end of the "Best Box" range; a tight bend
// gets the smaller end. Both sit inside the Item-5 slider range so the button never
// needs to reach for a size the slider itself can't show. First-pass numbers — expect
// to retune these once seen against real traced coastlines.
export const CURVE_STRAIGHT_ANGLE_DEG = 10;
export const CURVE_SHARP_ANGLE_DEG = 40;
export const CURVE_STRAIGHT_SIZE_M = 2200;
export const CURVE_SHARP_SIZE_M = 800;

function pointAtArcLength(localPoints, cumulative, targetS) {
  const total = cumulative[cumulative.length - 1];
  const s = Math.max(0, Math.min(total, targetS));
  for (let i = 0; i < cumulative.length - 1; i++) {
    if (s <= cumulative[i + 1]) {
      const segLen = cumulative[i + 1] - cumulative[i];
      const t = segLen === 0 ? 0 : (s - cumulative[i]) / segLen;
      const [ax, ay] = localPoints[i];
      const [bx, by] = localPoints[i + 1];
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
  }
  return localPoints[localPoints.length - 1];
}

/**
 * How sharply the coastline bends at the point on `polylines` nearest to `point`, in
 * degrees — 0 is dead straight, larger is a tighter curve. Null if there's nothing to
 * measure against.
 *
 * Walks CURVATURE_SAMPLE_M along the traced line to either side of the snap point and
 * measures the turn between the direction leading into it and the direction leading out.
 */
export function estimateCoastlineBendDegrees(point, polylines) {
  const nearest = nearestPointOnPolylines(point, polylines);
  if (!nearest) return null;

  const line = polylines[nearest.lineIndex];
  const [refLat, refLng] = nearest.point;
  const mLat = METERS_PER_DEGREE_LAT;
  const mLon = metersPerDegreeLon(refLat);
  const localPoints = line.map(([lat, lng]) => [(lng - refLng) * mLon, (lat - refLat) * mLat]);

  const cumulative = [0];
  for (let i = 0; i < localPoints.length - 1; i++) {
    const [ax, ay] = localPoints[i];
    const [bx, by] = localPoints[i + 1];
    cumulative.push(cumulative[i] + Math.hypot(bx - ax, by - ay));
  }

  const [ax, ay] = localPoints[nearest.segmentIndex];
  const [bx, by] = localPoints[nearest.segmentIndex + 1];
  const s0 = cumulative[nearest.segmentIndex] + nearest.t * Math.hypot(bx - ax, by - ay);

  const before = pointAtArcLength(localPoints, cumulative, s0 - CURVATURE_SAMPLE_M);
  const here = pointAtArcLength(localPoints, cumulative, s0);
  const after = pointAtArcLength(localPoints, cumulative, s0 + CURVATURE_SAMPLE_M);

  const v1 = [here[0] - before[0], here[1] - before[1]];
  const v2 = [after[0] - here[0], after[1] - here[1]];
  const len1 = Math.hypot(v1[0], v1[1]);
  const len2 = Math.hypot(v2[0], v2[1]);
  // Too little real line on one side to judge (a short traced segment, or the snap
  // point sitting right at an endpoint) — assume straight rather than guessing sharp.
  if (len1 < 1 || len2 < 1) return 0;

  const cross = v1[0] * v2[1] - v1[1] * v2[0];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  return Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
}

/**
 * Box size that fits the coastline's local shape at `point`: larger on a straight
 * stretch, smaller on a tight bend, always inside the slider's range. Falls back to
 * DEFAULT_AOI_METERS when there's no coastline to measure against.
 */
export function estimateFittedSizeMeters(point, polylines) {
  const bend = estimateCoastlineBendDegrees(point, polylines);
  if (bend === null) return DEFAULT_AOI_METERS;

  if (bend <= CURVE_STRAIGHT_ANGLE_DEG) return CURVE_STRAIGHT_SIZE_M;
  if (bend >= CURVE_SHARP_ANGLE_DEG) return CURVE_SHARP_SIZE_M;

  const t = (bend - CURVE_STRAIGHT_ANGLE_DEG) / (CURVE_SHARP_ANGLE_DEG - CURVE_STRAIGHT_ANGLE_DEG);
  return Math.round(CURVE_STRAIGHT_SIZE_M + (CURVE_SHARP_SIZE_M - CURVE_STRAIGHT_SIZE_M) * t);
}

function pointInBox([lat, lng], box) {
  return lng >= box.lonMin && lng <= box.lonMax && lat >= box.latMin && lat <= box.latMax;
}

/**
 * Does any coastline segment pass through the box?
 *
 * If a shoreline crosses it, the box holds land and water by construction — which is the
 * thing the tracer needs and the thing a corner-sampling test gets wrong along Bataan's
 * inland border (see the note in AoiPicker about the province-only polygon file).
 * Liang-Barsky clip, so a segment that cuts the box without ending inside it still counts.
 */
export function polylinesCrossBox(polylines, box) {
  const b = normalizeBox(box);

  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lat1, lng1] = line[i];
      const [lat2, lng2] = line[i + 1];
      if (pointInBox(line[i], b) || pointInBox(line[i + 1], b)) return true;

      let t0 = 0;
      let t1 = 1;
      const dx = lng2 - lng1;
      const dy = lat2 - lat1;
      const clip = (p, q) => {
        if (p === 0) return q >= 0;
        const r = q / p;
        if (p < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
        return true;
      };

      if (
        clip(-dx, lng1 - b.lonMin) &&
        clip(dx, b.lonMax - lng1) &&
        clip(-dy, lat1 - b.latMin) &&
        clip(dy, b.latMax - lat1)
      ) {
        return true;
      }
    }
  }

  return false;
}

function boxesOverlap(a, b) {
  return a.lonMin <= b.east && a.lonMax >= b.west && a.latMin <= b.north && a.latMax >= b.south;
}

// Sample grid for estimateLandFraction below — 7x7 is coarse but cheap, and plenty to
// tell "mostly one class" from "a reasonable mix" without needing pixel precision.
export const GRID_SAMPLE_SIZE = 7;
export const LOPSIDED_LAND_FRACTION_LOW = 0.15;
export const LOPSIDED_LAND_FRACTION_HIGH = 0.85;

// Ray-casting point-in-polygon, faithful to backend/services/geoUtils.js's pointInRing
// so land/water classification agrees with what the server already trusts — same ring
// data (BATAAN.geojson's own polygons), same algorithm, just handed the rings directly
// since this module has no filesystem access to load them itself.
function pointInRing([lat, lng], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Is this [lat, lng] point on real Bataan landmass? `landRings` = every municipality
 * polygon's outer ring, in raw GeoJSON [lon, lat] order. */
export function isPointOnLand([lat, lng], landRings) {
  return landRings.some((ring) => pointInRing([lat, lng], ring));
}

/**
 * Fraction of `box` that sits on real landmass, sampled on a gridSize x gridSize grid:
 * 0 = entirely water, 1 = entirely land, null if there's no land data to check against.
 *
 * This tests actual land shape, not the derived "coastline" edges — so unlike
 * extractCoastline, it isn't thrown off by Bataan's land border with Pampanga/Zambales
 * reading as a false coastline; a point is either really inside a real polygon or it isn't.
 */
export function estimateLandFraction(box, landRings, gridSize = GRID_SAMPLE_SIZE) {
  if (!landRings || landRings.length === 0) return null;

  let land = 0;
  let total = 0;
  for (let i = 0; i < gridSize; i++) {
    const lat = box.latMin + ((i + 0.5) / gridSize) * (box.latMax - box.latMin);
    for (let j = 0; j < gridSize; j++) {
      const lng = box.lonMin + ((j + 0.5) / gridSize) * (box.lonMax - box.lonMin);
      total++;
      if (isPointOnLand([lat, lng], landRings)) land++;
    }
  }
  return land / total;
}

/**
 * Everything wrong with a box, split by whether it should stop a submit.
 *
 * Errors are things the pipeline cannot recover from. Warnings are things that will
 * probably waste the admin's time or quietly cost accuracy — including the straddle
 * check, which is deliberately non-blocking because the coastline it tests against is
 * itself approximate.
 *
 * An empty form is not an error: the existing "All bounds fields are required" message
 * still owns that case.
 */
export function validateAoi({
  box,
  polylines = [],
  snapDistanceMeters = null,
  storedBounds = null,
  areaName = null,
  isLandlockedMunicipality = false,
  landFraction = null,
}) {
  const errors = [];
  const warnings = [];
  if (!box) return { errors, warnings };

  const add = (list, code, message) => list.push({ code, message });

  if (isLandlockedMunicipality) {
    // Blocks the hand-typed-coordinates path too, not just the map click — a box aimed
    // at a municipality with no real coast is wrong regardless of how it was entered.
    add(errors, "LANDLOCKED_MUNICIPALITY", "This municipality has no coastline to generate against.");
    return { errors, warnings };
  }

  if (box.lonMin >= box.lonMax || box.latMin >= box.latMax) {
    add(errors, "ORDER", "Minimum values must be smaller than maximum values.");
  }
  if ([box.latMin, box.latMax].some((v) => v < -90 || v > 90) ||
      [box.lonMin, box.lonMax].some((v) => v < -180 || v > 180)) {
    add(errors, "OUT_OF_RANGE", "Coordinates are out of range — latitude and longitude may be swapped.");
  }

  // Ordering/range have to be sane before any measurement of the box means anything.
  if (errors.length > 0) return { errors, warnings };

  const { center, widthMeters, heightMeters } = centerAndSizeFromBox(box);
  const longest = Math.max(widthMeters, heightMeters);

  if (!boxesOverlap(normalizeBox(box), BATAAN_BBOX)) {
    add(errors, "OUTSIDE_BATAAN", "This area is outside Bataan.");
  }
  if (longest < MIN_AOI_METERS) {
    add(errors, "TOO_SMALL", `Too small (${Math.round(longest)} m). Use at least ${MIN_AOI_METERS} m.`);
  }
  if (longest > MAX_AOI_METERS) {
    add(errors, "TOO_LARGE", `Too large (${(longest / 1000).toFixed(1)} km). Keep it under ${MAX_AOI_METERS / 1000} km.`);
  }

  if (errors.length === 0) {
    if (polylines.length === 0) {
      // Nothing to straddle-check or measure distance against — a box picked with no
      // coastline reference at all can't be trusted the way one checked against a real
      // line can, so this blocks rather than joining the (non-blocking) straddle warning.
      add(errors, "NO_COASTLINE_DATA", "No coastline data is available for this municipality yet.");
    } else {
      if (!polylinesCrossBox(polylines, box)) {
        add(
          warnings,
          "NO_STRADDLE",
          "No coastline runs through this box, so it may be all land or all water. Generating would fail after up to 90 seconds with \"Water/land mask is all-water or all-land\"."
        );
      }
      if (snapDistanceMeters != null && snapDistanceMeters > MAX_SNAP_DISTANCE_M) {
        add(
          errors,
          "TOO_FAR_FROM_COAST",
          `This location is too far from any known coastline (${(snapDistanceMeters / 1000).toFixed(1)} km) to generate here.`
        );
      } else if (snapDistanceMeters != null && snapDistanceMeters > SNAP_RADIUS_M) {
        add(
          warnings,
          "FAR_FROM_COAST",
          `The pin is ${(snapDistanceMeters / 1000).toFixed(1)} km from the nearest traced coastline.`
        );
      }
    }

    const mpp = effectiveMetersPerPixel(box);
    if (resolutionQuality(mpp) === "coarse") {
      add(
        warnings,
        "COARSE_RESOLUTION",
        `At this size the shoreline is traced at about ${mpp.toFixed(0)} m per pixel. Tighter boxes measure more precisely.`
      );
    }
    if (landFraction != null &&
        (landFraction < LOPSIDED_LAND_FRACTION_LOW || landFraction > LOPSIDED_LAND_FRACTION_HIGH)) {
      const dominant = landFraction < 0.5 ? "water" : "land";
      const pct = Math.round((landFraction < 0.5 ? 1 - landFraction : landFraction) * 100);
      add(
        warnings,
        "LOPSIDED_BOX",
        `This box is mostly ${dominant} (${pct}%) — try Best Box or resize for a more even view of the shoreline.`
      );
    }
    if (storedBounds) {
      const stored = normalizeBox({
        lonMin: storedBounds.west,
        lonMax: storedBounds.east,
        latMin: storedBounds.south,
        latMax: storedBounds.north,
      });
      const storedSize = centerAndSizeFromBox(stored);
      const moved = haversineMeters(center, storedSize.center);
      const sizeRatio = Math.max(widthMeters, heightMeters) /
        Math.max(storedSize.widthMeters, storedSize.heightMeters);
      if (moved > 200 || sizeRatio < 0.8 || sizeRatio > 1.2) {
        add(
          warnings,
          "AREA_DIVERGENCE",
          `This differs from the stored bounds for ${areaName || "this area"}. Changing the box between years shows up as phantom erosion — reuse the same box, or use a new area name.`
        );
      }
    }
  }

  return { errors, warnings };
}
