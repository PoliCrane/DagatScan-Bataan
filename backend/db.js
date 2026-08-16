const { Pool } = require("pg");

require("dotenv").config();

// no insecure fallback — a default password would let anyone connect if env vars are missing
if (!process.env.DB_PASSWORD) {
  throw new Error("DB_PASSWORD is not set. Add it to backend/.env before starting the server.");
}

const isProduction = process.env.NODE_ENV === "production";

// TLS on by default in production (or when DB_SSL=true). Certificate verification is
// enabled only when DB_CA_CERT is provided — Railway/Supabase use certs that fail strict
// verification without their CA, and unverified TLS still encrypts traffic in transit.
let ssl = false;
if (isProduction || process.env.DB_SSL === "true") {
  ssl = process.env.DB_CA_CERT
    ? { rejectUnauthorized: true, ca: process.env.DB_CA_CERT }
    : { rejectUnauthorized: false };
}

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "db_coastalerosion",
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl,
  max: parseInt(process.env.DB_POOL_MAX || "10", 10),
  idleTimeoutMillis: 30000,
  // avoid hanging forever if the pool is full
  connectionTimeoutMillis: 10000,
});

// prevent an idle client error from crashing the process
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

module.exports = pool;
