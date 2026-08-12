/**
 * CNN-based Coastline Detection — Encoder-Decoder CNN pixel classifier.
 * Uses @tensorflow/tfjs-node's native 'tensorflow' backend (falls back to
 * pure-JS CPU, much slower, if the native module fails to load).
 *
 * Windows install gotchas:
 *  1. tfjs-node doesn't copy its bundled tensorflow.dll (deps/lib/) next to
 *     the compiled tfjs_binding.node (lib/napi-v8/) — copy it over manually
 *     or the native module fails to load ("module could not be found").
 *  2. Its compiled JS calls the removed util.isNullOrUndefined (missing on
 *     recent Node) — patched via a shim on the "util" module below.
 *
 * Architecture: encoder (3 conv+pool blocks, 8→16→32 filters), decoder
 * (3 upsample+conv blocks, 32→16→8→1), sigmoid output -> binary water/land mask.
 *
 * Training: NDWI/colour heuristic generates pseudo-labels; the persistent
 * model (loaded from disk if present) fine-tunes on each upload's
 * (pixels, pseudo-labels) pair, saves weights, then predict() on the same
 * image produces the mask used for tracing. Weights persist and accumulate
 * across uploads.
 */

// util.isNullOrUndefined was removed in recent Node; tfjs-node's compiled JS
// still calls it. Node's "util" module is a cached singleton, so patching it
// once here before tfjs-node loads fixes every internal call site.
const nodeUtil = require('util');
if (typeof nodeUtil.isNullOrUndefined !== 'function') {
  nodeUtil.isNullOrUndefined = (x) => x === null || x === undefined;
}

let tf;
try {
  // Native backend — requires compiled bindings (Visual Studio Build Tools
  // C++ workload). Registers the fast 'tensorflow' backend as default.
  tf = require('@tensorflow/tfjs-node');
  console.log('[Detection] Using native tfjs-node backend (accelerated)');
} catch (e) {
  console.warn('[Detection] tfjs-node native module failed to load, falling back to pure-JS CPU backend (slow):', e.message);
  require('@tensorflow/tfjs-backend-cpu');
  tf = require('@tensorflow/tfjs');
}
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const GeoTIFFLib = require('geotiff');

const TRACE_SIZE = 256;   // Water/land mask + boundary tracing resolution — CNN trains AND predicts at this resolution
const MODEL_DIR = path.join(__dirname, '../uploads/cnn-model');

// Exported so callers can normalise detection pixel coords → geo correctly
const COASTLINE_GRID_SIZE = TRACE_SIZE;

// ─── Pseudo-label generation (classical colour heuristic, RGB images) ─────────

function generatePseudoLabels(rgbData, width, height) {
  const mask = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgbData[i * 3];
    const g = rgbData[i * 3 + 1];
    const b = rgbData[i * 3 + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta > 0) {
      if (max === r)      hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else                hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }
    const sat = max === 0 ? 0 : delta / max;
    const val = max / 255;

    // ── Exclusions ──────────────────────────────────────────────────────────
    // Vegetation: green hues with noticeable saturation
    const isVegetation = hue >= 75 && hue <= 165 && sat > 0.12;
    // Sand/soil: warm hues, red channel dominant
    const isSand = r >= g && r >= b && (hue <= 70 || hue >= 330) && val > 0.20;

    // ── Water rules ─────────────────────────────────────────────────────────
    // 1. Blue/cyan hue — catches both deep (dark) and mid-depth ocean.
    //    val floor is 0.04 so near-black (RGB 10-40) ocean still passes.
    const waterByHue = hue >= 165 && hue <= 245 && sat > 0.08 && val > 0.04;

    // 2. Blue channel dominance — catches dark JPEG-compressed ocean where
    //    saturation is low but blue is still slightly dominant over red.
    //    Tighter than waterByHue; does not require hue to be in blue range.
    const waterByBlue = b > r + 5 && b > g + 3 && b > 12;

    // 3. Shallow / turbid coastal water — lighter teal pixels near shore.
    const waterByShallow = b > r + 4 && g > r + 2 && val > 0.20 && val < 0.88 && sat < 0.55;

    mask[i] = (!isVegetation && !isSand && (waterByHue || waterByBlue || waterByShallow)) ? 1 : 0;
  }
  return mask;
}

// ─── NDWI input support ────────────────────────────────────────────────────────
//
// NDWI GeoTIFFs (from Earth Engine) are single-band float rasters; when the
// upload is one, skip the RGB colour classifier and threshold NDWI directly.

