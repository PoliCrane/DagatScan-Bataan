require("dotenv").config();

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

const sendPasswordResetEmail = async (email, resetCode) => {
  try {
    await sendViaBrevo({
      to: email,
      subject: "Reset your password for DagatScan Bataan",
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Reset Your Password</h2>
          <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="font-size: 14px; margin: 0 0 10px 0;">Your password reset code is:</p>
            <p style="font-size: 32px; font-weight: bold; color: #0077B6; margin: 0; letter-spacing: 5px;">${resetCode}</p>
          </div>

          <p style="color: #666;">This code will expire in 30 minutes.</p>
          <p style="color: #999; font-size: 12px;">For security, never share this code with anyone.</p>
        </div>
      `
    });
    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    throw error;
  }
};

const sendAccountApprovedEmail = async (email, username, password, municipalityName) => {
  try {
    await sendViaBrevo({
      to: email,
      subject: "Your DagatScan Bataan account has been approved",
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Account Approved</h2>
          <p>Your DagatScan Bataan account request${municipalityName ? ` for ${municipalityName}` : ""} has been approved. You can now log in with the credentials below.</p>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="font-size: 14px; margin: 0 0 10px 0;">Username:</p>
            <p style="font-size: 18px; font-weight: bold; color: #0077B6; margin: 0 0 15px 0;">${username}</p>
            <p style="font-size: 14px; margin: 0 0 10px 0;">Password:</p>
            <p style="font-size: 18px; font-weight: bold; color: #0077B6; margin: 0;">${password}</p>
          </div>

          <p style="color: #666;">For security, please log in and change your password as soon as possible.</p>
          <p style="color: #999; font-size: 12px;">For security, never share this password with anyone.</p>
        </div>
      `
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
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Account Deactivated</h2>
          <p>Hi ${username}, your DagatScan Bataan account has been deactivated. You will not be able to log in until it's reactivated.</p>
          <p style="color: #666;">If you believe this is a mistake, please contact your DENR-Bataan administrator.</p>
        </div>
      `
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
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Account Reactivated</h2>
          <p>Hi ${username}, your DagatScan Bataan account has been reactivated. You can now log in again.</p>
        </div>
      `
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
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Database Backup Failed</h2>
          <p>The scheduled daily database backup did not complete successfully.</p>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="font-size: 14px; margin: 0 0 10px 0;">Error:</p>
            <p style="font-size: 14px; color: #a70000; margin: 0; font-family: monospace;">${errorMessage}</p>
          </div>

          <p style="color: #666;">Check the GitHub Actions run history for the full log, and confirm the next scheduled backup succeeds.</p>
        </div>
      `
    });
    console.log(`Backup failure alert sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Failed to send backup failure alert:", error);
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
  sendBackupFailureEmail,
};
