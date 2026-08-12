/**
 * Runs CNN coastline detection in a persistent child process
 * (cnnDetectionProcess.js) so its ~30s-per-image model.fit call can't block
 * the main server's event loop — the model is a singleton that accumulates
 * fine-tuning across uploads, so this is one long-lived child, not a
 * worker-per-task pool. child_process (not worker_threads) specifically
 * because tfjs-node's native bindings have unverified worker_threads
 * compatibility; a child process is just the same working setup running
 * twice, with no such question.
 *
 * Falls back to calling imageCNNDetection.js's detectCoastlineWithCNN
 * directly in-process (today's original behavior — blocking, but guaranteed
 * to work) if the child never became ready, crashed, or a request times
 * out. The fallback's own model copy is loaded lazily, only if actually
 * needed, so the common case (healthy child) never pays for a second
 * in-memory model.
 */
const { fork } = require("child_process");
const path = require("path");

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // generous vs. the expected ~30s

let child = null;
let ready = false;
let nextRequestId = 1;
const pending = new Map(); // requestId -> { resolve, reject, timer }

function rejectAllPending(reason) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(reason));
  }
  pending.clear();
}

function spawnChild() {
  child = fork(path.join(__dirname, "cnnDetectionProcess.js"));

  child.on("message", (msg) => {
    if (!msg) return;
    if (msg.type === "ready") {
      ready = true;
      console.log("[cnnDetectionPool] Child process ready");
      return;
    }
    if (msg.type === "result") {
      const entry = pending.get(msg.requestId);
      if (!entry) return;
      pending.delete(msg.requestId);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error));
      else entry.resolve(msg.result);
    }
  });

  child.on("exit", (code, signal) => {
    // signal (e.g. SIGKILL) is what shows up for an OOM-killed process —
    // code alone would just be null in that case, hiding the real cause.
    console.warn(`[cnnDetectionPool] Child process exited (code=${code}, signal=${signal}) — falling back to synchronous in-process detection for the rest of this server's uptime`);
    ready = false;
    child = null;
    rejectAllPending("CNN detection child process exited");
  });

  child.on("error", (err) => {
    console.error("[cnnDetectionPool] Child process error:", err.message);
    ready = false;
  });
}

/** Called once at server startup — mirrors the old initCNNModel() pre-warm. */
function initCNNDetectionPool() {
  try {
    spawnChild();
  } catch (err) {
    console.warn("[cnnDetectionPool] Failed to spawn child process, will fall back to synchronous detection:", err.message);
  }
}

async function detectInSubprocess(imagePath) {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("CNN detection child process timed out"));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timer });
    try {
      child.send({ type: "detect", requestId, imagePath });
    } catch (err) {
      pending.delete(requestId);
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Public entry point — routes to the child process when healthy, otherwise
 * falls back to the exact synchronous path this whole module replaces.
 */
async function detectCoastlineInSubprocess(imagePath) {
  if (ready && child) {
    try {
      return await detectInSubprocess(imagePath);
    } catch (err) {
      console.warn(`[cnnDetectionPool] Subprocess detection failed (${err.message}), falling back to synchronous in-process detection for this request`);
    }
  } else {
    // Previously silent — this is the "child was never ready / already dead"
    // case, distinct from "child was healthy but this one request failed"
    // above. Without this log, a permanently-dead child was indistinguishable
    // from the intended fast path except by noticing imageCNNDetection.js's
    // own startup log printing again mid-request.
    console.warn(`[cnnDetectionPool] Child process not available (ready=${ready}, child=${!!child}) — using synchronous in-process detection for this request`);
  }

  const { detectCoastlineWithCNN } = require("./imageCNNDetection");
  return detectCoastlineWithCNN(imagePath);
}

module.exports = { initCNNDetectionPool, detectCoastlineInSubprocess };
