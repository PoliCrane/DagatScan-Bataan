/**
 * Entry point for the CNN detection child process (spawned via
 * child_process.fork from cnnDetectionPool.js).
 *
 * Runs the exact same imageCNNDetection.js used previously in-process — the
 * only thing that changes is which OS process executes model.fit's ~30s of
 * synchronous work, so it no longer blocks the main server's event loop.
 * Communicates over the IPC channel fork() provides automatically.
 */
const { detectCoastlineWithCNN, initCNNModel } = require("./imageCNNDetection");

async function main() {
  await initCNNModel();
  process.send({ type: "ready" });
}

process.on("message", async (msg) => {
  if (!msg || msg.type !== "detect") return;
  const { requestId, imagePath } = msg;
  try {
    const result = await detectCoastlineWithCNN(imagePath);
    process.send({ type: "result", requestId, result });
  } catch (err) {
    process.send({ type: "result", requestId, error: err.message });
  }
});

main().catch((err) => {
  console.error("[cnnDetectionProcess] Fatal startup error:", err.message);
  process.exit(1);
});
