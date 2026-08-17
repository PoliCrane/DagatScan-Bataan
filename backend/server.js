require("dotenv").config();
const { validateEnv } = require("./config/env");
validateEnv();

// log unhandled rejections instead of dying silently
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception — server is exiting:", err);
  process.exit(1);
});
// log shutdown signals to tell a soft stop from a crash
process.on("SIGTERM", () => console.log("[shutdown] received SIGTERM"));
process.on("SIGINT", () => console.log("[shutdown] received SIGINT"));
process.on("exit", (code) => console.log(`[shutdown] process exiting with code ${code}`));

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const { verifyToken, verifyAdmin, verifySuperadmin } = require("./middleware/auth");
const { apiLimiter } = require("./middleware/rateLimiters");
const { syncPendingFilesToStorage } = require("./services/storageSync");

const app = express();
// Hosted behind a reverse proxy; trust X-Forwarded-For or rate limiting breaks
app.set("trust proxy", 1);
// PaaS platforms assign the port via this env var; falls back to 5000 locally
const PORT = process.env.PORT || 5000;

app.use(
  helmet({
    // uploaded images are displayed by the separately-hosted frontend
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
// falls back to local Vite port; set FRONTEND_URL in production, no trailing slash
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(apiLimiter);
// request letters contain PII — only superadmins may fetch them, via /admin/account-requests/:id/letter
app.use("/uploads/request-letters", verifyToken, verifySuperadmin);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const shorelineDataRouter = require("./routes/shorelineData");
const uploadManagementRouter = require("./routes/uploadManagement");
const ndwiGenerationRouter = require("./routes/ndwiGeneration");
const reportsRouter = require("./routes/reports");
const auditLogRouter = require("./routes/auditLog");

app.use("/", authRouter);
app.use("/admin", verifyToken, verifySuperadmin, usersRouter);
app.use("/api/shoreline", shorelineDataRouter);
// admin-only; can't mount auth on bare /api since that would also block /api/reports and /api/health
app.use("/api/admin/uploads", verifyToken, verifyAdmin, uploadManagementRouter);
app.use("/api", ndwiGenerationRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin/audit-logs", verifyToken, verifySuperadmin, auditLogRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "API Running", timestamp: new Date() });
});

// single error handler — logs server-side, returns a generic message so internals never leak
app.use((err, req, res, next) => {
  console.error("Unhandled route error:", err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : "Internal server error" });
});

const httpServer = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const { initCNNModel } = require('./services/imageCNNDetection');
  initCNNModel().catch(err => console.warn('[CNN] Pre-warm skipped:', err.message));

  // daily safety-net sync for anything scheduleSync() missed; skipped if Supabase isn't configured
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const SAFETY_NET_INTERVAL_MS = 24 * 60 * 60 * 1000;
    setTimeout(() => {
      syncPendingFilesToStorage().catch(err => console.error('[storageSync] Initial sync failed:', err.message));
      setInterval(() => {
        syncPendingFilesToStorage().catch(err => console.error('[storageSync] Safety-net sync failed:', err.message));
      }, SAFETY_NET_INTERVAL_MS);
    }, 10000);
  }

});

// long ceiling instead of disabled timeouts: satellite uploads + CNN training legitimately run
// for minutes, but headersTimeout still closes slowloris-style connections that stall on headers
httpServer.requestTimeout = 30 * 60 * 1000;
httpServer.headersTimeout = 65 * 1000;
httpServer.timeout = 30 * 60 * 1000;

// tfjs-node's native binding can drop the event-loop ref count after startup; this interval keeps the process alive
httpServer.on("close", () => console.error("[server] httpServer closed unexpectedly"));
setInterval(() => {}, 60_000);
