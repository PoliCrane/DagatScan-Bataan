const path = require("path");
const GeoTIFFLib = require("geotiff");

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: node scripts/verifyNdwiPolarity.js <path-to-ndwi.tif>");
    process.exit(1);
  }

  const tiff = await GeoTIFFLib.fromFile(path.resolve(imagePath));
  const image = await tiff.getImage();
  if (image.getSamplesPerPixel() !== 1) {
    console.error("Not a single-band raster — this script expects an NDWI GeoTIFF export.");
    process.exit(1);
  }

  const rasters = await image.readRasters();
  const data = Float32Array.from(rasters[0]);

  let positives = 0;
  let negatives = 0;
  let sumPos = 0;
  let sumNeg = 0;
  let min = Infinity;
  let max = -Infinity;
  let valid = 0;

  for (const v of data) {
    if (!isFinite(v)) continue;
    valid++;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v > 0) {
      positives++;
      sumPos += v;
    } else if (v < 0) {
      negatives++;
      sumNeg += v;
    }
  }

  const pctPos = ((positives / valid) * 100).toFixed(1);
  const pctNeg = ((negatives / valid) * 100).toFixed(1);

  console.log(`File: ${imagePath}`);
  console.log(`Size: ${image.getWidth()}x${image.getHeight()} px, valid pixels: ${valid}`);
  console.log(`NDWI range: min=${min.toFixed(4)} max=${max.toFixed(4)}`);
  console.log(`Positive pixels (expected WATER): ${positives} (${pctPos}%), mean=${(sumPos / (positives || 1)).toFixed(4)}`);
  console.log(`Negative pixels (expected LAND):  ${negatives} (${pctNeg}%), mean=${(sumNeg / (negatives || 1)).toFixed(4)}`);
  console.log("");
  console.log("Interpretation (McFeeters NDWI, Sentinel-2 B3/B8):");
  console.log("- Water absorbs NIR strongly, so open water should be POSITIVE.");
  console.log("- Land and vegetation reflect NIR strongly, so land should be NEGATIVE.");
  console.log("- Compare the percentages above against the actual water/land share of the image extent.");
  console.log("- If the positive share clearly matches the land share instead, the export pipeline is inverted and needs investigation.");
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
