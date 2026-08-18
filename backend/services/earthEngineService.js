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

// masks cloud (8,9), cirrus (10), and cloud shadow (3) pixels via the Scene Classification band
function maskSentinelClouds(image) {
  const scl = image.select('SCL');
  const clear = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  return image.updateMask(clear);
}

// shared Sentinel-2 composite so NDWI and true-color read identical source pixels.
// season 'dry' restricts to Nov-Apr scenes (consistent beach/tide state year-over-year,
// PH dry season); 'annual' keeps the original whole-year behavior.
function buildSentinelComposite(geometry, year, season = 'annual') {
  let collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

  if (season === 'dry') {
    collection = collection.filter(
      ee.Filter.or(
        ee.Filter.date(`${year}-01-01`, `${year}-04-30`),
        ee.Filter.date(`${year}-11-01`, `${year}-12-31`)
      )
    );
  } else {
    collection = collection.filterDate(`${year}-01-01`, `${year}-12-31`);
  }

  return collection.map(maskSentinelClouds).median();
}

// Landsat Collection 2 Level-2 composite for years before Sentinel-2 (1990-2014).
// Applies the C02 optical scaling factors (NDWI is not invariant to the -0.2 offset)
// and masks clouds/shadows via QA_PIXEL bits 3 and 4.
function buildLandsatComposite(geometry, year) {
  const spec =
    year >= 2013
      ? { id: 'LANDSAT/LC08/C02/T1_L2', green: 'SR_B3', nir: 'SR_B5' }
      : year >= 1999
      ? { id: 'LANDSAT/LE07/C02/T1_L2', green: 'SR_B2', nir: 'SR_B4' }
      : { id: 'LANDSAT/LT05/C02/T1_L2', green: 'SR_B2', nir: 'SR_B4' };

  const maskClouds = (image) => {
    const qa = image.select('QA_PIXEL');
    const clear = qa.bitwiseAnd(1 << 3).eq(0).and(qa.bitwiseAnd(1 << 4).eq(0));
    return image.updateMask(clear);
  };

  const scaled = ee.ImageCollection(spec.id)
    .filterBounds(geometry)
    .filterDate(`${year}-01-01`, `${year}-12-31`)
    .map(maskClouds)
    .map((img) => img.select([spec.green, spec.nir]).multiply(0.0000275).add(-0.2))
    .median();

  return { composite: scaled, green: spec.green, nir: spec.nir, scaleMeters: 30 };
}

// NDWI (McFeeters) = (Green - NIR) / (Green + NIR). Positive = water, negative = land.
// index 'mndwi' uses Green-SWIR (B3/B11, Sentinel-2 only) — better separation in turbid
// coastal water. season 'dry' restricts the composite to Nov-Apr scenes. Years before
// 2015 automatically use Landsat Collection 2 (30 m) instead of Sentinel-2.
async function generateNDWIGeoTIFF({ lonMin, latMin, lonMax, latMax, year, coastlineName, index = 'ndwi', season = 'annual' }) {
  await initEE();

  const geometry = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax]);

  let green;
  let nir;
  let exportScale = 10;
  if (year < 2015) {
    const landsat = buildLandsatComposite(geometry, year);
    green = landsat.composite.select(landsat.green);
    nir = landsat.composite.select(landsat.nir);
    exportScale = landsat.scaleMeters;
  } else {
    const composite = buildSentinelComposite(geometry, year, season);
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
  const composite = buildSentinelComposite(geometry, year);

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
