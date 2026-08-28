const logger = require("../utils/logger");
const pool = require("../db");

// Records one audit_log row. Pass a pg client to log inside an existing transaction.
// Never throws - a logging failure shouldn't break the action being logged.
async function logAction(client, { actor, action, category, severity = "normal", targetType, targetId, details }) {
  try {
    await (client || pool).query(
      `INSERT INTO audit_log (actor_id, actor_username, actor_role, action, category, severity, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actor.id,
        actor.username,
        actor.roles,
        action,
        category,
        severity,
        targetType || null,
        targetId !== undefined && targetId !== null ? String(targetId) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    logger.error(`Failed to write audit log entry (${action}):`, err.message);
  }
}

module.exports = { logAction };