async function tryReadSingleBandGeoTIFF(imagePath) {
  const ext = imagePath.toLowerCase().split('.').pop();
  if (!['tif', 'tiff'].includes(ext)) return null;

  try {
    const tiff = await GeoTIFFLib.fromFile(imagePath);
    const image = await tiff.getImage();
    if (image.getSamplesPerPixel() !== 1) return null; // multi-band → treat as RGB

    const rasters = await image.readRasters();
    return {
      data: Float32Array.from(rasters[0]),
      width: image.getWidth(),
      height: image.getHeight(),
    };
  } catch (e) {
    console.warn('[Detection] GeoTIFF single-band read failed, falling back to RGB path:', e.message);
    return null;
  }
}

function resizeFloatNearest(data, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      out[y * dstW + x] = data[sy * srcW + sx];
    }
  }
  return out;
}

// Empirically verified (Bagac Bay Sentinel-2 composites): for this Earth
// Engine band.subtract(band) pipeline, NEGATIVE NDWI = water, POSITIVE =
// land — the opposite of the textbook McFeeters convention. Threshold stays
// at 0.0; more negative values only add speckle noise on open water, not a
// better boundary.
function ndwiMaskFromArray(ndwi, threshold = 0.0) {
  const mask = new Uint8Array(ndwi.length);
  for (let i = 0; i < ndwi.length; i++) mask[i] = ndwi[i] < threshold ? 1 : 0;
  return mask;
}

// Replicates a single channel (normalised 0..1) into 3 to match the CNN's
// [size, size, 3] input shape.
function singleChannelTo3ChannelTensorData(channel) {
  const out = new Float32Array(channel.length * 3);
  for (let i = 0; i < channel.length; i++) {
    const v = channel[i];
    out[i * 3] = v;
    out[i * 3 + 1] = v;
    out[i * 3 + 2] = v;
  }
  return out;
}

// ─── Denoising ──────────────────────────────────────────────────────────────

/**
 * Median filter — removes point noise without blurring, unlike a mean blur.
 * NDWI rasters are commonly speckled by wave texture/glint/turbidity, which
 * otherwise bakes into both the pseudo-labels and the CNN's training signal.
 */
function medianFilter(data, size, radius) {
  const out = new Float32Array(size * size);
  const windowValues = [];
  for (let y = 0; y < size; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(size - 1, y + radius);
    for (let x = 0; x < size; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(size - 1, x + radius);
      windowValues.length = 0;
      for (let iy = y0; iy <= y1; iy++) {
        const rowBase = iy * size;
        for (let ix = x0; ix <= x1; ix++) {
          windowValues.push(data[rowBase + ix]);
        }
      }
      windowValues.sort((a, b) => a - b);
      out[y * size + x] = windowValues[windowValues.length >> 1];
    }
  }
  return out;
}

// Per-channel median filter over an interleaved RGB buffer — same rationale
// as medianFilter above, applied before pseudo-label generation too (not
// just the CNN's own input), so noisy source pixels never reach either.
function medianFilterRGB(rgbData, size, radius) {
  const n = size * size;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = rgbData[i * 3];
    g[i] = rgbData[i * 3 + 1];
    b[i] = rgbData[i * 3 + 2];
  }
  const rf = medianFilter(r, size, radius);
  const gf = medianFilter(g, size, radius);
  const bf = medianFilter(b, size, radius);
  const out = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = rf[i];
    out[i * 3 + 1] = gf[i];
    out[i * 3 + 2] = bf[i];
  }
  return out;
}

// ─── CNN model ──────────────────────────────────────────────────────────────

