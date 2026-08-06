/**
 * Static Map Renderer
 *
 * Server-side raster map generation for embedding in PDFs: stitches real
 * Esri World Imagery satellite tiles (the same source used for the
 * satellite toggle on the Coastal Monitoring / Erosion Analysis pages) and
 * overlays shoreline vector lines on top — no headless browser required.
 * Falls back to null (caller draws a plain background instead) if tiles
 * can't be fetched, e.g. no internet access.
 */

const sharp = require("sharp");

const TILE_SIZE = 256;
// Esri's tile REST API uses {z}/{y}/{x} ordering (note: swapped from the
// {z}/{x}/{y} XYZ convention used by OSM and most other tile servers).
const TILE_SERVER = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const USER_AGENT = "DagatScan-Bataan/1.0 (+coastal-erosion-monitoring-system)";

function lonLatToPixel(lon, lat, zoom) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return [x, y];
}

function chooseZoom(bounds, targetWidth, targetHeight) {
  // Pixel span grows with zoom, so search from coarse to fine and stop at
  // the first (lowest, fewest-tiles) zoom that already meets the target
  // resolution — searching the other direction would always land on the
  // maximum zoom instead.
  for (let zoom = 8; zoom <= 18; zoom++) {
    const [x1, y1] = lonLatToPixel(bounds.west, bounds.north, zoom);
    const [x2, y2] = lonLatToPixel(bounds.east, bounds.south, zoom);
    if (Math.abs(x2 - x1) >= targetWidth && Math.abs(y2 - y1) >= targetHeight) return zoom;
  }
  return 18;
}

async function fetchTile(z, x, y) {
  const tileCount = Math.pow(2, z);
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  const url = `${TILE_SERVER}/${z}/${y}/${wrappedX}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Tile fetch failed: ${url} (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Fetches and stitches every OSM tile covering `bounds` at `zoom` into one
 * canvas, returning the canvas plus the global pixel coordinate of its
 * top-left corner so callers can place overlays in the same space.
 */
async function stitchTiles(bounds, zoom) {
  const [xMinF, yMinF] = lonLatToPixel(bounds.west, bounds.north, zoom);
  const [xMaxF, yMaxF] = lonLatToPixel(bounds.east, bounds.south, zoom);

  const tileXMin = Math.floor(xMinF / TILE_SIZE);
  const tileXMax = Math.floor(xMaxF / TILE_SIZE);
  const tileYMin = Math.floor(yMinF / TILE_SIZE);
  const tileYMax = Math.floor(yMaxF / TILE_SIZE);

  const tilesWide = tileXMax - tileXMin + 1;
  const tilesHigh = tileYMax - tileYMin + 1;

  // Small bboxes stay well under a handful of tiles; cap defensively so a
  // malformed/huge bounds value can't trigger hundreds of tile requests.
  if (tilesWide * tilesHigh > 64) {
    throw new Error(`Refusing to stitch ${tilesWide * tilesHigh} tiles — bounds too large for this zoom`);
  }

  const tiles = [];
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      tiles.push(
        fetchTile(zoom, tx, ty).then((buffer) => ({
          buffer,
          left: (tx - tileXMin) * TILE_SIZE,
          top: (ty - tileYMin) * TILE_SIZE,
        }))
      );
    }
  }
  const resolvedTiles = await Promise.all(tiles);

  const canvasBuffer = await sharp({
    create: {
      width: tilesWide * TILE_SIZE,
      height: tilesHigh * TILE_SIZE,
      channels: 3,
      background: { r: 234, g: 246, b: 251 },
    },
  })
    .composite(resolvedTiles.map((t) => ({ input: t.buffer, left: t.left, top: t.top })))
    .png()
    .toBuffer();

  return {
    canvasBuffer,
    canvasWidth: tilesWide * TILE_SIZE,
    canvasHeight: tilesHigh * TILE_SIZE,
    originX: tileXMin * TILE_SIZE,
    originY: tileYMin * TILE_SIZE,
    zoom,
  };
}

/**
 * Renders a static basemap (real OSM tiles) cropped to `bounds`, with
 * shoreline polylines and an erosion-area fill overlaid on top, scaled to
 * the requested output size. Returns a PNG buffer, or null on any failure
 * (e.g. offline) so the caller can fall back to a plain drawn background.
 *
 * @param {{west:number,south:number,east:number,north:number}} bounds
 * @param {Array<{coords:[number,number][], color:string, width?:number, dashed?:boolean}>} lines
 * @param {{points:[number,number][], color:string}} [fillRibbon]
 */
async function renderShorelineMap({ bounds, lines, fillRibbon, outputWidth, outputHeight }) {
  const zoom = chooseZoom(bounds, outputWidth, outputHeight);
  const { canvasBuffer, canvasWidth, canvasHeight, originX, originY } = await stitchTiles(bounds, zoom);

  const toCanvasPixel = ([lon, lat]) => {
    const [x, y] = lonLatToPixel(lon, lat, zoom);
    return [x - originX, y - originY];
  };

  const [cropX1, cropY1] = toCanvasPixel([bounds.west, bounds.north]);
  const [cropX2, cropY2] = toCanvasPixel([bounds.east, bounds.south]);
  const cropLeft = Math.max(0, Math.floor(Math.min(cropX1, cropX2)));
  const cropTop = Math.max(0, Math.floor(Math.min(cropY1, cropY2)));
  const cropWidth = Math.max(1, Math.min(canvasWidth - cropLeft, Math.ceil(Math.abs(cropX2 - cropX1))));
  const cropHeight = Math.max(1, Math.min(canvasHeight - cropTop, Math.ceil(Math.abs(cropY2 - cropY1))));

  // Draw overlay lines at full canvas resolution (guaranteed to match
  // canvasBuffer's own dimensions exactly) and crop the composited result
  // afterwards, rather than sizing the SVG to the crop box up front — sharp
  // requires the overlay's rasterized size to exactly equal the base image,
  // and pre-crop SVG sizing was prone to off-by-one mismatches.
  const svgParts = [];
  if (fillRibbon && fillRibbon.points && fillRibbon.points.length > 2) {
    const pts = fillRibbon.points
      .map(toCanvasPixel)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    svgParts.push(`<polygon points="${pts}" fill="${fillRibbon.color}" fill-opacity="0.45" />`);
  }
  for (const line of lines || []) {
    if (!line.coords || line.coords.length < 2) continue;
    const pts = line.coords
      .map(toCanvasPixel)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const dashAttr = line.dashed ? 'stroke-dasharray="10,7"' : "";
    svgParts.push(
      `<polyline points="${pts}" fill="none" stroke="${line.color}" stroke-width="${line.width || 5}" ${dashAttr} stroke-linecap="round" stroke-linejoin="round" />`
    );
  }
  const svg = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">${svgParts.join("")}</svg>`;

  // Each stage is materialized to its own buffer rather than chained in one
  // pipeline — chaining composite().extract().resize() directly in a single
  // sharp pipeline intermittently throws "Image to composite must have same
  // dimensions or smaller" even when the inputs verifiably match; splitting
  // the pipeline avoids it.
  const overlaid = await sharp(canvasBuffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  const cropped = await sharp(overlaid)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  return sharp(cropped)
    .resize(Math.round(outputWidth), Math.round(outputHeight), { fit: "fill" })
    .png()
    .toBuffer();
}

module.exports = { renderShorelineMap };
