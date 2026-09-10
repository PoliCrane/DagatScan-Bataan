require("dotenv").config();

const REQUIRED = ["JWT_SECRET", "DB_PASSWORD"];
const RECOMMENDED = ["DB_HOST", "DB_NAME", "DB_USER", "FRONTEND_URL", "BREVO_API_KEY", "EMAIL_USER"];

function validateEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Add them to backend/.env before starting the server.`
    );
  }

  const unset = RECOMMENDED.filter((name) => !process.env[name]);
  if (unset.length > 0) {
    console.warn(`[env] Optional variables not set (some features may be degraded): ${unset.join(", ")}`);
  }
}

// Splits FRONTEND_URL on commas so multiple deployed frontends (e.g. a
// Vercel preview URL plus a custom domain and its www subdomain) can all be
// allowed at once — cors()'s `origin` option accepts an array natively, and
// CSP's frame-ancestors accepts a space-separated source list.
function getFrontendOrigins() {
  const raw = process.env.FRONTEND_URL || "http://localhost:5173";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

module.exports = { validateEnv, getFrontendOrigins };
