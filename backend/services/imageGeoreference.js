// Converts pixel coordinates to geographic coordinates.

const fs = require('fs');

// Derives a {north, south, east, west} bounding box from upper-left/pixel-size fields.
function boundsFromUpperLeft({ xUpperLeft, yUpperLeft, pixelWidth, pixelHeight }, width, height) {
  return {
    west: xUpperLeft,
    east: xUpperLeft + width * pixelWidth,
    north: yUpperLeft,
    south: yUpperLeft - height * pixelHeight,
  };
}

// Extracts georeference info: embedded GeoTIFF, world files (.tfw/.jgw/.pgw), or manual metadata bounds.
async function extractGeoreference(imagePath, metadata = {}) {
  try {
    const extension = imagePath.toLowerCase().split('.').pop();

    // same filename, different extension
    const worldFileResult = await readWorldFile(imagePath);
    if (worldFileResult) {
      const { width, height } = await getImageDimensions(imagePath);
      return {
        valid: true,
        method: 'worldfile',
        // bounds must be present - callers branch on it for pixel-coord normalization
        georeference: { ...worldFileResult, bounds: boundsFromUpperLeft(worldFileResult, width, height) },
      };
    }

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

      // worldfile-equivalent fields so pixelToGeo() works the same regardless of source
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

// Gets image width/height. Regular images via sharp; single-band float32 GeoTIFFs
// (e.g. NDWI exports) via geotiff - sharp's libvips can't parse those ("samples out of range").
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

// Reads a world file (.tfw/.jgw/.pgw). 6 lines: pixel width, rotation, rotation,
// pixel height (negative), upper-left x, upper-left y.
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
          crs: 'EPSG:4326', // assumes WGS84
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error reading world file:', error);
    return null;
  }
}

// Reads embedded GeoTIFF georeferencing (ModelTransformation/tiepoint tags); preferred over hand-typed bounds.
async function extractGeoTIFFMetadata(imagePath) {
  try {
    const GeoTIFFLib = require('geotiff');
    const tiff = await GeoTIFFLib.fromFile(imagePath);
    const image = await tiff.getImage();

    const bbox = image.getBoundingBox(); // [west, south, east, north], in the raster's own CRS units
    if (!bbox || bbox.length !== 4) return null;

    const [west, south, east, north] = bbox;

    // reject anything that isn't plausible WGS84 degrees (e.g. UTM) instead of producing wrong coords
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
  // worldfile and manual_bounds are both normalized to the same fields, so this works for either

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
