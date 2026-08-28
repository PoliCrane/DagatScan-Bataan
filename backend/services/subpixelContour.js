// Sub-pixel shoreline extraction: marching-squares contour of the NDWI raster at the
// water/land threshold, with linear interpolation of each edge crossing. Works on the
// native-resolution array, so position precision is a fraction of a pixel instead of
// the whole grid cell that binary thresholding gives.

function interpolate(threshold, a, b) {
  const denom = b - a;
  if (!isFinite(denom) || Math.abs(denom) < 1e-12) return 0.5;
  const t = (threshold - a) / denom;
  return Math.max(0, Math.min(1, t));
}

// Emits one or two line segments per cell using the standard 16-case table.
// Grid coordinates: x right, y down; segment endpoints are [x, y] floats.
function marchingSquaresSegments(data, width, height, threshold) {
  const segments = [];
  const val = (x, y) => data[y * width + x];

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = val(x, y);
      const tr = val(x + 1, y);
      const br = val(x + 1, y + 1);
      const bl = val(x, y + 1);
      if (![tl, tr, br, bl].every(isFinite)) continue;

      let caseIndex = 0;
      if (tl > threshold) caseIndex |= 8;
      if (tr > threshold) caseIndex |= 4;
      if (br > threshold) caseIndex |= 2;
      if (bl > threshold) caseIndex |= 1;
      if (caseIndex === 0 || caseIndex === 15) continue;

      const top = [x + interpolate(threshold, tl, tr), y];
      const right = [x + 1, y + interpolate(threshold, tr, br)];
      const bottom = [x + interpolate(threshold, bl, br), y + 1];
      const left = [x, y + interpolate(threshold, tl, bl)];

      switch (caseIndex) {
        case 1: case 14: segments.push([left, bottom]); break;
        case 2: case 13: segments.push([bottom, right]); break;
        case 3: case 12: segments.push([left, right]); break;
        case 4: case 11: segments.push([top, right]); break;
        case 6: case 9: segments.push([top, bottom]); break;
        case 7: case 8: segments.push([left, top]); break;
        case 5:
          segments.push([left, top]);
          segments.push([bottom, right]);
          break;
        case 10:
          segments.push([left, bottom]);
          segments.push([top, right]);
          break;
      }
    }
  }
  return segments;
}

function key(point) {
  return `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
}

// Chains loose segments into polylines by joining shared endpoints.
function chainSegments(segments) {
  const adjacency = new Map();
  const add = (k, seg) => {
    if (!adjacency.has(k)) adjacency.set(k, []);
    adjacency.get(k).push(seg);
  };
  segments.forEach((seg, i) => {
    add(key(seg[0]), i);
    add(key(seg[1]), i);
  });

  const used = new Array(segments.length).fill(false);
  const polylines = [];

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const line = [segments[start][0], segments[start][1]];

    for (const endIdx of [1, 0]) {
      let cursor = endIdx === 1 ? line[line.length - 1] : line[0];
      for (;;) {
        const candidates = (adjacency.get(key(cursor)) || []).filter((i) => !used[i]);
        if (candidates.length === 0) break;
        const segIdx = candidates[0];
        used[segIdx] = true;
        const seg = segments[segIdx];
        const next = key(seg[0]) === key(cursor) ? seg[1] : seg[0];
        if (endIdx === 1) line.push(next);
        else line.unshift(next);
        cursor = next;
      }
    }
    polylines.push(line);
  }
  return polylines;
}

function polylineLength(line) {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    total += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  }
  return total;
}

// Extracts the longest threshold contour that stays away from the image border
// (border crossings are the open-ocean/image-edge artifact, not shoreline).
function extractSubpixelShoreline(data, width, height, threshold, edgeMarginFraction = 0.04) {
  const segments = marchingSquaresSegments(data, width, height, threshold);
  if (segments.length === 0) return [];

  const marginX = width * edgeMarginFraction;
  const marginY = height * edgeMarginFraction;
  const interior = (p) =>
    p[0] >= marginX && p[0] <= width - marginX && p[1] >= marginY && p[1] <= height - marginY;

  const polylines = chainSegments(segments);

  let best = [];
  let bestLength = 0;
  for (const line of polylines) {
    let run = [];
    for (const p of line) {
      if (interior(p)) {
        run.push(p);
      } else {
        const len = polylineLength(run);
        if (len > bestLength) {
          bestLength = len;
          best = run;
        }
        run = [];
      }
    }
    const len = polylineLength(run);
    if (len > bestLength) {
      bestLength = len;
      best = run;
    }
  }

  return best.map(([x, y]) => ({ x, y }));
}

module.exports = { extractSubpixelShoreline, marchingSquaresSegments };
