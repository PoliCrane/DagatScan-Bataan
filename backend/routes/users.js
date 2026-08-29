const logger = require("../utils/logger");
const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { getPrivateSignedUrl } = require("../services/supabaseStorage");
const {
  sendAccountApprovedEmail,
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
} = require("../email");
const { logAction } = require("../services/auditLog");
const { validate, schemas } = require("../middleware/validate");
const {
  meetsPasswordRequirements,
  PASSWORD_REQUIREMENTS_MESSAGE,
  USERNAME_REGEX,
  USERNAME_REQUIREMENTS_MESSAGE,
} = require("../utils/validators");

// Mounted behind verifyToken + verifySuperadmin (server.js) — every route here is superadmin-only.
const router = express.Router();

const VALID_ROLES = ["municipal", "admin", "superadmin"];

// GET ALL USERS
router.get("/users", async (req, res) => {
  try {
    const users = await pool.query(`
      SELECT u.id, u.username, u.email, u.roles, u.verified, u.created_at, u.active,
             u.last_login, u.municipality_id, m.name AS municipality
      FROM users u
      LEFT JOIN municipalities m ON m.id = u.municipality_id
      ORDER BY u.created_at DESC
    `);
    res.json(users.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// UPDATE USER ROLE
router.put("/users/:userId/role", validate(schemas.roleUpdate), async (req, res) => {
  try {
    const { userId } = req.params;
    const { roles, municipality_id } = req.body;

    if (!roles || !VALID_ROLES.includes(roles)) {
      return res.status(400).json({
        error: `Invalid role. Allowed: ${VALID_ROLES.join(", ")}`
      });
    }

    // clears municipality_id for non-municipal roles instead of leaving it stale
    let resolvedMunicipalityId = null;
    if (roles === "municipal") {
      if (!municipality_id) {
        return res.status(400).json({ error: "municipality_id is required when assigning the municipal role" });
      }
      const municipality = await pool.query("SELECT id FROM municipalities WHERE id = $1", [municipality_id]);
      if (municipality.rows.length === 0) {
        return res.status(400).json({ error: "Invalid municipality_id" });
      }
      resolvedMunicipalityId = municipality.rows[0].id;
    }

    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await pool.query(
      "UPDATE users SET roles = $1, municipality_id = $2 WHERE id = $3 RETURNING id, username, email, roles, municipality_id",
      [roles, resolvedMunicipalityId, userId]
    );

    res.json({ message: "User role updated successfully", user: result.rows[0] });

    logAction(null, {
      actor: req.user,
      action: "role_changed",
      category: "user",
      severity: ["admin", "superadmin"].includes(roles) ? "critical" : "normal",
      targetType: "user",
      targetId: userId,
      details: { username: targetUser.rows[0].username, from_role: targetUser.rows[0].roles, to_role: roles },
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// DEACTIVATE USER
router.patch("/users/:userId/deactivate", async (req, res) => {
  try {
    const { userId } = req.params;

    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }

    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found or already deactivated" });
    }

    const result = await pool.query(
      "UPDATE users SET active = false WHERE id = $1 AND active = true RETURNING id, username, email",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found or already deactivated" });
    }

    res.json({ message: "User deactivated successfully", user: result.rows[0] });

    sendAccountDeactivatedEmail(result.rows[0].email, result.rows[0].username).catch((err) => {
      logger.error(`Failed to send account-deactivated email to ${result.rows[0].email}:`, err.message);
    });

    logAction(null, {
      actor: req.user,
      action: "user_deactivated",
      category: "user",
      severity: "critical",
      targetType: "user",
      targetId: userId,
      details: { username: result.rows[0].username },
    });
  } catch (err) {
    logger.error("Deactivate user error:", err.message);
    res.status(500).json({ error: "Failed to deactivate user" });
  }
});

// REACTIVATE USER
router.patch("/users/:userId/reactivate", async (req, res) => {
  try {
    const { userId } = req.params;

    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found or already active" });
    }

    const result = await pool.query(
      "UPDATE users SET active = true WHERE id = $1 AND active = false RETURNING id, username, email",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found or already active" });
    }

    res.json({ message: "User reactivated successfully", user: result.rows[0] });

    sendAccountReactivatedEmail(result.rows[0].email, result.rows[0].username).catch((err) => {
      logger.error(`Failed to send account-reactivated email to ${result.rows[0].email}:`, err.message);
    });

    logAction(null, {
      actor: req.user,
      action: "user_reactivated",
      category: "user",
      severity: "normal",
      targetType: "user",
      targetId: userId,
      details: { username: result.rows[0].username },
    });
  } catch (err) {
    logger.error("Reactivate user error:", err.message);
    res.status(500).json({ error: "Failed to reactivate user" });
  }
});

// CREATE USER
router.post("/create-user", validate(schemas.createUser), async (req, res) => {
  try {
    const { username, email, password, roles } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: USERNAME_REQUIREMENTS_MESSAGE });
    }

    if (!meetsPasswordRequirements(password)) {
      return res.status(400).json({ error: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    if (!roles || !VALID_ROLES.includes(roles)) {
      return res.status(400).json({
        error: `Invalid or missing role. Allowed: ${VALID_ROLES.join(", ")}`
      });
    }
    const userRole = roles;

    // independent checks, run concurrently
    let municipalityId = null;
    if (userRole === "municipal" && !req.body.municipality_id) {
      return res.status(400).json({ error: "municipality_id is required for a municipal account" });
    }

    const [municipality, existingUser] = await Promise.all([
      userRole === "municipal"
        ? pool.query("SELECT id FROM municipalities WHERE id = $1", [req.body.municipality_id])
        : Promise.resolve(null),
      pool.query("SELECT * FROM users WHERE email = $1 OR username = $2", [email, username]),
    ]);

    if (userRole === "municipal") {
      if (municipality.rows.length === 0) {
        return res.status(400).json({ error: "Invalid municipality_id" });
      }
      municipalityId = municipality.rows[0].id;
    }

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email or username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      "INSERT INTO users (username, email, password_hash, roles, verified, municipality_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, email, roles, municipality_id",
      [username, email, hashedPassword, userRole, true, municipalityId]
    );

    res.json({
      message: "User account created successfully",
      user: newUser.rows[0]
    });

    logAction(null, {
      actor: req.user,
      action: "user_created",
      category: "user",
      severity: "normal",
      targetType: "user",
      targetId: newUser.rows[0].id,
      details: { username, email, role: userRole },
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Failed to create user account" });
  }
});

// EDIT USER - username, and municipality for municipal accounts
router.put("/users/:userId/edit", async (req, res) => {
  try {
    const { userId } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: USERNAME_REQUIREMENTS_MESSAGE });
    }

    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const usernameExists = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND id != $2",
      [username, userId]
    );

    if (usernameExists.rows.length > 0) {
      return res.status(400).json({ error: "Username is already taken" });
    }

    // Only meaningful for municipal accounts; COALESCE keeps the existing value otherwise.
    let municipalityId;
    if (targetUser.rows[0].roles === "municipal" && req.body.municipality_id !== undefined) {
      const municipality = await pool.query("SELECT id FROM municipalities WHERE id = $1", [req.body.municipality_id]);
      if (municipality.rows.length === 0) {
        return res.status(400).json({ error: "Invalid municipality_id" });
      }
      municipalityId = municipality.rows[0].id;
    }

    const updatedUser = await pool.query(
      "UPDATE users SET username = $1, municipality_id = COALESCE($3, municipality_id) WHERE id = $2 RETURNING id, username, email, roles, verified, municipality_id",
      [username, userId, municipalityId ?? null]
    );

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "User information updated successfully",
      user: updatedUser.rows[0]
    });

    logAction(null, {
      actor: req.user,
      action: "user_edited",
      category: "user",
      severity: "normal",
      targetType: "user",
      targetId: userId,
      details: { old_username: targetUser.rows[0].username, new_username: username },
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Failed to update user information" });
  }
});

// LIST ACCOUNT REQUESTS — pending by default, or ?status=all/approved/rejected
router.get("/account-requests", async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const query = `
      SELECT ar.id, ar.username, ar.email, ar.municipality_id, m.name AS municipality,
             ar.contact_number, ar.position, ar.request_letter_filename, ar.request_letter_url, ar.additional_remarks,
             ar.status, ar.requested_at, ar.reviewed_by, ar.reviewed_at, ar.rejection_reason,
             reviewer.username AS reviewed_by_username
      FROM account_requests ar
      JOIN municipalities m ON m.id = ar.municipality_id
      LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
      WHERE $1::text IS NULL OR ar.status = $1
      ORDER BY ar.requested_at DESC
    `;
    const result = await pool.query(query, [status === "all" ? null : status]);
    res.json(result.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Failed to fetch account requests" });
  }
});

// VIEW REQUEST LETTER — streams the local PDF, or redirects to a short-lived signed URL
// when the file only exists in the private storage bucket.
router.get("/account-requests/:id/letter", async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: "Invalid request id" });
    }

    const result = await pool.query(
      "SELECT request_letter_filename, request_letter_url FROM account_requests WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    const { request_letter_filename: filename, request_letter_url: storagePath } = result.rows[0];
    if (!filename && !storagePath) {
      return res.status(404).json({ error: "No request letter on file" });
    }

    if (filename) {
      const localPath = path.join(__dirname, "../uploads/request-letters", path.basename(filename));
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
    }

    if (storagePath && !storagePath.startsWith("http")) {
      const signedUrl = await getPrivateSignedUrl(storagePath, 60);
      return res.redirect(signedUrl);
    }

    // Legacy rows from before request letters moved to the private bucket store a full
    // public-bucket URL directly — just redirect to it.
    if (storagePath && storagePath.startsWith("http")) {
      return res.redirect(storagePath);
    }

    res.status(404).json({ error: "Request letter file is not available" });
  } catch (err) {
    logger.error("Failed to serve request letter:", err.message);
    res.status(500).json({ error: "Failed to load request letter" });
  }
});