function buildModel() {
  const model = tf.sequential();

  // Trains and predicts at full TRACE_SIZE (256px) — lower resolutions
  // upsample to mask "blocks" wider than this beach's ~20-40m width,
  // cutting the traced boundary into land regardless of convergence.
  model.add(tf.layers.conv2d({ inputShape: [TRACE_SIZE, TRACE_SIZE, 3], filters: 8, kernelSize: 3, padding: 'same', activation: 'relu' }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));

  model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, padding: 'same', activation: 'relu' }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));

  model.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, padding: 'same', activation: 'relu' }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));

  // Decoder
  model.add(tf.layers.upSampling2d({ size: [2, 2] }));
  model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, padding: 'same', activation: 'relu' }));

  model.add(tf.layers.upSampling2d({ size: [2, 2] }));
  model.add(tf.layers.conv2d({ filters: 8, kernelSize: 3, padding: 'same', activation: 'relu' }));

  model.add(tf.layers.upSampling2d({ size: [2, 2] }));
  model.add(tf.layers.conv2d({ filters: 1, kernelSize: 1, padding: 'same', activation: 'sigmoid' }));

  model.compile({ optimizer: tf.train.adam(0.001), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
  return model;
}

let cachedModel = null;

async function loadOrCreateModel() {
  if (cachedModel) return cachedModel;

  // Don't force 'cpu' — let whichever backend loaded (native, or the JS
  // fallback registered above) be used.
  await tf.ready();
  console.log('[Detection] tf.js backend in use:', tf.getBackend());

  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

  const weightsPath = path.join(MODEL_DIR, 'weights.json');

  // Weights are stateful and accumulate across uploads (see file header) —
  // on a fresh deploy the local copy won't exist yet, so pull down whatever
  // was last saved to Supabase Storage before falling back to a fresh model.
  if (!fs.existsSync(weightsPath) && process.env.SUPABASE_URL) {
    try {
      const { downloadToLocalFile } = require('./supabaseStorage');
      await downloadToLocalFile('cnn-model/weights.json', weightsPath);
      console.log('[Detection] Restored CNN weights from Supabase Storage');
    } catch (e) {
      console.log('[Detection] No CNN weights in Supabase Storage yet (or download failed):', e.message);
    }
  }

  if (fs.existsSync(weightsPath)) {
    try {
      const weightData = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
      cachedModel = buildModel();
      const tensors = weightData.map((w) => tf.tensor(w.data, w.shape, w.dtype));
      cachedModel.setWeights(tensors);
      tensors.forEach((t) => t.dispose());
      console.log('[Detection] Loaded saved CNN weights from', weightsPath);
      return cachedModel;
    } catch (e) {
      console.warn('[Detection] Could not load saved CNN weights, rebuilding:', e.message);
      cachedModel = null;
    }
  }

  console.log('[Detection] Building new encoder-decoder CNN');
  cachedModel = buildModel();
  return cachedModel;
}

async function saveModel(model) {
  try {
    if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });
    // tfjs (browser build) has no file:// save handler in Node — serialise
    // weights manually. Don't dispose getWeights()'s tensors; they're the
    // model's own live parameters.
    const weights = model.getWeights();
    const weightData = weights.map((w) => ({
      shape: w.shape,
      dtype: w.dtype,
      data: Array.from(w.dataSync()),
    }));
    const weightsJson = JSON.stringify(weightData);
    fs.writeFileSync(path.join(MODEL_DIR, 'weights.json'), weightsJson);
    console.log('[Detection] CNN weights saved to', path.join(MODEL_DIR, 'weights.json'));

    if (process.env.SUPABASE_URL) {
      try {
        const { uploadBuffer } = require('./supabaseStorage');
        await uploadBuffer(Buffer.from(weightsJson), 'cnn-model/weights.json');
        console.log('[Detection] CNN weights mirrored to Supabase Storage');
      } catch (e2) {
        console.warn('[Detection] CNN weights Supabase upload failed (local save still succeeded):', e2.message);
      }
    }
  } catch (e) {
    console.warn('[Detection] CNN save failed:', e.message);
  }
}

/**
 * Fine-tunes the persistent CNN on this image's (pixels, pseudo-labels) pair
 * at full TRACE_SIZE, saves the updated weights, then predicts on the same
 * image and returns the thresholded mask. Falls back to the raw
 * pseudo-labels if they're degenerate (all one class).
 * Trains at full 256px rather than a downsampled size: lower resolutions
 * converge faster but their upsampled mask "blocks" are as wide as or wider
 * than this beach, so the traced boundary cuts into land regardless of loss.
 */
