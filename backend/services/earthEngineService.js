// Google Earth Engine NDWI generation: queries Sentinel-2 for a bounding box/year,
// computes NDWI, exports as a GeoTIFF.
// Auth: service account key via EE_SERVICE_ACCOUNT_KEY_JSON (raw JSON) or
// EE_SERVICE_ACCOUNT_KEY_PATH / backend/config/ee-service-account.json (file).

const ee = require('@google/earthengine');
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY_PATH = process.env.EE_SERVICE_ACCOUNT_KEY_PATH ||
  path.join(__dirname, '../config/ee-service-account.json');

// env var checked first (cheap check), falls back to the key file (Render's Secret File setup)
function loadPrivateKey() {
  if (process.env.EE_SERVICE_ACCOUNT_KEY_JSON) {
    return JSON.parse(process.env.EE_SERVICE_ACCOUNT_KEY_JSON);
  }
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      `Earth Engine service account key not found at ${KEY_PATH}. ` +
      `Set EE_SERVICE_ACCOUNT_KEY_JSON (raw key JSON) or EE_SERVICE_ACCOUNT_KEY_PATH ` +
      `(path to the key file), or place the key at backend/config/ee-service-account.json.`
    );
  }
  return JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
}

const NDWI_OUTPUT_DIR = path.join(__dirname, '../uploads/ndwi');

let initialized = false;
let initPromise = null;

// EE's auth/init calls have no built-in timeout; bounds it so a stuck call fails instead of hanging forever.
// initPromise resets on failure so the next call gets a fresh attempt.
const EE_INIT_TIMEOUT_MS = 25000;

// export prep (getDownloadURL/getThumbURL) and the file download also lack a timeout;
// bound both so a stall fails instead of hanging silently in the background worker.
const EE_EXPORT_TIMEOUT_MS = 90000;
const DOWNLOAD_TIMEOUT_MS = 60000;

function initEE() {
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  const authPromise = new Promise((resolve, reject) => {
    let privateKey;
    try {
      privateKey = loadPrivateKey();
    } catch (e) {
      reject(new Error(`Failed to load Earth Engine service account key: ${e.message}`));
      return;
    }

    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => {
        ee.initialize(
          null,
          null,
          () => {
            initialized = true;
            resolve();
          },
          (err) => reject(new Error(`Earth Engine initialize failed: ${err}`))
        );
      },
      (err) => reject(new Error(`Earth Engine authentication failed: ${err}`))
    );
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(
      `Earth Engine initialization timed out after ${EE_INIT_TIMEOUT_MS / 1000}s — the server may be unable ` +
      `to reach Google's Earth Engine API (network/egress issue), or the request is unusually slow. Try again in a moment.`
    )), EE_INIT_TIMEOUT_MS);
  });

  initPromise = Promise.race([authPromise, timeoutPromise]).catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

