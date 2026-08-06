/**
 * Browser-viewable thumbnails for uploaded satellite imagery.
 *
 * Uploads are single-band Float32 NDWI GeoTIFFs — browsers cannot render
 * .tif at all, and even if they could, the pixel data is a normalized water
 * index (roughly -1..+1), not RGB. So a preview has to be rendered
 * server-side; there's no way to point an <img> at the original file.
 *
 * Rendered as a plain GRAYSCALE ramp (low = dark, high = light) rather than
 * the blue-water/orange-land diverging palette used by the _colorize_ndwi.js
 * debugging script, because the stored files do NOT share one sign
 * convention and a semantic palette would therefore mislabel water as land
 * on some of them.
 *
 * Verified while building this: for the Bagac uploads the sea reads
 * POSITIVE (bbox 120.378-120.394E sits on Bataan's west coast, so the sea
 * must be the western/left side, and that side measures ~+0.35 while the
 * inland side measures ~-0.57). Other rasters in this project measure the
 * other way round. Since the ramp only claims "higher vs lower index value"
 * and never claims which end is water, it stays truthful for every file.
 * (Note this also means services/imageCNNDetection.js's fixed
 * `ndwi < 0 = water` assumption is inverted for these particular uploads —
 * a separate pre-existing issue, flagged but deliberately not touched here.)
 *
 * Ordinary RGB uploads (jpeg/png/webp, which config/multer.js also accepts
 * on the satellite field) skip this and are just resized.
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const GeoTIFFLib = require("geotiff");

// Native source rasters are only ~170px wide, so 480 is already a real
// upsample — this is the one file generated per upload, used both as the
// small table thumbnail (CSS-scaled down via .dm-thumb) and as the enlarged
// image the "View" action opens directly.
const THUMB_WIDTH = 480;

/**
 * Where a given source image's thumbnail lives. Kept as a pure path helper
 * so the upload flow, the backfill script, and the API layer all derive the
 * same location without storing it in the database.
 */
function thumbnailPathFor(imagePath) {
  const dir = path.join(path.dirname(imagePath), "thumbnails");
  const base = path.basename(imagePath, path.extname(imagePath));
  return path.join(dir, `${base}.png`);
}

/**
 * Maps a single-band raster to an 8-bit grayscale buffer, stretched across
 * the band's own actual min/max rather than an assumed -1..+1 range — some
 * of these rasters only span a fraction of the theoretical NDWI range, and a
 * fixed stretch would render those as a flat, featureless gray square.
 * NaN pixels (nodata) render mid-gray.
 */
function toGrayscale(data, width, height) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min;
  const gray = Buffer.alloc(width * height);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isNaN(v)) {
      gray[i] = 128;
    } else if (range === 0) {
      gray[i] = 128;
    } else {
      gray[i] = Math.round(((v - min) / range) * 255);
    }
  }
  return gray;
}

/**
 * Render a thumbnail for an uploaded satellite image.
 *
 * @param {string} imagePath - absolute path to the stored upload
 * @returns {Promise<string|null>} the thumbnail path, or null if one
 *   couldn't be produced (caller should treat this as non-fatal)
 */
async function generateThumbnail(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return null;

  const outPath = thumbnailPathFor(imagePath);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const ext = path.extname(imagePath).toLowerCase();

  // Single-band GeoTIFF path — sharp can't decode these, so read the raster
  // with the geotiff package and colorize it ourselves.
  if (ext === ".tif" || ext === ".tiff") {
    const tiff = await GeoTIFFLib.fromFile(imagePath);
    const image = await tiff.getImage();

    if (image.getSamplesPerPixel() === 1) {
      const rasters = await image.readRasters();
      const data = Float32Array.from(rasters[0]);
      const width = image.getWidth();
      const height = image.getHeight();

      const gray = toGrayscale(data, width, height);
      await sharp(gray, { raw: { width, height, channels: 1 } })
        .resize(THUMB_WIDTH, null, { fit: "inside", withoutEnlargement: false })
        .png()
        .toFile(outPath);

      return outPath;
    }
    // Multi-band TIFF falls through to sharp below — it can handle those.
  }

  await sharp(imagePath)
    .resize(THUMB_WIDTH, null, { fit: "inside", withoutEnlargement: false })
    .png()
    .toFile(outPath);

  return outPath;
}

module.exports = { generateThumbnail, thumbnailPathFor, THUMB_WIDTH };
