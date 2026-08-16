const METERS_PER_DEGREE_LAT = 111320;
const BATAAN_INTERIOR = [14.65, 120.42];

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

function seawardUnitNormals(points, interior = BATAAN_INTERIOR) {
  const tangents = tangentsInMeters(points);
  const s = seawardSign(points, interior);
  return tangents.map(([tN, tE]) => [s * -tE, s * tN]);
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
  median,
};
