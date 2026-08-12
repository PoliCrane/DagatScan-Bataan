require("dotenv").config();

// Log unhandled rejections/exceptions instead of failing silently.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception — server is exiting:", err);
  process.exit(1);
});
// Log shutdown signals to distinguish a soft stop from a hard kill/crash.
process.on("SIGTERM", () => console.log("[shutdown] received SIGTERM"));
process.on("SIGINT", () => console.log("[shutdown] received SIGINT"));
process.on("exit", (code) => console.log(`[shutdown] process exiting with code ${code}`));

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const {
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
} = require("./email");
const { verifyToken, verifyAdmin, verifySuperadmin } = require("./middleware/auth");
const { uploadRequestLetter } = require("./config/multer");
const { loginLimiter, passwordResetLimiter, accountRequestLimiter } = require("./middleware/rateLimiters");
const { logAction } = require("./services/auditLog");

const app = express();
// Render sits one reverse-proxy hop in front of this app and sets
// X-Forwarded-For — without this, express-rate-limit can't safely trust
// that header to identify real clients and throws on every request.
app.set("trust proxy", 1);
// Render (and most PaaS hosts) assign a dynamic port via this env var and
// only route traffic there — falls back to 5000 for local dev.
const PORT = process.env.PORT || 5000;

// No insecure fallback here on purpose — a silently-guessable default
// would let anyone forge valid tokens if the env var were ever missing.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to backend/.env before starting the server.");
}
const JWT_SECRET = process.env.JWT_SECRET;

// 6-digit numeric code for the password-reset flow (crypto.randomInt is
// cryptographically random, unlike Math.random). Matches the reset UI's
// 6-box digit input in frontend/src/pages/resetpass.jsx.
function generateVerificationCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

// Same 8-char + complexity policy the frontend forms already enforce
// client-side — checked again here so it can't be bypassed by calling the
// API directly.
function meetsPasswordRequirements(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  );
}
const PASSWORD_REQUIREMENTS_MESSAGE =
  "Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character";

// Same regexes as frontend/src/utils/validation.js — re-checked here so
// /request-account can't be bypassed by calling the API directly with a
// malformed email or contact number.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

