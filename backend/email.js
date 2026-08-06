const nodemailer = require("nodemailer");

require("dotenv").config();

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("Warning: EMAIL_USER or EMAIL_PASS not set in environment variables");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS?.replace(/\s/g, '') || ""
  },
  // Render's network can't route IPv6, but Node may still resolve
  // smtp.gmail.com to an AAAA record first; force IPv4.
  family: 4
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.log("Email service error:", error);
  } else {
    console.log("Email service ready");
  }
});

const sendPasswordResetEmail = async (email, resetCode) => {
  try {
    const mailOptions = {
      from: `"DagatScan Bataan" <${process.env.EMAIL_USER}>`,
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
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    throw error;
  }
};

const sendAccountApprovedEmail = async (email, username, password, municipalityName) => {
  try {
    const mailOptions = {
      from: `"DagatScan Bataan" <${process.env.EMAIL_USER}>`,
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
    };

    await transporter.sendMail(mailOptions);
    console.log(`Account approved email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send account approved email:", error);
    throw error;
  }
};

const sendAccountDeactivatedEmail = async (email, username) => {
  try {
    const mailOptions = {
      from: `"DagatScan Bataan" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your DagatScan Bataan account has been deactivated",
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Account Deactivated</h2>
          <p>Hi ${username}, your DagatScan Bataan account has been deactivated. You will not be able to log in until it's reactivated.</p>
          <p style="color: #666;">If you believe this is a mistake, please contact your DENR-Bataan administrator.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Account deactivated email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send account deactivated email:", error);
    throw error;
  }
};

const sendAccountReactivatedEmail = async (email, username) => {
  try {
    const mailOptions = {
      from: `"DagatScan Bataan" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your DagatScan Bataan account has been reactivated",
      html: `
        <div style="font-family: Poppins, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0077B6;">Account Reactivated</h2>
          <p>Hi ${username}, your DagatScan Bataan account has been reactivated. You can now log in again.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Account reactivated email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send account reactivated email:", error);
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendAccountApprovedEmail,
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
};
