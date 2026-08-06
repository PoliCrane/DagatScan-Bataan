/**
 * Satellite Image Georeferencing
 * Converts pixel coordinates to geographic coordinates
 */

const fs = require('fs');

/**
 * Derive a {north, south, east, west} bounding box from the normalised
 * upper-left/pixel-size fields, given the image's actual dimensions.
 */
function boundsFromUpperLeft({ xUpperLeft, yUpperLeft, pixelWidth, pixelHeight }, width, height) {
  return {
    west: xUpperLeft,
    east: xUpperLeft + width * pixelWidth,
    north: yUpperLeft,
    south: yUpperLeft - height * pixelHeight,
  };
}

/**
 * Extract georeference info from image file
 * Supports:
 * - GeoTIFF with embedded georeferencing
 * - World files (.tfw, .jgw, .pgw)
 * - Manual georeferencing via metadata
 */
async function extractGeoreference(imagePath, metadata = {}) {
  try {
    const extension = imagePath.toLowerCase().split('.').pop();

    // Try to read world file (same name, different extension)
    const worldFileResult = await readWorldFile(imagePath);
    if (worldFileResult) {
      const { width, height } = await getImageDimensions(imagePath);
      return {
        valid: true,
        method: 'worldfile',
        // `.bounds` must be present — callers branch on it to know whether
        // pixel coords need normalizing against the detection grid.
        georeference: { ...worldFileResult, bounds: boundsFromUpperLeft(worldFileResult, width, height) },
      };
    }

    // For GeoTIFF, try to extract embedded georeferencing
    if (['tif', 'tiff'].includes(extension)) {
      const geoTiffResult = await extractGeoTIFFMetadata(imagePath);
      if (geoTiffResult) {
        const { width, height } = await getImageDimensions(imagePath);
        return {
          valid: true,
          method: 'geotiff_embedded',
          georeference: { ...geoTiffResult, bounds: boundsFromUpperLeft(geoTiffResult, width, height) },
        };
      }
    }

    // Fallback: use manual metadata if provided
    if (metadata.bounds && metadata.bounds.north && metadata.bounds.south) {
      const { north, south, east, west } = metadata.bounds;
      const { width, height } = await getImageDimensions(imagePath);

      // Derive worldfile-equivalent fields so pixelToGeo() works the same
      // way regardless of whether georeferencing came from a world file
      // or manually-entered bounds.
      return {
        valid: true,
        method: 'manual_bounds',
        georeference: {
          bounds: metadata.bounds,
          crs: metadata.crs || 'EPSG:4326',
          pixelWidth: (east - west) / width,
          pixelHeight: (north - south) / height,
          xUpperLeft: west,
          yUpperLeft: north,
        },
      };
    }

    return {
      valid: false,
      error: 'No georeferencing data found. Image needs georeference or world file.',
      correction: 'Provide world file or georeference bounds in metadata',
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Get image width/height, handling both regular images (via sharp) and
 * single-band float32 GeoTIFFs like NDWI exports (via geotiff), which sharp's
 * underlying libvips cannot parse ("samples out of range").
 */
async function getImageDimensions(imagePath) {
  const ext = imagePath.toLowerCase().split('.').pop();
  if (['tif', 'tiff'].includes(ext)) {
    try {
      const GeoTIFFLib = require('geotiff');
      const tiff = await GeoTIFFLib.fromFile(imagePath);
      const image = await tiff.getImage();
      return { width: image.getWidth(), height: image.getHeight() };
    } catch (e) {
      // Not a plain-float GeoTIFF geotiff.js can parse — fall through to sharp
    }
  }
  const sharp = require('sharp');
  return sharp(imagePath).metadata();
}

/**
 * Read and parse world file (.tfw, .jgw, .pgw, etc.)
 * Format (6 lines):
 * pixel width (meters/degrees)
 * rotation (typically 0)
 * rotation
 * pixel height (negative, meters/degrees)
 * x coordinate of upper-left corner
 * y coordinate of upper-left corner
 */
async function readWorldFile(imagePath) {
  try {
    const basePath = imagePath.substring(0, imagePath.lastIndexOf('.'));
    const extensions = ['tfw', 'jgw', 'pgw', 'gfw'];

    for (const ext of extensions) {
      const worldFilePath = `${basePath}.${ext}`;
      if (fs.existsSync(worldFilePath)) {
        const content = fs.readFileSync(worldFilePath, 'utf8');
        const lines = content.trim().split('\n').map(l => parseFloat(l.trim()));

        if (lines.length !== 6 || lines.some(isNaN)) {
          throw new Error('Invalid world file format');
        }

        return {
          pixelWidth: Math.abs(lines[0]),
          pixelHeight: Math.abs(lines[3]),
          xRotation: lines[1],
          yRotation: lines[2],
          xUpperLeft: lines[4],
          yUpperLeft: lines[5],
          crs: 'EPSG:4326', // Usually WGS84 for geographic coordinates
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error reading world file:', error);
    return null;
  }
}

/**
 * Reads embedded GeoTIFF georeferencing (ModelTransformation/tiepoint tags)
 * — the file's own authoritative extent, preferred over hand-typed bounds.
 */
async function extractGeoTIFFMetadata(imagePath) {
  try {
    const GeoTIFFLib = require('geotiff');
    const tiff = await GeoTIFFLib.fromFile(imagePath);
    const image = await tiff.getImage();

    const bbox = image.getBoundingBox(); // [west, south, east, north], in the raster's own CRS units
    if (!bbox || bbox.length !== 4) return null;

    const [west, south, east, north] = bbox;

    // Reject anything that isn't plausible WGS84 degrees (e.g. a projected
    // CRS like UTM) rather than silently producing wrong coordinates.
    const looksLikeDegrees =
      west >= -180 && east <= 180 && south >= -90 && north <= 90 && east > west && north > south;
    if (!looksLikeDegrees) {
      console.warn(
        `[Georeference] GeoTIFF bounding box (${bbox.join(', ')}) doesn't look like WGS84 degrees — likely a projected CRS. Falling back to manual bounds.`
      );
      return null;
    }

    const width = image.getWidth();
    const height = image.getHeight();

    return {
      pixelWidth: (east - west) / width,
      pixelHeight: (north - south) / height,
      xUpperLeft: west,
      yUpperLeft: north,
      crs: 'EPSG:4326',
    };
  } catch (error) {
    console.warn('[Georeference] Could not read embedded GeoTIFF georeferencing:', error.message);
    return null;
  }
}

// Convert pixel coordinates to [latitude, longitude].
function pixelToGeo(pixelX, pixelY, georeference) {
  // 'worldfile' and 'manual_bounds' georeferences are both normalized to the
  // same fields by extractGeoreference(), so this works for either.
  if (georeference && georeference.xUpperLeft !== undefined && georeference.pixelWidth !== undefined) {
    const { xUpperLeft, yUpperLeft, pixelWidth, pixelHeight } = georeference;

    const longitude = xUpperLeft + pixelX * pixelWidth;
    const latitude = yUpperLeft - pixelY * pixelHeight; // Y increases downward

    return [latitude, longitude];
  }

  return null;
}

// Get bounding box {north, south, east, west} from georeference + image dimensions.
function getImageBounds(georeference, imageWidth, imageHeight) {
  if (georeference.method === 'worldfile') {
    const { xUpperLeft, yUpperLeft, pixelWidth, pixelHeight } = georeference;

    const west = xUpperLeft;
    const east = xUpperLeft + imageWidth * pixelWidth;
    const north = yUpperLeft;
    const south = yUpperLeft - imageHeight * pixelHeight;

    return { north, south, east, west };
  }

  if (georeference.method === 'manual_bounds') {
    return georeference.bounds;
  }

  return null;
}

module.exports = {
  extractGeoreference,
  readWorldFile,
  pixelToGeo,
  getImageBounds,
};
