require("dotenv").config();
const { escapeHtml } = require("./utils/validators");

// Render's free tier blocks all outbound SMTP traffic (ports 25/465/587),
// so email can't go through Gmail's SMTP server from there. Brevo's
// transactional email API sends over HTTPS instead, which isn't blocked.
if (!process.env.BREVO_API_KEY || !process.env.EMAIL_USER) {
  console.warn("Warning: BREVO_API_KEY or EMAIL_USER not set in environment variables");
} else {
  console.log("Email service ready (Brevo)");
}

const sendViaBrevo = async ({ to, subject, html }) => {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      sender: { name: "DagatScan Bataan", email: process.env.EMAIL_USER },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorBody}`);
  }
};

// Shared wrapper so every message gets the same styling and all dynamic values
// pass through escapeHtml at the call sites below.
const emailTemplate = (heading, bodyHtml) => `
  <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #0077B6;">${heading}</h2>
    ${bodyHtml}
  </div>
`;

const sendPasswordResetEmail = async (email, resetCode) => {
  try {
    await sendViaBrevo({
      to: email,
      subject: "Reset your password for DagatScan Bataan",
      html: emailTemplate(
        "Reset Your Password",
        `
        <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="font-size: 14px; margin: 0 0 10px 0;">Your password reset code is:</p>
          <p style="font-size: 32px; font-weight: bold; color: #0077B6; margin: 0; letter-spacing: 5px;">${escapeHtml(resetCode)}</p>
        </div>

        <p style="color: #666;">This code will expire in 30 minutes.</p>
        <p style="color: #999; font-size: 12px;">For security, never share this code with anyone.</p>
        `
      )
    });
    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    throw error;
  }
};

const sendAccountApprovedEmail = async (email, username, municipalityName) => {
  try {
    await sendViaBrevo({
      to: email,
      subject: "Your DagatScan Bataan account has been approved",
      html: emailTemplate(
        "Account Approved",
        `
        <p>Your DagatScan Bataan account request${municipalityName ? ` for ${escapeHtml(municipalityName)}` : ""} has been approved.</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="font-size: 14px; margin: 0 0 10px 0;">Username:</p>
          <p style="font-size: 18px; font-weight: bold; color: #0077B6; margin: 0;">${escapeHtml(username)}</p>
        </div>

        <p>Your administrator will provide your initial password separately. If you do not receive it, use the <strong>Forgot Password</strong> option on the login page with this email address to set your own password.</p>
        <p style="color: #999; font-size: 12px;">For security, never share your password with anyone, and change it after your first login.</p>
        `
      )
    });
    console.log(`Account approved email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send account approved email:", error);
    throw error;
  }
};

const sendAccountDeactivatedEmail = async (email, username) => {
  try {
    await sendViaBrevo({
      to: email,
      subject: "Your DagatScan Bataan account has been deactivated",
      html: emailTemplate(
        "Account Deactivated",
        `
        <p>Hi ${escapeHtml(username)}, your DagatScan Bataan account has been deactivated. You will not be able to log in until it's reactivated.</p>
        <p style="color: #666;">If you believe this is a mistake, please contact your DENR-Bataan administrator.</p>
        `
      )
    });
    console.log(`Account deactivated email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send account deactivated email:", error);
    throw error;
  }
};

const sendAccountReactivatedEmail = async (email, username) => {
  try {
    await sendViaBrevo({
      to: email,
      subject: "Your DagatScan Bataan account has been reactivated",
      html: emailTemplate(
        "Account Reactivated",
        `
        <p>Hi ${escapeHtml(username)}, your DagatScan Bataan account has been reactivated. You can now log in again.</p>
        `
      )
    });
    console.log(`Account reactivated email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send account reactivated email:", error);
    throw error;
  }
};

const sendBackupFailureEmail = async (errorMessage) => {
  const to = process.env.BACKUP_ALERT_EMAIL || process.env.EMAIL_USER;
  try {
    await sendViaBrevo({
      to,
      subject: "DagatScan Bataan — daily database backup failed",
      html: emailTemplate(
        "Database Backup Failed",
        `
        <p>The scheduled daily database backup did not complete successfully.</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="font-size: 14px; margin: 0 0 10px 0;">Error:</p>
          <p style="font-size: 14px; color: #a70000; margin: 0; font-family: monospace;">${escapeHtml(errorMessage)}</p>
        </div>

        <p style="color: #666;">Check the GitHub Actions run history for the full log, and confirm the next scheduled backup succeeds.</p>
        `
      )
    });
    console.log(`Backup failure alert sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Failed to send backup failure alert:", error);
    throw error;
  }
};

const RISK_ORDER = ["VERY_LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH"];

const sendRiskEscalationEmail = async (email, municipalityName, changes) => {
  const rows = changes
    .map(
      (ch) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;">${escapeHtml(ch.areaName)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;">${escapeHtml(ch.from || "—")}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-weight:bold;color:#a70000;">${escapeHtml(ch.to)}</td></tr>`
    )
    .join("");
  try {
    await sendViaBrevo({
      to: email,
      subject: `Coastal risk level increased in ${municipalityName} — DagatScan Bataan`,
      html: emailTemplate(
        "Risk Level Escalation",
        `
        <p>New shoreline data for <strong>${escapeHtml(municipalityName)}</strong> moved the following coastal areas to a higher risk tier:</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;">Area</th><th style="padding:6px 10px;text-align:left;">Previous</th><th style="padding:6px 10px;text-align:left;">New</th></tr>
          ${rows}
        </table>
        <p>Open the DagatScan Bataan dashboard for the updated analysis and validation figures.</p>
        <p style="color:#999;font-size:12px;">You receive this because your account is assigned to ${escapeHtml(municipalityName)}.</p>
        `
      ),
    });
    console.log(`Risk escalation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send risk escalation email:", error);
    throw error;
  }
};

module.exports = {
  RISK_ORDER,
  sendRiskEscalationEmail,
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
  sendBackupFailureEmail,
};
