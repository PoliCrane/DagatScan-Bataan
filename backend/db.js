const { Pool } = require("pg");

require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "db_coastalerosion",
  password: process.env.DB_PASSWORD || "admin123",
  port: process.env.DB_PORT || 5432
});

// Without this, an idle-client hiccup emits an unhandled 'error' event that crashes the process.
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

module.exports = pool;