async function classifyWithCNN(inputData3ch, pseudoLabels, size) {
  const positiveCount = pseudoLabels.reduce((s, v) => s + v, 0);
  if (positiveCount === 0 || positiveCount === pseudoLabels.length) {
    return pseudoLabels;
  }

  const model = await loadOrCreateModel();

  const xTrain = tf.tensor4d(inputData3ch, [1, size, size, 3]);
  const yTrain = tf.tensor4d(Float32Array.from(pseudoLabels), [1, size, size, 1]);

  let mask;
  try {
    const epochs = 200; // native tfjs-node backend: ~140ms/epoch at 256px, so 200 epochs is still only ~30s
    const history = await model.fit(xTrain, yTrain, {
      epochs,
      batchSize: 1,
      verbose: 0,
      // fit() awaits this between every epoch — yields the event loop so
      // other pending work (other requests' I/O callbacks) gets a chance to
      // run instead of this ~30s staying one uninterrupted block. Doesn't
      // make training itself non-blocking (each epoch is still ~140ms of
      // real CPU work), just caps the longest possible freeze at one epoch.
      callbacks: {
        onEpochEnd: async () => {
          await new Promise((resolve) => setImmediate(resolve));
        },
      },
    });
    const loss = history.history.loss[history.history.loss.length - 1];
    console.log(`[Detection] CNN fine-tuned on this image (${size}px, ${epochs} epochs) — loss: ${loss.toFixed(4)}`);
    await saveModel(model);

    const predsTensor = model.predict(xTrain);
    const preds = await predsTensor.data();
    predsTensor.dispose();

    mask = new Uint8Array(size * size);
    for (let i = 0; i < mask.length; i++) mask[i] = preds[i] >= 0.5 ? 1 : 0;
  } finally {
    xTrain.dispose();
    yTrain.dispose();
  }

  return mask;
}

// ─── Morphological helpers (separable for performance at 256px) ───────────────

function morphErode(mask, size, r) {
  // Row pass
  const tmp = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let all = true;
      const x0 = Math.max(0, x - r), x1 = Math.min(size - 1, x + r);
      for (let ix = x0; ix <= x1 && all; ix++) {
        if (mask[y * size + ix] === 0) all = false;
      }
      tmp[y * size + x] = all ? 1 : 0;
    }
  }
  // Column pass
  const out = new Uint8Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let all = true;
      const y0 = Math.max(0, y - r), y1 = Math.min(size - 1, y + r);
      for (let iy = y0; iy <= y1 && all; iy++) {
        if (tmp[iy * size + x] === 0) all = false;
      }
      out[y * size + x] = all ? 1 : 0;
    }
  }
  return out;
}

function morphDilate(mask, size, r) {
  // Row pass
  const tmp = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let any = false;
      const x0 = Math.max(0, x - r), x1 = Math.min(size - 1, x + r);
      for (let ix = x0; ix <= x1 && !any; ix++) {
        if (mask[y * size + ix] === 1) any = true;
      }
      tmp[y * size + x] = any ? 1 : 0;
    }
  }
  // Column pass
  const out = new Uint8Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let any = false;
      const y0 = Math.max(0, y - r), y1 = Math.min(size - 1, y + r);
      for (let iy = y0; iy <= y1 && !any; iy++) {
        if (tmp[iy * size + x] === 1) any = true;
      }
      out[y * size + x] = any ? 1 : 0;
    }
  }
  return out;
}

// Opening: removes small noise speckles
const morphOpen  = (m, s, r) => morphDilate(morphErode(m, s, r), s, r);
// Closing: fills small gaps/holes
const morphClose = (m, s, r) => morphErode(morphDilate(m, s, r), s, r);

// BFS — returns a mask containing only the largest connected water region
function largestConnectedComponent(mask, size) {
  const visited = new Uint8Array(size * size);
  let best = [];
  for (let start = 0; start < size * size; start++) {
    if (mask[start] !== 1 || visited[start]) continue;
    const pixels = [], queue = [start];
    visited[start] = 1;
    while (queue.length) {
      const idx = queue.pop();
      pixels.push(idx);
      const x = idx % size, y = (idx / size) | 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const ni = ny*size+nx;
          if (mask[ni] === 1 && !visited[ni]) { visited[ni] = 1; queue.push(ni); }
        }
      }
    }
    if (pixels.length > best.length) best = pixels;
  }
  const out = new Uint8Array(size * size);
  for (const i of best) out[i] = 1;
  return out;
}

// ─── Coastline tracing at high resolution ─────────────────────────────────────
//
// Moore neighborhood contour tracing walks the water/land boundary as an
// ordered path, then strips open-ocean image-edge segments to leave the
// actual shoreline. Avoids greedy-walk ordering issues on curved bays.

/**
 * Moore neighborhood contour trace — returns an ordered list of boundary
 * pixels walking clockwise around the largest connected water region.
 */
