/**
 * Google Earth Engine NDWI Generation
 *
 * Queries Sentinel-2 imagery for a bounding box/year, computes NDWI,
 * and exports it as a downloadable single-band GeoTIFF.
 *
 * Auth: service account JSON key file, path from EE_SERVICE_ACCOUNT_KEY_PATH
 * env var, defaulting to backend/config/ee-service-account.json.
 *
 * Setup (one-time, done by the admin operating this server):
 *  1. Create a GCP project, enable the Earth Engine API
 *  2. Register the project for Earth Engine access (signup.earthengine.google.com)
 *  3. Create a service account + JSON key, grant it Earth Engine access
 *  4. Place the key at backend/config/ee-service-account.json
 */

const ee = require('@google/earthengine');
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY_PATH = process.env.EE_SERVICE_ACCOUNT_KEY_PATH ||
  path.join(__dirname, '../config/ee-service-account.json');

const NDWI_OUTPUT_DIR = path.join(__dirname, '../uploads/ndwi');

let initialized = false;
let initPromise = null;

// No timeout on ee.data.authenticateViaPrivateKey/ee.initialize's network
// calls to Google, combined with server.js disabling Node's own request
// timeout, meant a stuck auth call hung the caller forever with no visible
// error. This bounds it — and resets initPromise on any failure (timeout or
// real) so the next call gets a fresh attempt instead of being stuck reusing
// a dead promise.
const EE_INIT_TIMEOUT_MS = 25000;

function initEE() {
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  const authPromise = new Promise((resolve, reject) => {
    if (!fs.existsSync(KEY_PATH)) {
      reject(new Error(
        `Earth Engine service account key not found at ${KEY_PATH}. ` +
        `Set EE_SERVICE_ACCOUNT_KEY_PATH or place the key at backend/config/ee-service-account.json.`
      ));
      return;
    }

    let privateKey;
    try {
      privateKey = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
    } catch (e) {
      reject(new Error(`Failed to parse Earth Engine service account key: ${e.message}`));
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

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`NDWI download failed with status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Shared Sentinel-2 composite (collection/cloud filter/date range) used by
// both NDWI and true-color generation, so they read identical source pixels.
function buildSentinelComposite(geometry, year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

  return collection.median();
}

/**
 * Generate an NDWI GeoTIFF for the given bounding box and year.
 * NDWI (McFeeters) = (Green - NIR) / (Green + NIR), Sentinel-2 bands B3/B8.
 * Positive = water, negative = land/vegetation.
 */
async function generateNDWIGeoTIFF({ lonMin, latMin, lonMax, latMax, year, coastlineName }) {
  await initEE();

  const geometry = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax]);
  const composite = buildSentinelComposite(geometry, year);

  // McFeeters NDWI: (Green - NIR) / (Green + NIR) — strongly positive over
  // water, negative over land/vegetation. An NDVI-like NIR-vs-RED index was
  // not used: water's NIR-RED value sits near zero and drifts across the
  // threshold on glint/turbidity noise.
  const green = composite.select('B3');
  const nir = composite.select('B8');
  const ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI').clip(geometry);

  const downloadUrl = await new Promise((resolve, reject) => {
    ndwi.getDownloadURL(
      {
        name: `NDWI_${coastlineName}_${year}`,
        region: geometry,
        scale: 10,
        format: 'GEO_TIFF',
        // Without an explicit crs, Earth Engine exports in the source
        // imagery's native UTM projection (meters); every downstream
        // consumer assumes WGS84 degrees, so this must be pinned.
        crs: 'EPSG:4326',
      },
      (url, err) => {
        if (err) reject(new Error(`Earth Engine export failed: ${err}`));
        else resolve(url);
      }
    );
  });

  if (!fs.existsSync(NDWI_OUTPUT_DIR)) fs.mkdirSync(NDWI_OUTPUT_DIR, { recursive: true });

  const fileName = `NDWI_${coastlineName}_${year}_${Date.now()}.tif`;
  const filePath = path.join(NDWI_OUTPUT_DIR, fileName);

  await downloadToFile(downloadUrl, filePath);

  return { fileName, filePath };
}

/**
 * Fetch a true-color PNG for the given bounding box/year (Data Management
 * page's "Satellite Imagery" view). Same composite as NDWI, visualized as
 * RGB; min:0/max:3000/gamma:1.4 is the standard Sentinel-2 SR true-color
 * recipe. Uses getThumbURL() (server-side rendered PNG) since this is only
 * for display, unlike NDWI's raw-band download.
 */
async function generateTrueColorImage({ lonMin, latMin, lonMax, latMax, year, destPath }) {
  await initEE();

  const geometry = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax]);
  const composite = buildSentinelComposite(geometry, year);

  const rgb = composite.visualize({ bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.4 });

  const thumbUrl = await new Promise((resolve, reject) => {
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
  });

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  await downloadToFile(thumbUrl, destPath);
}

module.exports = { generateNDWIGeoTIFF, generateTrueColorImage };
