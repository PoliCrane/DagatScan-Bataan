const pool = require("../db");

/**
 * Records one audit_log row for an admin action. Accepts an optional pg
 * client so callers already inside a transaction can log within the same
 * transaction; otherwise falls back to the shared pool. Never throws — a
 * logging failure must not break the action it's describing, so callers
 * should still fire this after the underlying mutation is already committed.
 */
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
    console.error(`Failed to write audit log entry (${action}):`, err.message);
  }
}

module.exports = { logAction };
