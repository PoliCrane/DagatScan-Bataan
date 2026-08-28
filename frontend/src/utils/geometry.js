export const METERS_PER_DEGREE_LAT = 111320;
export const BATAAN_INTERIOR = [14.65, 120.42];

export function metersPerDegreeLon(latDeg) {
  return METERS_PER_DEGREE_LAT * Math.cos((latDeg * Math.PI) / 180);
}

export function haversineMeters([lat1, lng1], [lat2, lng2]) {
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

export function tangentsInMeters(points) {
  return points.map((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const north = (next[0] - prev[0]) * METERS_PER_DEGREE_LAT;
    const east = (next[1] - prev[1]) * metersPerDegreeLon(point[0]);
    const len = Math.hypot(north, east);
    return len === 0 ? [0, 0] : [north / len, east / len];
  });
}

export function seawardSign(points, interior = BATAAN_INTERIOR) {
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

export function seawardUnitNormals(points, interior = BATAAN_INTERIOR) {
  const tangents = tangentsInMeters(points);
  const s = seawardSign(points, interior);
  return tangents.map(([tN, tE]) => [s * -tE, s * tN]);
}

export function offsetCoastlineSeaward(points, offsetMeters, interior = BATAAN_INTERIOR) {
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