function traceContour(mask, size) {
  // Find topmost-leftmost water pixel (guaranteed to be on the outer boundary)
  let startX = -1, startY = -1;
  for (let y = 0; y < size && startX === -1; y++) {
    for (let x = 0; x < size; x++) {
      if (mask[y * size + x] === 1) { startX = x; startY = y; break; }
    }
  }
  if (startX === -1) return [];

  // 8 clockwise directions: N, NE, E, SE, S, SW, W, NW
  const DX = [ 0, 1, 1, 1, 0,-1,-1,-1];
  const DY = [-1,-1, 0, 1, 1, 1, 0,-1];

  const contour = [];
  let cx = startX, cy = startY;
  // We entered start from above (open space at y-1), so backtrack = N = dir 0
  let backDir = 0;

  const maxSteps = size * size * 2;
  let firstStep = true;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: cx, y: cy });

    let found = false;
    for (let i = 1; i <= 8; i++) {
      const d = (backDir + i) % 8;
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      if (mask[ny * size + nx] !== 1) continue;

      // Stopping criterion: returned to start after at least one move
      if (!firstStep && nx === startX && ny === startY) return contour;

      backDir = (d + 4) % 8; // direction from next pixel back to current
      cx = nx; cy = ny;
      firstStep = false;
      found = true;
      break;
    }
    if (!found) break; // isolated pixel — shouldn't happen after LCC
  }
  return contour;
}

/**
 * Extracts the shoreline from the full contour by removing open-ocean
 * image-edge portions (contour pixels within EDGE_MARGIN of the border),
 * returning the longest contiguous non-edge run.
 */
function extractCoastlineFromMask(mask, size) {
  const contour = traceContour(mask, size);
  console.log(`[Detection] Contour pixels traced: ${contour.length}`);
  if (contour.length === 0) return [];

  const EDGE_MARGIN = Math.round(size * 0.06); // 15px at 256px — filters image-border water

  // Mark which contour pixels are at the open-ocean image edge
  const isEdge = contour.map(p =>
    p.x < EDGE_MARGIN || p.y < EDGE_MARGIN ||
    p.x >= size - EDGE_MARGIN || p.y >= size - EDGE_MARGIN
  );

  // Find ALL non-edge runs, collect the longest one (= actual shoreline)
  let bestStart = 0, bestLen = 0;
  let runStart = -1, runLen = 0;

  // Wrap-around: treat the contour as circular so a run spanning the
  // array end→start is also considered.
  const n = contour.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const idx = (i + (pass === 1 ? bestStart + bestLen : 0)) % n;
      if (!isEdge[idx]) {
        if (runStart === -1) runStart = idx;
        runLen++;
        if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; }
      } else {
        runStart = -1; runLen = 0;
      }
    }
  }

  console.log(`[Detection] Longest non-edge contour run: ${bestLen} pts (EDGE_MARGIN=${EDGE_MARGIN}px)`);
  if (bestLen < 3) return [];

  // Extract the run (handle wrap-around)
  const run = [];
  for (let i = 0; i < bestLen; i++) run.push(contour[(bestStart + i) % n]);

  // The raw contour is a pixel-staircase (horizontal+vertical steps only).
  // Smooth it first so RDP sees the actual curve rather than a staircase —
  // without smoothing, all staircase intermediate points are within 1px of
  // a diagonal and get eliminated, leaving only a handful of corner points.
  const smoothed = smoothContour(run, 4);

  return simplifyPoints(smoothed, 0.8);
}

// Moving-average smooth: replaces each point with the average of its k neighbors.
// Converts staircase pixel boundary into a smooth approximation of the curve.
function smoothContour(pts, k = 4) {
  return pts.map((_, i) => {
    let sx = 0, sy = 0, cnt = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(pts.length - 1, i + k); j++) {
      sx += pts[j].x; sy += pts[j].y; cnt++;
    }
    return { x: sx / cnt, y: sy / cnt };
  });
}

function simplifyPoints(pts, eps = 1.5) {
  if (pts.length < 3) return pts;
  let maxD = 0, maxI = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], a, b);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    return [...simplifyPoints(pts.slice(0, maxI+1), eps).slice(0,-1), ...simplifyPoints(pts.slice(maxI), eps)];
  }
  return [a, b];
}

function ptLineDist(p, a, b) {
  const num = Math.abs((b.y-a.y)*p.x - (b.x-a.x)*p.y + b.x*a.y - b.y*a.x);
  const den = Math.sqrt((b.y-a.y)**2 + (b.x-a.x)**2);
  return den === 0 ? 0 : num / den;
}

