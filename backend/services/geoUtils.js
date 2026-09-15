const fs = require("fs");
const path = require("path");

const METERS_PER_DEGREE_LAT = 111320;
const BATAAN_INTERIOR = [14.65, 120.42];

// Real municipality land polygons, loaded once — ground truth for "which side of this
// coastline point is actually land" instead of the old single-fixed-point heuristic below,
// which only holds up for a roughly-straight coastline and gets it backward at coves/inlets
// (verified empirically: 2/5 real areas had at least one point where the old method pointed
// the "seaward" normal into land). Loaded lazily so a missing/malformed file doesn't crash
// module load — callers fall back to the old heuristic if this is unavailable.
let landRingsCache = null;
function getLandRings() {
  if (landRingsCache) return landRingsCache;
  try {
    const raw = fs
      .readFileSync(path.join(__dirname, "../data/BATAAN.geojson"), "utf8")
      .replace(/^﻿/, "");
    const geo = JSON.parse(raw);
    landRingsCache = geo.features.map((f) => f.geometry.coordinates[0]);
  } catch (e) {
    landRingsCache = [];
  }
  return landRingsCache;
}

// Ray-casting point-in-polygon. point = [lon, lat], ring = [[lon, lat], ...] (raw GeoJSON order).
function pointInRing(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isOnLand(lat, lon) {
  const rings = getLandRings();
  return rings.some((ring) => pointInRing([lon, lat], ring));
}

function metersPerDegreeLon(latDeg) {
  return METERS_PER_DEGREE_LAT * Math.cos((latDeg * Math.PI) / 180);
}

function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tangentsInMeters(points) {
  return points.map((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const north = (next[0] - prev[0]) * METERS_PER_DEGREE_LAT;
    const east = (next[1] - prev[1]) * metersPerDegreeLon(point[0]);
    const len = Math.hypot(north, east);
    return len === 0 ? [0, 0] : [north / len, east / len];
  });
}

function seawardSign(points, interior = BATAAN_INTERIOR) {
  const tangents = tangentsInMeters(points);
  let cLat = 0;
  let cLng = 0;
  for (const p of points) {
    cLat += p[0];
    cLng += p[1];
  }
  cLat /= points.length;
  cLng /= points.length;
  const awayNorth = (cLat - interior[0]) * METERS_PER_DEGREE_LAT;
  const awayEast = (cLng - interior[1]) * metersPerDegreeLon(cLat);
  let dot = 0;
  for (const [tN, tE] of tangents) {
    dot += -tE * awayNorth + tN * awayEast;
  }
  return dot >= 0 ? 1 : -1;
}

// Per-point seaward normal: tests both perpendicular directions to the local tangent against
// the real land polygons and picks whichever one is water. Tries a few increasing test radii
// before giving up on a point — a traced coastline point can sit tens of meters from the true
// boundary (10m Sentinel-2 pixels, subpixel tracing error), so a single small radius leaves
// points that are merely noisy (not actually ambiguous) unresolved; empirically, one confirmed
// bad point was buried ~50m into land and only resolved at an 80m test radius. Falls back to
// the old global-fixed-point heuristic only if every radius stays ambiguous (both/neither
// candidate reads as land — e.g. a genuinely complex local coastline), so behavior degrades
// gracefully rather than guessing.
const SEAWARD_TEST_RADII_METERS = [20, 40, 80, 150];

function seawardUnitNormals(points, interior = BATAAN_INTERIOR) {
  const tangents = tangentsInMeters(points);
  const fallbackSign = seawardSign(points, interior);

  return points.map((point, i) => {
    const [tN, tE] = tangents[i];
    if (tN === 0 && tE === 0) return [fallbackSign * -tE, fallbackSign * tN];

    const [lat, lon] = point;
    const mLon = metersPerDegreeLon(lat);
    const candA = [-tE, tN];
    const candB = [tE, -tN];

    const offsetIsOnLand = ([cN, cE], radius) =>
      isOnLand(lat + (cN * radius) / METERS_PER_DEGREE_LAT, lon + (cE * radius) / mLon);

    for (const radius of SEAWARD_TEST_RADII_METERS) {
      const aOnLand = offsetIsOnLand(candA, radius);
      const bOnLand = offsetIsOnLand(candB, radius);
      if (aOnLand !== bOnLand) return aOnLand ? candB : candA;
    }
    return [fallbackSign * -tE, fallbackSign * tN];
  });
}

function offsetCoastlineSeaward(points, offsetMeters, interior = BATAAN_INTERIOR) {
  if (!points || points.length < 2) return [];
  const normals = seawardUnitNormals(points, interior);
  return points.map((point, i) => {
    const [nN, nE] = normals[i];
    const mLon = metersPerDegreeLon(point[0]) || METERS_PER_DEGREE_LAT;
    return [
      point[0] + (nN * offsetMeters) / METERS_PER_DEGREE_LAT,
      point[1] + (nE * offsetMeters) / mLon,
    ];
  });
}

function alignOrientation(reference, line) {
  if (!reference || !line || reference.length < 2 || line.length < 2) return line;
  const direct =
    haversineMeters(reference[0], line[0]) +
    haversineMeters(reference[reference.length - 1], line[line.length - 1]);
  const crossed =
    haversineMeters(reference[0], line[line.length - 1]) +
    haversineMeters(reference[reference.length - 1], line[0]);
  return crossed < direct ? [...line].reverse() : line;
}

function cumulativeArcMeters(points) {
  const lengths = [0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineMeters(points[i], points[i + 1]);
    lengths.push(total);
  }
  return { lengths, total };
}

function pointAtArcFraction(points, fraction, arc) {
  if (points.length === 1 || arc.total === 0) return points[0];
  const target = fraction * arc.total;
  for (let i = 0; i < arc.lengths.length - 1; i++) {
    if (arc.lengths[i + 1] >= target) {
      const segLen = arc.lengths[i + 1] - arc.lengths[i];
      const segFrac = segLen === 0 ? 0 : (target - arc.lengths[i]) / segLen;
      const [lat1, lng1] = points[i];
      const [lat2, lng2] = points[i + 1];
      return [lat1 + (lat2 - lat1) * segFrac, lng1 + (lng2 - lng1) * segFrac];
    }
  }
  return points[points.length - 1];
}

function signedSeawardChanges(referencePoints, comparedPoints, interior = BATAAN_INTERIOR) {
  const aligned = alignOrientation(referencePoints, comparedPoints);
  const refArc = cumulativeArcMeters(referencePoints);
  const cmpArc = cumulativeArcMeters(aligned);
  const normals = seawardUnitNormals(referencePoints, interior);

  return referencePoints.map((refPoint, idx) => {
    const fraction = refArc.total > 0 ? refArc.lengths[idx] / refArc.total : 0;
    const matched = pointAtArcFraction(aligned, fraction, cmpArc);
    const dNorth = (matched[0] - refPoint[0]) * METERS_PER_DEGREE_LAT;
    const dEast = (matched[1] - refPoint[1]) * metersPerDegreeLon(refPoint[0]);
    const [nN, nE] = normals[idx];
    return {
      referencePoint: refPoint,
      matchedPoint: matched,
      changeMeters: dNorth * nN + dEast * nE,
    };
  });
}

function perpendicularDistanceMeters(point, lineStart, lineEnd) {
  const mLon = metersPerDegreeLon(point[0]);
  const px = (point[1] - lineStart[1]) * mLon;
  const py = (point[0] - lineStart[0]) * METERS_PER_DEGREE_LAT;
  const ex = (lineEnd[1] - lineStart[1]) * mLon;
  const ey = (lineEnd[0] - lineStart[0]) * METERS_PER_DEGREE_LAT;
  const lenSq = ex * ex + ey * ey;
  if (lenSq === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / lenSq));
  return Math.hypot(px - t * ex, py - t * ey);
}

function simplifyCoastline(points, toleranceMeters = 5) {
  if (!points || points.length < 3) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceMeters(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= toleranceMeters) return [first, last];
  const left = simplifyCoastline(points.slice(0, maxIdx + 1), toleranceMeters);
  const right = simplifyCoastline(points.slice(maxIdx), toleranceMeters);
  return [...left.slice(0, -1), ...right];
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

module.exports = {
  METERS_PER_DEGREE_LAT,
  BATAAN_INTERIOR,
  metersPerDegreeLon,
  haversineMeters,
  tangentsInMeters,
  seawardSign,
  seawardUnitNormals,
  offsetCoastlineSeaward,
  alignOrientation,
  cumulativeArcMeters,
  pointAtArcFraction,
  signedSeawardChanges,
  simplifyCoastline,
  median,
};
