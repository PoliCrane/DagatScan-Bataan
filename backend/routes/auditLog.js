/**
 * Read API for the superadmin-only Audit Trail page. Router is mounted
 * behind verifyToken + verifySuperadmin in server.js.
 */

const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {
    const { category, severity, search, limit = 25, offset = 0 } = req.query;

    let query = `SELECT id, actor_id, actor_username, actor_role, action, category, severity, target_type, target_id, details, created_at
                 FROM audit_log WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) AS total FROM audit_log WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      countQuery += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      countQuery += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }
    if (search) {
      query += ` AND (actor_username ILIKE $${paramIndex} OR action ILIKE $${paramIndex} OR target_id ILIKE $${paramIndex})`;
      countQuery += ` AND (actor_username ILIKE $${paramIndex} OR action ILIKE $${paramIndex} OR target_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const listParams = [...params, parseInt(limit), parseInt(offset)];
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

    const [result, countResult] = await Promise.all([
      pool.query(query, listParams),
      pool.query(countQuery, params),
    ]);

    res.json({
      logs: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (err) {
    console.error("Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
        COUNT(*) FILTER (WHERE category = 'data') AS data,
        COUNT(*) FILTER (WHERE category = 'user') AS "user"
      FROM audit_log
    `);
    const row = result.rows[0];
    res.json({
      total: parseInt(row.total),
      critical: parseInt(row.critical),
      data: parseInt(row.data),
      user: parseInt(row.user),
    });
  } catch (err) {
    console.error("Error fetching audit log stats:", err.message);
    res.status(500).json({ error: "Failed to fetch audit log stats" });
  }
});

module.exports = router;
