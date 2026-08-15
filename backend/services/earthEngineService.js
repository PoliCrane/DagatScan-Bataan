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

// shared Sentinel-2 composite so NDWI and true-color read identical source pixels
function buildSentinelComposite(geometry, year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

  return collection.median();
}

// NDWI (McFeeters) = (Green - NIR) / (Green + NIR), Sentinel-2 bands B3/B8. Positive = water, negative = land.
async function generateNDWIGeoTIFF({ lonMin, latMin, lonMax, latMax, year, coastlineName }) {
  await initEE();

  const geometry = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax]);
  const composite = buildSentinelComposite(geometry, year);

  // NDVI-style NIR/RED wasn't used - water's NIR-RED value sits near zero and
  // drifts across the threshold on glint/turbidity noise.
  const green = composite.select('B3');
  const nir = composite.select('B8');
  const ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI').clip(geometry);

  const downloadUrl = await withTimeout(new Promise((resolve, reject) => {
    ndwi.getDownloadURL(
      {
        name: `NDWI_${coastlineName}_${year}`,
        region: geometry,
        scale: 10,
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
