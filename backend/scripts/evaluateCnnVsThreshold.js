require("dotenv").config();
const path = require("path");
const sharp = require("sharp");
const { buildWaterMasks, COASTLINE_GRID_SIZE } = require("../services/imageCNNDetection");

const SIZE = COASTLINE_GRID_SIZE;

async function loadLabelMask(labelPath) {
  const { data } = await sharp(labelPath)
    .resize(SIZE, SIZE, { kernel: "nearest" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) mask[i] = data[i] >= 128 ? 1 : 0;
  return mask;
}

function scoreMask(predicted, label) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let i = 0; i < label.length; i++) {
    if (predicted[i] === 1 && label[i] === 1) tp++;
    else if (predicted[i] === 1 && label[i] === 0) fp++;
    else if (predicted[i] === 0 && label[i] === 1) fn++;
    else tn++;
  }
  const iou = tp + fp + fn === 0 ? 1 : tp / (tp + fp + fn);
  const accuracy = (tp + tn) / label.length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return { iou, accuracy, precision, recall };
}

function printRow(name, s) {
  console.log(
    `${name.padEnd(18)} IoU=${(s.iou * 100).toFixed(1)}%  pixel-accuracy=${(s.accuracy * 100).toFixed(1)}%  precision=${(s.precision * 100).toFixed(1)}%  recall=${(s.recall * 100).toFixed(1)}%`
  );
}

async function main() {
  const [imagePath, labelPath] = process.argv.slice(2);
  if (!imagePath || !labelPath) {
    console.error("Usage: node scripts/evaluateCnnVsThreshold.js <satellite-image-or-ndwi.tif> <labeled-mask.png>");
    console.error("The labeled mask must be the same extent as the image: WHITE = water, BLACK = land.");
    process.exit(1);
  }

  const label = await loadLabelMask(path.resolve(labelPath));
  const { cnnMask, thresholdMask, usedNdwi } = await buildWaterMasks(path.resolve(imagePath));

  const cnnScore = scoreMask(cnnMask, label);
  const thresholdScore = scoreMask(thresholdMask, label);

  console.log("");
  console.log(`Image: ${imagePath} (${usedNdwi ? "NDWI GeoTIFF path" : "RGB colour path"})`);
  console.log(`Label: ${labelPath} (resized to ${SIZE}x${SIZE})`);
  console.log("");
  printRow("Plain threshold", thresholdScore);
  printRow("CNN prediction", cnnScore);
  console.log("");

  const diff = (cnnScore.iou - thresholdScore.iou) * 100;
  if (Math.abs(diff) < 1) {
    console.log("Verdict: CNN and plain threshold are equivalent on this image (IoU within 1 point).");
  } else if (diff > 0) {
    console.log(`Verdict: CNN outperforms the plain threshold by ${diff.toFixed(1)} IoU points on this image.`);
  } else {
    console.log(`Verdict: Plain threshold outperforms the CNN by ${Math.abs(diff).toFixed(1)} IoU points on this image.`);
  }
  console.log("Evaluate 20-30 labeled images and aggregate before concluding — a single image is not evidence.");
}

main().catch((err) => {
  console.error("Evaluation failed:", err.message);
  process.exit(1);
});