// no socket handle to time out directly on these SDK callbacks, so this just stops
// waiting on our side; the EE-side operation may continue regardless.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`NDWI download failed with status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    // fires on socket inactivity, not total download time; destroy() aborts the connection itself
    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Earth Engine file download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`));
    });
    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Async count of an ee.ImageCollection's images — used to detect an empty dry-season
// window (e.g. March-April with zero cloud-free scenes that year) before compositing,
// since Image.select() on a bandless median() of an empty collection throws a confusing
// "Band pattern applied to an Image with no bands" error instead of something actionable.
function getCollectionSize(collection) {
  return new Promise((resolve, reject) => {
    collection.size().evaluate((size, err) => {
      if (err) reject(new Error(`Earth Engine collection size check failed: ${err}`));
      else resolve(size);
    });
  });
}

// CLOUDY_PIXEL_PERCENTAGE describes a whole ~110x110 km Sentinel-2 tile, while an AOI here is
// ~1.7 km across — so it says almost nothing about whether *this bay* is clouded. Measured
// against real data: scenes reading 3-9% tile cloud were 100% cloud over the bay and passed
// the filter, while genuinely clean scenes (1.5% over the bay) were rejected for 23% tile
// cloud. This computes the actual cloud fraction inside the AOI from the SCL band and ranks
// on that instead. SCL classes: 3 = cloud shadow, 8/9 = cloud medium/high probability,
// 10 = cirrus. Null (no overlap) sorts as fully cloudy so ordering stays well-defined.
function withAoiCloudFraction(collection, geometry) {
  return collection.map((image) => {
    const scl = image.select('SCL');
    const cloudy = scl.eq(3).or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10));
    const fraction = cloudy
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry,
        scale: 20, // SCL's native resolution
        maxPixels: 1e9,
        bestEffort: true,
      })
      .get('SCL');
    return image.set('AOI_CLOUD', ee.Algorithms.If(fraction, fraction, 1));
  });
}

// Keep only scenes genuinely clear over the AOI, cleanest first. Capped rather than taking
// everything: the median needs several clear observations to outvote residual cloud, but
// letting progressively dirtier scenes in past that point only dilutes it.
const MAX_AOI_CLOUD_FRACTION = 0.1;
const MAX_SCENES_IN_COMPOSITE = 8;

function cleanestOverAoi(collection, geometry) {
  return withAoiCloudFraction(collection, geometry)
    .filter(ee.Filter.lt('AOI_CLOUD', MAX_AOI_CLOUD_FRACTION))
    .sort('AOI_CLOUD')
    .limit(MAX_SCENES_IN_COMPOSITE);
}

// Last resort when nothing clears the threshold: take the least-cloudy scenes available
// regardless. Some area/years genuinely have no clear view all year (measured: Bagac Bay
// 2017 has zero Sentinel-2 scenes under 10% AOI cloud across the entire year), and an empty
// collection medians to a bandless image, which fails later with an opaque "Band pattern
// 'B3' was applied to an Image with no bands". Best-available keeps the year usable, and the
// result still gets vetted downstream by the trace plausibility gate.
function leastCloudyOverAoi(collection, geometry) {
  return withAoiCloudFraction(collection, geometry)
    .sort('AOI_CLOUD')
    .limit(MAX_SCENES_IN_COMPOSITE);
}

// shared Sentinel-2 composite so NDWI and true-color read identical source pixels.
// season 'dry' restricts to March-April (consistent beach/tide state year-over-year,
// PH dry season); 'annual' keeps the original whole-year behavior.
// No per-pixel cloud mask here (deliberately) — a per-pixel SCL mask was tried and
// reverted: it leaves cloud/shadow pixels as nodata, which downstream shoreline
// classification (ndwiMaskFromArray) has no "unknown" state for and always resolves
// to "land," training the persistent CNN to trace a false coastline notch wherever a
// scene had cloud/shadow. Selecting whole scenes by AOI cloud cover (below) avoids that
// entirely — it changes which images enter the median, never masking pixels within one.
async function buildSentinelComposite(geometry, year, season = 'dry') {
  // Deliberately loose: this is only a cheap prefilter to drop hopeless scenes before the
  // per-image AOI computation. Tightening it is actively harmful — at <10% the 2026 pool
  // fell from 16 scenes to 3, two of which were fully clouded over the bay, leaving the
  // median nothing clear to outvote them with. AOI cloud is the real selector.
  const base = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60));

  const annualAll = base.filterDate(`${year}-01-01`, `${year}-12-31`);
  const annualClean = cleanestOverAoi(annualAll, geometry);

  // Widens in tiers, each only when the one above finds nothing usable, so a year is never
  // silently dropped: dry-season clear -> full-year clear -> full-year least-cloudy.
  const bestAvailable = async (label) => {
    if ((await getCollectionSize(annualClean)) > 0) {
      console.warn(`[EE] ${label} — falling back to the clearest full-year scenes for ${year}.`);
      return annualClean.median();
    }
    console.warn(`[EE] ${label}, and no scene anywhere in ${year} is clear over this AOI — using the least-cloudy scenes available. Expect a noisier trace for this year.`);
    return leastCloudyOverAoi(annualAll, geometry).median();
  };

  if (season === 'annual') {
    return (await getCollectionSize(annualClean)) > 0
      ? annualClean.median()
      : leastCloudyOverAoi(annualAll, geometry).median();
  }

  // Dry season, PH: March-April specifically (not the wider Nov-Apr range) —
  // narrowest window that's still reliably cloud-free, for the most consistent
  // tide/turbidity conditions across years. Default for every caller; a year-to-year
  // full-year median otherwise blends whatever months happened to be cloud-free that
  // particular year, which is itself a source of spurious year-over-year noise.
  const dryClean = cleanestOverAoi(base.filterDate(`${year}-03-01`, `${year}-04-30`), geometry);
  if ((await getCollectionSize(dryClean)) === 0) {
    // Covers "no scenes at all" (2015 predates Sentinel-2's June 2015 launch) and "scenes
    // exist but all are clouded over this bay" (2017's only two March-April scenes are both
    // 100% cloud over Bagac/Morong).
    return bestAvailable(`No Sentinel-2 scene clear over this AOI in ${year}-03-01..${year}-04-30`);
  }
  return dryClean.median();
}

// Landsat Collection 2 Level-2 composite for years before Sentinel-2 (1990-2014).
// Applies the C02 optical scaling factors (NDWI is not invariant to the -0.2 offset).
// No per-pixel QA_PIXEL cloud mask — same reasoning as buildSentinelComposite above.
async function buildLandsatComposite(geometry, year, season = 'dry') {
  const spec =
    year >= 2013
      ? { id: 'LANDSAT/LC08/C02/T1_L2', green: 'SR_B3', nir: 'SR_B5' }
      : year >= 1999
      ? { id: 'LANDSAT/LE07/C02/T1_L2', green: 'SR_B2', nir: 'SR_B4' }
      : { id: 'LANDSAT/LT05/C02/T1_L2', green: 'SR_B2', nir: 'SR_B4' };

  const base = ee.ImageCollection(spec.id).filterBounds(geometry);
  const annual = base.filterDate(`${year}-01-01`, `${year}-12-31`);

  let collection = annual;
  if (season !== 'annual') {
    const dry = base.filterDate(`${year}-03-01`, `${year}-04-30`);
    const dryCount = await getCollectionSize(dry);
    if (dryCount === 0) {
      console.warn(`[EE] No Landsat scenes in ${year}-03-01..${year}-04-30 for this area — falling back to the full year for this year only.`);
    } else {
      collection = dry;
    }
  }

  const scaled = collection
    .map((img) => img.select([spec.green, spec.nir]).multiply(0.0000275).add(-0.2))
    .median();

  return { composite: scaled, green: spec.green, nir: spec.nir, scaleMeters: 30 };
}

// NDWI (McFeeters) = (Green - NIR) / (Green + NIR). Positive = water, negative = land.
// index 'mndwi' uses Green-SWIR (B3/B11, Sentinel-2 only) — better separation in turbid
// coastal water. season defaults to 'dry' (March-April) for every year, Sentinel or
// Landsat — pass 'annual' explicitly to opt out (not exposed in any UI; debugging only).
// Years before 2015 automatically use Landsat Collection 2 (30 m) instead of Sentinel-2.
async function generateNDWIGeoTIFF({ lonMin, latMin, lonMax, latMax, year, coastlineName, index = 'ndwi', season = 'dry' }) {
  await initEE();

  const geometry = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax]);

  let green;
  let nir;
  let exportScale = 10;
  if (year < 2015) {
    const landsat = await buildLandsatComposite(geometry, year, season);
    green = landsat.composite.select(landsat.green);
    nir = landsat.composite.select(landsat.nir);
    exportScale = landsat.scaleMeters;
  } else {
    const composite = await buildSentinelComposite(geometry, year, season);
    green = composite.select('B3');
    nir = composite.select(index === 'mndwi' ? 'B11' : 'B8');
  }

  const ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI').clip(geometry);

  const downloadUrl = await withTimeout(new Promise((resolve, reject) => {
    ndwi.getDownloadURL(
      {
        name: `NDWI_${coastlineName}_${year}`,
        region: geometry,
        scale: exportScale,
        format: 'GEO_TIFF',
        // pin CRS - default export uses native UTM meters, downstream consumers expect WGS84 degrees
        crs: 'EPSG:4326',
      },
      (url, err) => {
        if (err) reject(new Error(`Earth Engine export failed: ${err}`));
        else resolve(url);
      }
    );
  }), EE_EXPORT_TIMEOUT_MS, `Earth Engine export timed out after ${EE_EXPORT_TIMEOUT_MS / 1000}s`);

  if (!fs.existsSync(NDWI_OUTPUT_DIR)) fs.mkdirSync(NDWI_OUTPUT_DIR, { recursive: true });

  const fileName = `NDWI_${coastlineName}_${year}_${Date.now()}.tif`;
  const filePath = path.join(NDWI_OUTPUT_DIR, fileName);

  await downloadToFile(downloadUrl, filePath);

  return { fileName, filePath };
}

// True-color PNG for the "Satellite Imagery" view. min:0/max:3000/gamma:1.4
// is the standard Sentinel-2 SR true-color recipe.
async function generateTrueColorImage({ lonMin, latMin, lonMax, latMax, year, destPath }) {
  await initEE();

  const geometry = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax]);
  const composite = await buildSentinelComposite(geometry, year);

  const rgb = composite.visualize({ bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.4 });

  const thumbUrl = await withTimeout(new Promise((resolve, reject) => {
    rgb.getThumbURL(
      {
        region: geometry,
        dimensions: 512,
        format: 'png',
        crs: 'EPSG:4326',
      },
      (url, err) => {
        if (err) reject(new Error(`Earth Engine thumbnail export failed: ${err}`));
        else resolve(url);
      }
    );
  }), EE_EXPORT_TIMEOUT_MS, `Earth Engine thumbnail export timed out after ${EE_EXPORT_TIMEOUT_MS / 1000}s`);

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  await downloadToFile(thumbUrl, destPath);
}

module.exports = { generateNDWIGeoTIFF, generateTrueColorImage };
