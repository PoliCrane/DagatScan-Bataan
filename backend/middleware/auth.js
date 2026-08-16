require("dotenv").config();
const jwt = require("jsonwebtoken");
const pool = require("../db");

// No insecure fallback — see server.js for the matching startup check.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to backend/.env before starting the server.");
}
const JWT_SECRET = process.env.JWT_SECRET;

// Verifies the JWT, then re-checks roles/active against the database so that
// deactivation or a role change takes effect immediately instead of when the
// token expires. req.user carries the FRESH roles from the database.
const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") {
    return res.status(401).json({ error: "No token provided" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.roles, u.active, u.municipality_id, m.name AS municipality
       FROM users u
       LEFT JOIN municipalities m ON m.id = u.municipality_id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].active) {
      return res.status(401).json({ error: "Account is deactivated or no longer exists" });
    }

    const user = result.rows[0];
    req.user = {
      id: user.id,
      username: user.username,
      roles: user.roles,
      municipality_id: user.municipality_id,
      municipality: user.municipality,
    };
    next();
  } catch (err) {
    console.error("Auth database check failed:", err.message);
    res.status(503).json({ error: "Authentication service unavailable" });
  }
};

const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.roles)) {
    return res.status(403).json({
      error: `Access denied. Required role: ${allowed.join(" or ")}.`,
    });
  }
  next();
};

// Restricts municipal users to their own municipality; admin and superadmin pass through.
// resolveTarget receives req and returns the requested municipality name or id.
const requireMunicipalityScope = (resolveTarget) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "No token provided" });
  if (req.user.roles !== "municipal") return next();

  const target = resolveTarget(req);
  if (target === null || target === undefined) return next();

  const matchesId = String(target) === String(req.user.municipality_id);
  const matchesName =
    typeof target === "string" &&
    req.user.municipality &&
    target.toLowerCase() === req.user.municipality.toLowerCase();

  if (!matchesId && !matchesName) {
    return res.status(403).json({ error: "Access denied. Outside your municipality." });
  }
  next();
};

const verifyAdmin = requireRole("admin", "superadmin");
const verifySuperadmin = requireRole("superadmin");
const verifyMunicipal = requireRole("municipal", "admin", "superadmin");

module.exports = {
  verifyToken,
  verifyAdmin,
  verifySuperadmin,
  verifyMunicipal,
  requireRole,
  requireMunicipalityScope,
};