// Falls back to local dev's Vite port; set FRONTEND_URL in production
// (e.g. your Vercel deployment's URL) — no trailing slash.
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// REQUEST MUNICIPAL ACCOUNT — public; creates a pending account_requests row.
// Admin approves and sets the initial password (see /admin/account-requests/:id/approve).
app.post(
  "/request-account",
  accountRequestLimiter,
  uploadRequestLetter.single("request_letter"),
  (err, req, res, next) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  },
  async (req, res) => {
    try {
      const { username, email, municipality_id, contact_number, position, additional_remarks } = req.body;

      if (!username || !email || !municipality_id || !contact_number || !position) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          error: "Full name, email, municipality, contact number, and position are required",
        });
      }

      if (!EMAIL_REGEX.test(email)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "Please enter a valid email address" });
      }

      if (!PH_MOBILE_REGEX.test(contact_number)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          error: "Contact number must be a valid PH mobile number (e.g. 09171234567 or +639171234567)",
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "A signed request letter (PDF) is required" });
      }

      // Independent checks — run concurrently instead of sequential round trips.
      const [municipality, existingUser, existingRequest] = await Promise.all([
        pool.query("SELECT id FROM municipalities WHERE id = $1", [municipality_id]),
        pool.query("SELECT id FROM users WHERE email = $1 OR username = $2", [email, username]),
        pool.query(
          "SELECT id FROM account_requests WHERE (email = $1 OR username = $2) AND status = 'pending'",
          [email, username]
        ),
      ]);

      if (municipality.rows.length === 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "Invalid municipality" });
      }

      if (existingUser.rows.length > 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "Email or username already exists" });
      }

      if (existingRequest.rows.length > 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "A pending request already exists for this email or username" });
      }

      const newRequest = await pool.query(
        `INSERT INTO account_requests (username, email, municipality_id, contact_number, position, request_letter_filename, additional_remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [username, email, municipality_id, contact_number, position, req.file.filename, additional_remarks || null]
      );

      res.json({
        message: "Account request submitted. An administrator will review it before you can log in.",
        requestId: newRequest.rows[0].id,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Request failed: " + err.message });
    }
  }
);

// LOGIN
app.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const userResult = await pool.query(
      `SELECT u.*, m.name AS municipality_name
       FROM users u
       LEFT JOIN municipalities m ON m.id = u.municipality_id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      logAction(null, {
        actor: { id: null, username: email, roles: "unknown" },
        action: "login_failed_unknown_email",
        category: "auth",
        severity: "normal",
      });
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const user = userResult.rows[0];

    if (!user.active) {
      logAction(null, {
        actor: { id: user.id, username: user.username, roles: user.roles },
        action: "login_denied_deactivated",
        category: "auth",
        severity: "critical",
        targetType: "user",
        targetId: user.id,
      });
      return res.status(403).json({
        error: "This account has been deactivated. Please contact an administrator."
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      logAction(null, {
        actor: { id: user.id, username: user.username, roles: user.roles },
        action: "login_failed_wrong_password",
        category: "auth",
        severity: "normal",
        targetType: "user",
        targetId: user.id,
      });
      return res.status(400).json({ error: "Invalid email or password" });
    }

    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        roles: user.roles,
        municipality_id: user.municipality_id,
        municipality: user.municipality_name,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      username: user.username,
      roles: user.roles,
      municipality_id: user.municipality_id,
      municipality: user.municipality_name,
    });

    logAction(null, {
      actor: { id: user.id, username: user.username, roles: user.roles },
      action: "login_success",
      category: "auth",
      severity: "normal",
      targetType: "user",
      targetId: user.id,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// FORGOT PASSWORD
app.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length > 0) {
      const resetCode = generateVerificationCode();
      const resetExpiry = new Date(Date.now() + 30 * 60 * 1000);

      await sendPasswordResetEmail(email, resetCode);

      await pool.query(
        "UPDATE users SET password_reset_code = $1, password_reset_expiry = $2, reset_attempt_count = 0 WHERE email = $3",
        [resetCode, resetExpiry, email]
      );

      logAction(null, {
        actor: { id: userResult.rows[0].id, username: userResult.rows[0].username, roles: userResult.rows[0].roles },
        action: "password_reset_requested",
        category: "auth",
        severity: "normal",
        targetType: "user",
        targetId: userResult.rows[0].id,
      });
    }

    // Same response whether or not the email is registered, so this
    // endpoint can't be used to enumerate which emails have accounts.
    res.json({ message: "If that email is registered, a password reset code has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process forgot password request", details: err.message });
  }
});

