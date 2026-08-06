require("dotenv").config();
const jwt = require("jsonwebtoken");

// No insecure fallback — see server.js for the matching startup check.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to backend/.env before starting the server.");
}
const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Allows admin AND superadmin
const verifyAdmin = (req, res, next) => {
  if (req.user.roles !== "admin" && req.user.roles !== "superadmin") {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }
  next();
};

// Only allows superadmin
const verifySuperadmin = (req, res, next) => {
  if (req.user.roles !== "superadmin") {
    return res.status(403).json({ error: "Access denied. Superadmin role required." });
  }
  next();
};

// Allows municipal, admin, AND superadmin
const verifyMunicipal = (req, res, next) => {
  if (req.user.roles !== "municipal" && req.user.roles !== "admin" && req.user.roles !== "superadmin") {
    return res.status(403).json({ error: "Access denied. Municipal role required." });
  }
  next();
};

module.exports = { verifyToken, verifyAdmin, verifySuperadmin, verifyMunicipal };