// APPROVE ACCOUNT REQUEST — creates the real users row; admin sets the password here.
router.post("/account-requests/:id/approve", validate(schemas.approveRequest), async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "A password for the new account is required" });
  }
  if (!meetsPasswordRequirements(password)) {
    return res.status(400).json({ error: PASSWORD_REQUIREMENTS_MESSAGE });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const requestResult = await client.query(
      `SELECT ar.*, m.name AS municipality_name
       FROM account_requests ar
       JOIN municipalities m ON m.id = ar.municipality_id
       WHERE ar.id = $1 FOR UPDATE OF ar`,
      [req.params.id]
    );
    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request not found" });
    }
    const request = requestResult.rows[0];
    if (request.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Request has already been ${request.status}` });
    }

    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [request.email, request.username]
    );
    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Email or username already exists as an account" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await client.query(
      `INSERT INTO users (username, email, password_hash, roles, verified, municipality_id, contact_number, position)
       VALUES ($1, $2, $3, 'municipal', true, $4, $5, $6)
       RETURNING id, username, email, roles, municipality_id`,
      [request.username, request.email, hashedPassword, request.municipality_id, request.contact_number, request.position]
    );

    await client.query(
      "UPDATE account_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2",
      [req.user.id, request.id]
    );

    await client.query("COMMIT");
    res.json({ message: "Request approved and account created", user: newUser.rows[0] });

    // fire-and-forget — a slow/failed email shouldn't block the response
    sendAccountApprovedEmail(request.email, request.username, request.municipality_name).catch((err) => {
      logger.error(`Failed to send account-approved email to ${request.email}:`, err.message);
    });

    logAction(null, {
      actor: req.user,
      action: "account_request_approved",
      category: "user",
      severity: "normal",
      targetType: "account_request",
      targetId: request.id,
      details: { username: request.username, email: request.email, municipality: request.municipality_name },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(err.message);
    res.status(500).json({ error: "Failed to approve request" });
  } finally {
    client.release();
  }
});

// REJECT ACCOUNT REQUEST
router.post("/account-requests/:id/reject", validate(schemas.rejectRequest), async (req, res) => {
  try {
    const { reason } = req.body;

    const updated = await pool.query(
      `UPDATE account_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING id, username, email`,
      [req.user.id, reason || null, req.params.id]
    );

    if (updated.rows.length === 0) {
      return res.status(400).json({ error: "Request not found or already reviewed" });
    }

    res.json({ message: "Request rejected" });

    logAction(null, {
      actor: req.user,
      action: "account_request_rejected",
      category: "user",
      severity: "normal",
      targetType: "account_request",
      targetId: updated.rows[0].id,
      details: { username: updated.rows[0].username, email: updated.rows[0].email, reason: reason || null },
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

module.exports = router;