// RESET PASSWORD
app.post("/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Email, reset code, and new password are required" });
    }

    if (!meetsPasswordRequirements(newPassword)) {
      return res.status(400).json({ error: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    // Same generic error for every rejection branch so email registration can't be inferred.
    const genericError = () => res.status(400).json({ error: "Invalid or expired reset code" });

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return genericError();
    }

    const user = userResult.rows[0];

    if (!user.password_reset_code || !user.password_reset_expiry) {
      return genericError();
    }

    if (user.reset_attempt_count >= 5) {
      return res.status(429).json({
        error: "Too many incorrect attempts. Please request a new reset code."
      });
    }

    const codeBuf = Buffer.from(String(resetCode));
    const storedBuf = Buffer.from(String(user.password_reset_code));
    const codeMatches =
      codeBuf.length === storedBuf.length && crypto.timingSafeEqual(codeBuf, storedBuf);

    if (!codeMatches) {
      await pool.query(
        "UPDATE users SET reset_attempt_count = reset_attempt_count + 1 WHERE id = $1",
        [user.id]
      );
      return genericError();
    }

    if (new Date() > new Date(user.password_reset_expiry)) {
      return genericError();
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = $1, password_reset_code = NULL, password_reset_expiry = NULL, reset_attempt_count = 0 WHERE email = $2",
      [hashedPassword, email]
    );

    res.json({ message: "Password reset successfully" });

    logAction(null, {
      actor: { id: user.id, username: user.username, roles: user.roles },
      action: "password_reset_completed",
      category: "auth",
      severity: "normal",
      targetType: "user",
      targetId: user.id,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// CHANGE PASSWORD
app.post("/change-password", verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (!meetsPasswordRequirements(newPassword)) {
      return res.status(400).json({ error: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [hashedNewPassword, userId]
    );

    res.json({ message: "Password changed successfully" });

    logAction(null, {
      actor: req.user,
      action: "password_changed",
      category: "auth",
      severity: "normal",
      targetType: "user",
      targetId: userId,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// GET ALL USERS (Admin + Superadmin)
// Admins see only admin and user accounts; superadmins see all including superadmin accounts
app.get("/admin/users", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    const callerRole = req.user.roles;
    let query, params;

    const baseSelect = `
      SELECT u.id, u.username, u.email, u.roles, u.verified, u.created_at, u.active,
             u.last_login, u.municipality_id, m.name AS municipality
      FROM users u
      LEFT JOIN municipalities m ON m.id = u.municipality_id
    `;

    if (callerRole === "superadmin") {
      query = `${baseSelect} ORDER BY u.created_at DESC`;
      params = [];
    } else {
      // Admins must not see superadmin accounts
      query = `${baseSelect} WHERE u.roles != $1 ORDER BY u.created_at DESC`;
      params = ["superadmin"];
    }

    const users = await pool.query(query, params);
    res.json(users.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// UPDATE USER ROLE
// - Admin can change user <-> admin (but cannot touch superadmins or assign superadmin)
// - Superadmin can change any role including assigning/removing superadmin
app.put("/admin/users/:userId/role", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { roles, municipality_id } = req.body;
    const callerRole = req.user.roles;

    const validRoles = callerRole === "superadmin"
      ? ["municipal", "admin", "superadmin"]
      : ["municipal", "admin"];

    if (!roles || !validRoles.includes(roles)) {
      return res.status(400).json({
        error: `Invalid role. Allowed: ${validRoles.join(", ")}`
      });
    }

    // A municipal account must have a municipality; every other role isn't
    // tied to one. Keeps municipality_id consistent with the NEW role
    // instead of leaving it stale from before the change (unlike /edit's
    // COALESCE, which can only set a new value or keep the old one — it
    // can't clear this field, so that logic has to live here).
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

    // Fetch target user
    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Non-superadmin admins cannot manage superadmin accounts
    if (callerRole !== "superadmin" && targetUser.rows[0].roles === "superadmin") {
      return res.status(403).json({ error: "Access denied. Cannot manage a Superadmin account." });
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
    console.error(err.message);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// DEACTIVATE USER
app.patch("/admin/users/:userId/deactivate", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const callerRole = req.user.roles;

    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }

    // Fetch target user
    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found or already deactivated" });
    }

    // Non-superadmin admins cannot deactivate superadmin accounts
    if (callerRole !== "superadmin" && targetUser.rows[0].roles === "superadmin") {
      return res.status(403).json({ error: "Access denied. Cannot deactivate a Superadmin account." });
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
      console.error(`Failed to send account-deactivated email to ${result.rows[0].email}:`, err.message);
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
    console.error("Deactivate user error:", err.message);
    res.status(500).json({ error: "Failed to deactivate user: " + err.message });
  }
});

// REACTIVATE USER
app.patch("/admin/users/:userId/reactivate", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const callerRole = req.user.roles;

    // Fetch target user
    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found or already active" });
    }

    // Non-superadmin admins cannot reactivate superadmin accounts
    if (callerRole !== "superadmin" && targetUser.rows[0].roles === "superadmin") {
      return res.status(403).json({ error: "Access denied. Cannot reactivate a Superadmin account." });
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
      console.error(`Failed to send account-reactivated email to ${result.rows[0].email}:`, err.message);
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
    console.error("Reactivate user error:", err.message);
    res.status(500).json({ error: "Failed to reactivate user: " + err.message });
  }
});

// CREATE USER — Superadmin only
app.post("/admin/create-user", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    const { username, email, password, roles } = req.body;
    const callerRole = req.user.roles;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    if (!meetsPasswordRequirements(password)) {
      return res.status(400).json({ error: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    // Determine allowed roles based on caller's role
    const allowedRoles = callerRole === "superadmin"
      ? ["municipal", "admin", "superadmin"]
      : ["municipal", "admin"];

    if (!roles || !allowedRoles.includes(roles)) {
      return res.status(400).json({
        error: `Invalid or missing role. Allowed: ${allowedRoles.join(", ")}`
      });
    }
    const userRole = roles;

    // Municipality lookup and existing-user check are independent — run concurrently.
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
    console.error(err.message);
    res.status(500).json({ error: "Failed to create user account" });
  }
});

// EDIT USER - Admin edits username, and municipality for municipal accounts
app.put("/admin/users/:userId/edit", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { username } = req.body;
    const callerRole = req.user.roles;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    // Fetch target user
    const targetUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Non-superadmin admins cannot edit superadmin accounts
    if (callerRole !== "superadmin" && targetUser.rows[0].roles === "superadmin") {
      return res.status(403).json({ error: "Access denied. Cannot edit a Superadmin account." });
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
    console.error(err.message);
    res.status(500).json({ error: "Failed to update user information" });
  }
});

// LIST ACCOUNT REQUESTS (Admin + Superadmin) — pending by default, or ?status=all/approved/rejected
app.get("/admin/account-requests", verifyToken, verifySuperadmin, async (req, res) => {
  try {
    // Defaults to pending-only (the review queue); ?status=all/approved/rejected for the rest.
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
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch account requests" });
  }
});

// APPROVE ACCOUNT REQUEST — creates the real users row; admin sets the password here.
app.post("/admin/account-requests/:id/approve", verifyToken, verifySuperadmin, async (req, res) => {
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

    // Fire-and-forget — a slow/failed email must not block the response or undo the approval.
    sendAccountApprovedEmail(request.email, request.username, password, request.municipality_name).catch((err) => {
      console.error(`Failed to send account-approved email to ${request.email}:`, err.message);
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
    console.error(err.message);
    res.status(500).json({ error: "Failed to approve request" });
  } finally {
    client.release();
  }
});

// REJECT ACCOUNT REQUEST
app.post("/admin/account-requests/:id/reject", verifyToken, verifySuperadmin, async (req, res) => {
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
    console.error(err.message);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

// Import and use API routes
const shorelineDataRouter = require("./routes/shorelineData");
const uploadManagementRouter = require("./routes/uploadManagement");
const ndwiGenerationRouter = require("./routes/ndwiGeneration");
const reportsRouter = require("./routes/reports");
const auditLogRouter = require("./routes/auditLog");

app.use("/api/shoreline", shorelineDataRouter);
// Upload management is admin-only; verifyToken/verifyAdmin required here since
// mounting auth on the bare "/api" would also block unauthenticated /api/reports and /api/health.
app.use("/api/admin/uploads", verifyToken, verifyAdmin, uploadManagementRouter);
app.use("/api", ndwiGenerationRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin/audit-logs", verifyToken, verifySuperadmin, auditLogRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "API Running", timestamp: new Date() });
});

const httpServer = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // CNN detection runs in its own child process (cnnDetectionPool.js) so
  // its ~30s-per-image model.fit can't block this process's event loop —
  // spawned here to warm up before the first real upload, same as the old
  // in-process initCNNModel() pre-warm did.
  const { initCNNDetectionPool } = require('./services/cnnDetectionPool');
  initCNNDetectionPool();

  // Uploaded files (GeoJSON/satellite images/request letters) get mirrored
  // to Supabase Storage on a timer rather than inline during upload — see
  // services/storageSync.js for why. Skipped entirely when Supabase isn't
  // configured (e.g. local dev without those env vars set).
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { syncPendingFilesToStorage } = require('./services/storageSync');
    const SYNC_INTERVAL_MS = 5 * 60 * 1000;
    setTimeout(() => {
      syncPendingFilesToStorage().catch(err => console.error('[storageSync] Initial sync failed:', err.message));
      setInterval(() => {
        syncPendingFilesToStorage().catch(err => console.error('[storageSync] Sync failed:', err.message));
      }, SYNC_INTERVAL_MS);
    }, 10000);
  }

  // Purges finished ndwi_batch_jobs rows older than 30 days — see
  // services/ndwiBatchCleanup.js for why this exists.
  const { purgeStaleNdwiBatchJobs } = require('./services/ndwiBatchCleanup');
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
    purgeStaleNdwiBatchJobs().catch(err => console.error('[ndwiBatchCleanup] Initial purge failed:', err.message));
    setInterval(() => {
      purgeStaleNdwiBatchJobs().catch(err => console.error('[ndwiBatchCleanup] Purge failed:', err.message));
    }, CLEANUP_INTERVAL_MS);
  }, 15000);
});

// Satellite uploads run CNN training synchronously (~10 min, pure-JS CPU backend);
// disable Node's default timeouts so they don't abort mid-training.
httpServer.requestTimeout = 0;
httpServer.headersTimeout = 0;
httpServer.timeout = 0;

// Keep-alive: tfjs-node's native binding can drop the event-loop ref count after
// startup, letting the process exit; an un-refed interval prevents that.
httpServer.on("close", () => console.error("[server] httpServer closed unexpectedly"));
setInterval(() => {}, 60_000);