// Debug helper: write a binary water/land mask out as a viewable PNG
// (white = water, black = land) so the mask can be inspected directly
// instead of inferred from the final traced line.
async function dumpDebugMask(mask, size, sourceImagePath, label) {
  try {
    const debugDir = path.join(path.dirname(sourceImagePath), 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });

    const buf = Buffer.alloc(size * size);
    for (let i = 0; i < size * size; i++) buf[i] = mask[i] ? 255 : 0;

    const baseName = path.basename(sourceImagePath, path.extname(sourceImagePath));
    const outPath = path.join(debugDir, `${baseName}_${label}.png`);
    await sharp(buf, { raw: { width: size, height: size, channels: 1 } }).png().toFile(outPath);
    console.log(`[Detection] Debug mask written: ${outPath}`);
  } catch (e) {
    console.warn('[Detection] Debug mask dump failed:', e.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function detectCoastlineWithCNN(imagePath) {
  try {
    console.log('[Detection] Processing:', path.basename(imagePath));

    // Generate the water/land mask at TRACE_SIZE (256). The classical NDWI
    // threshold / colour heuristic seeds pseudo-labels; the persistent CNN,
    // fine-tuned on those labels, predicts the mask actually used for
    // tracing below.
    const ndwiRaw = await tryReadSingleBandGeoTIFF(imagePath);

    let mask;
    if (ndwiRaw) {
      const resized256 = resizeFloatNearest(ndwiRaw.data, ndwiRaw.width, ndwiRaw.height, TRACE_SIZE, TRACE_SIZE);

      // Denoise BEFORE thresholding — wave texture, sun glint, and turbidity
      // show up as pixel-level speckle in NDWI rasters that a raw threshold
      // bakes straight into the mask. Filtering the continuous signal first
      // keeps that noise out of both the pseudo-labels and the CNN's input.
      const denoised = medianFilter(resized256, TRACE_SIZE, 1);
      const pseudoLabels = ndwiMaskFromArray(denoised, 0.0);
      await dumpDebugMask(pseudoLabels, TRACE_SIZE, imagePath, 'raw-threshold');

      // Normalise -1..1 -> 0..1 and replicate into 3 channels for the CNN
      let ndwiMin = Infinity, ndwiMax = -Infinity;
      for (let i = 0; i < denoised.length; i++) {
        if (denoised[i] < ndwiMin) ndwiMin = denoised[i];
        if (denoised[i] > ndwiMax) ndwiMax = denoised[i];
      }
      const range = ndwiMax - ndwiMin || 1;
      const normalized = new Float32Array(denoised.length);
      for (let i = 0; i < denoised.length; i++) normalized[i] = (denoised[i] - ndwiMin) / range;
      const inputData3ch = singleChannelTo3ChannelTensorData(normalized);

      const pseudoWaterCount = pseudoLabels.reduce((s, v) => s + v, 0);
      console.log(`[Detection] NDWI range: min=${ndwiMin.toFixed(4)} max=${ndwiMax.toFixed(4)} — threshold<0.0 pseudo-label water pixels: ${pseudoWaterCount}/${pseudoLabels.length} (${(pseudoWaterCount / pseudoLabels.length * 100).toFixed(1)}%)`);

      mask = await classifyWithCNN(inputData3ch, pseudoLabels, TRACE_SIZE);

      const waterCount = mask.reduce((s, v) => s + v, 0);
      console.log(`[Detection] NDWI+CNN — water pixels at ${TRACE_SIZE}px: ${waterCount}/${TRACE_SIZE * TRACE_SIZE} (${(waterCount / (TRACE_SIZE * TRACE_SIZE) * 100).toFixed(1)}%)`);
      if (waterCount === 0 || waterCount === TRACE_SIZE * TRACE_SIZE) {
        return { valid: false, error: 'Water/land mask is all-water or all-land — check bounds/year' };
      }
    } else {
      const { data: raw256 } = await sharp(imagePath)
        .resize(TRACE_SIZE, TRACE_SIZE)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Denoise the raw pixels BEFORE pseudo-label generation, same
      // rationale as the NDWI path — otherwise speckle noise (JPEG
      // artifacts, sun glint, wave texture) gets baked into the pseudo
      // labels themselves, and a sufficiently noisy image can defeat the
      // morphological cleanup step entirely (verified: >5% random pixel
      // noise routinely merges the whole mask into one region).
      const denoisedRGB = medianFilterRGB(raw256, TRACE_SIZE, 1);

      const pseudoFloat = generatePseudoLabels(denoisedRGB, TRACE_SIZE, TRACE_SIZE);
      const pseudoLabels = new Uint8Array(TRACE_SIZE * TRACE_SIZE);
      for (let i = 0; i < TRACE_SIZE * TRACE_SIZE; i++) pseudoLabels[i] = pseudoFloat[i] >= 0.5 ? 1 : 0;

      const inputData3ch = new Float32Array(TRACE_SIZE * TRACE_SIZE * 3);
      for (let i = 0; i < denoisedRGB.length; i++) inputData3ch[i] = denoisedRGB[i] / 255;

      mask = await classifyWithCNN(inputData3ch, pseudoLabels, TRACE_SIZE);

      const waterCount = mask.reduce((s, v) => s + v, 0);
      const waterPct = (waterCount / (TRACE_SIZE * TRACE_SIZE) * 100).toFixed(1);
      console.log(`[Detection] Colour+CNN — water pixels at ${TRACE_SIZE}px: ${waterCount}/${TRACE_SIZE * TRACE_SIZE} (${waterPct}%)`);

      if (waterCount === 0 || waterCount === TRACE_SIZE * TRACE_SIZE) {
        return { valid: false, error: 'Water/land mask is all-water or all-land — check image colours' };
      }
    }

    // Morphological cleaning — conservative radii to preserve the thin land strip.
    // Close fills small gaps in water detection without eating into land.
    // Open removes tiny isolated speckles only.
    //
    // NDWI-sourced masks use smaller radii (2/1 vs 5/2) because Sentinel-2 is
    // only 10m/pixel natively, far coarser than the RGB satellite
    // screenshots this pipeline was originally tuned on (~1m/pixel) — the
    // same pixel-radius in TRACE_SIZE-space corresponds to tens of meters
    // more real-world smoothing for NDWI data.
    const closeRadius = ndwiRaw ? 2 : 5;
    const openRadius = ndwiRaw ? 1 : 2;

    if (ndwiRaw) await dumpDebugMask(mask, TRACE_SIZE, imagePath, 'before-morph');

    mask = morphClose(mask, TRACE_SIZE, closeRadius);
    mask = morphOpen(mask, TRACE_SIZE, openRadius);
    mask = largestConnectedComponent(mask, TRACE_SIZE);

    if (ndwiRaw) await dumpDebugMask(mask, TRACE_SIZE, imagePath, 'after-morph');

    const cleanedWater = mask.reduce((s, v) => s + v, 0);
    console.log(`[Detection] After morphological cleaning: ${cleanedWater} water pixels`);

    if (cleanedWater === 0) {
      return { valid: false, error: 'No water region survived morphological cleaning' };
    }

    const points = extractCoastlineFromMask(mask, TRACE_SIZE);

    console.log(`[Detection] ${points.length} coastline points (grid: ${TRACE_SIZE}px)`);

    if (points.length === 0) {
      return { valid: false, error: 'No coastline boundary found after land-depth filtering' };
    }

    const confidence = Math.min(1.0, points.length / 100);

    return {
      valid: true,
      coastlinePoints: points,
      pointCount: points.length,
      method: 'CNN classified trace (256px)',
      confidence: parseFloat(confidence.toFixed(2)),
      gridSize: TRACE_SIZE,
      architecture: 'Compact Encoder-Decoder CNN (3 conv+pool, 3 upsample+conv)',
      trainingStrategy: 'Self-supervised bootstrap, weights persisted across uploads — classical NDWI/colour threshold generates pseudo-labels, CNN fine-tunes on each upload and predict() output is what gets traced',
    };
  } catch (error) {
    console.error('[Detection] Detection error:', error.message);
    // If the cached model is corrupted (disposed tensors), clear it so the
    // next upload rebuilds from scratch rather than reusing a broken model.
    cachedModel = null;
    return { valid: false, error: error.message, method: 'CNN classified trace' };
  }
}

async function initCNNModel() {
  try {
    await loadOrCreateModel();
    console.log('[Detection] CNN model ready');
  } catch (e) {
    console.warn('[Detection] CNN init warning:', e.message);
  }
}

module.exports = { detectCoastlineWithCNN, initCNNModel, buildModel, COASTLINE_GRID_SIZE };
