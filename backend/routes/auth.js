const logger = require("../utils/logger");
const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { sendPasswordResetEmail } = require("../email");
const { verifyToken } = require("../middleware/auth");
const { uploadRequestLetter } = require("../config/multer");
const { loginLimiter, passwordResetLimiter, accountRequestLimiter } = require("../middleware/rateLimiters");
const { logAction } = require("../services/auditLog");
const { validate, schemas } = require("../middleware/validate");
const { scheduleSync } = require("../services/storageSync");
const {
  meetsPasswordRequirements,
  PASSWORD_REQUIREMENTS_MESSAGE,
  EMAIL_REGEX,
  PH_MOBILE_REGEX,
  USERNAME_REGEX,
  USERNAME_REQUIREMENTS_MESSAGE,
} = require("../utils/validators");

const JWT_SECRET = process.env.JWT_SECRET;

const router = express.Router();

// 6-digit reset code; crypto.randomInt is cryptographically random, unlike Math.random
function generateVerificationCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

// REQUEST MUNICIPAL ACCOUNT — public; creates a pending account_requests row.
// Admin approves and sets the initial password (see /admin/account-requests/:id/approve).
router.post(
  "/request-account",
  accountRequestLimiter,
  uploadRequestLetter.single("request_letter"),
  (err, req, res, next) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  },
  async (req, res) => {
    const cleanupFile = () => {
      if (req.file) fs.unlink(req.file.path, () => {});
    };
    try {
      const { username, email, municipality_id, contact_number, position, additional_remarks } = req.body;

      if (!username || !email || !municipality_id || !contact_number || !position) {
        cleanupFile();
        return res.status(400).json({
          error: "Full name, email, municipality, contact number, and position are required",
        });
      }

      if (!USERNAME_REGEX.test(username)) {
        cleanupFile();
        return res.status(400).json({ error: USERNAME_REQUIREMENTS_MESSAGE });
      }

      if (!EMAIL_REGEX.test(email)) {
        cleanupFile();
        return res.status(400).json({ error: "Please enter a valid email address" });
      }

      if (!PH_MOBILE_REGEX.test(contact_number)) {
        cleanupFile();
        return res.status(400).json({
          error: "Contact number must be a valid PH mobile number (e.g. 09171234567 or +639171234567)",
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "A signed request letter (PDF) is required" });
      }

      const header = Buffer.alloc(5);
      const fd = fs.openSync(req.file.path, "r");
      fs.readSync(fd, header, 0, 5, 0);
      fs.closeSync(fd);
      if (header.toString("latin1") !== "%PDF-") {
        cleanupFile();
        return res.status(400).json({ error: "The request letter must be a valid PDF file" });
      }

      // independent checks, run concurrently
      const [municipality, existingUser, existingRequest] = await Promise.all([
        pool.query("SELECT id FROM municipalities WHERE id = $1", [municipality_id]),
        pool.query("SELECT id FROM users WHERE email = $1 OR username = $2", [email, username]),
        pool.query(
          "SELECT id FROM account_requests WHERE (email = $1 OR username = $2) AND status = 'pending'",
          [email, username]
        ),
      ]);

      if (municipality.rows.length === 0) {
        cleanupFile();
        return res.status(400).json({ error: "Invalid municipality" });
      }

      if (existingUser.rows.length > 0) {
        cleanupFile();
        return res.status(400).json({ error: "Email or username already exists" });
      }

      if (existingRequest.rows.length > 0) {
        cleanupFile();
        return res.status(400).json({ error: "A pending request already exists for this email or username" });
      }

      const newRequest = await pool.query(
        `INSERT INTO account_requests (username, email, municipality_id, contact_number, position, request_letter_filename, additional_remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [username, email, municipality_id, contact_number, position, req.file.filename, additional_remarks || null]
      );

      scheduleSync();
      res.json({
        message: "Account request submitted. An administrator will review it before you can log in.",
        requestId: newRequest.rows[0].id,
      });
    } catch (err) {
      cleanupFile();
      logger.error("Account request error:", err.message);
      res.status(500).json({ error: "Request failed" });
    }
  }
);

// LOGIN
router.post("/login", loginLimiter, validate(schemas.login), async (req, res) => {
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
      // Same message and status as every other login failure below — a distinct
      // message/status here would let someone probe which emails exist in the
      // system and are deactivated, before ever getting the password right.
      return res.status(400).json({ error: "Invalid email or password" });
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
    logger.error(err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", passwordResetLimiter, validate(schemas.forgotPassword), async (req, res) => {
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

    // same response either way, prevents email enumeration
    res.json({ message: "If that email is registered, a password reset code has been sent." });
  } catch (err) {
    logger.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process forgot password request" });
  }
});

// RESET PASSWORD
router.post("/reset-password", passwordResetLimiter, validate(schemas.resetPassword), async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Email, reset code, and new password are required" });
    }

    if (!meetsPasswordRequirements(newPassword)) {
      return res.status(400).json({ error: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    // same generic error for every branch, prevents email enumeration
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
    logger.error(err.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// CHANGE PASSWORD
router.post("/change-password", verifyToken, validate(schemas.changePassword), async (req, res) => {
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
    logger.error(err.message);
    res.status(500).json({ error: "Failed to change password" });
  }
});

module.exports = router;
