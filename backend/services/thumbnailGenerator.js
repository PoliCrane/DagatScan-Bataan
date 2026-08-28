// Browser-viewable thumbnails for uploaded satellite imagery. Uploads are single-band Float32
// NDWI GeoTIFFs - browsers can't render .tif, and the pixel data isn't RGB, so previews are
// rendered server-side as a plain grayscale ramp (not a water/land palette), because stored
// files don't share one sign convention and a semantic palette would mislabel water on some of them.
// Note: imageCNNDetection.js's fixed `ndwi < 0 = water` assumption is inverted for some uploads -
// a separate pre-existing issue, not fixed here. Ordinary RGB uploads just get resized.

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const GeoTIFFLib = require("geotiff");

// native rasters are ~170px wide, so 480 is a real upsample; one file, used as both
// the CSS-scaled table thumb and the full "View" image
const THUMB_WIDTH = 480;

// Where a source image's thumbnail lives; a pure path helper so callers derive it
// consistently without storing it in the DB.
function thumbnailPathFor(imagePath) {
  const dir = path.join(path.dirname(imagePath), "thumbnails");
  const base = path.basename(imagePath, path.extname(imagePath));
  return path.join(dir, `${base}.png`);
}

// Maps a single-band raster to 8-bit grayscale, stretched across the band's actual min/max
// (not an assumed -1..+1) - some rasters only span a fraction of that range. NaN renders mid-gray.
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

// Renders a thumbnail for an uploaded satellite image. Returns the thumbnail path,
// or null (non-fatal) if it couldn't be produced.
async function generateThumbnail(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return null;

  const outPath = thumbnailPathFor(imagePath);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const ext = path.extname(imagePath).toLowerCase();

  // sharp can't decode single-band GeoTIFFs, so read via geotiff and colorize ourselves
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
