import { useState } from "react";
import "../pages/styles/changePasswordModal.css";
import { showSuccess, showError, showLoading } from "../utils/sweetAlertUtils";

import { API_BASE_URL } from "../config/api";
export default function ChangePasswordModal({ isOpen, onClose, username }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandPassword, setExpandPassword] = useState(false);

  // Password validation requirements
  const passwordRequirements = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)
  };

  const handleSave = async () => {
    setError("");

    // Validation
    if (!currentPassword.trim()) {
      setError("Current password is required");
      return;
    }
    if (!newPassword.trim()) {
      setError("New password is required");
      return;
    }
    if (!confirmPassword.trim()) {
      setError("Confirm password is required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    setLoading(true);

    // Show loading dialog
    await showLoading("Changing password...", 2000);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        await showError(data.error || data.message || "Failed to change password");
        setError(data.error || data.message || "Failed to change password");
        return;
      }

      await showSuccess("Password changed successfully!");
      handleCancel();
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError("");
    onClose();
  };

  return (
    <>
      {isOpen && <div className="modal-overlay" onClick={handleCancel}></div>}
      <div className={`change-password-modal ${isOpen ? "open" : ""}`}>
        <div className="modal-header">
          <h3>Change Password</h3>
          <button className="close-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="current-password">Current Password:</label>
            <div className="password-input-wrapper">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="password-input"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                <img
                  src={showCurrentPassword ? "/hide.png" : "/view.png"}
                  alt={showCurrentPassword ? "Hide" : "Show"}
                  className="toggle-icon"
                />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="new-password">New Password:</label>
            <div className="password-input-wrapper">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onFocus={() => setExpandPassword(true)}
                onBlur={() => setExpandPassword(false)}
                placeholder="Enter new password"
                className="password-input"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                <img
                  src={showNewPassword ? "/hide.png" : "/view.png"}
                  alt={showNewPassword ? "Hide" : "Show"}
                  className="toggle-icon"
                />
              </button>
            </div>
            {expandPassword && (
              <div className="password-requirements">
                <div className={`requirement ${passwordRequirements.minLength ? "met" : ""}`}>
                  <span className="requirement-icon">{passwordRequirements.minLength ? "✓" : "○"}</span>
                  At least 8 characters
                </div>
                <div className={`requirement ${passwordRequirements.hasUppercase ? "met" : ""}`}>
                  <span className="requirement-icon">{passwordRequirements.hasUppercase ? "✓" : "○"}</span>
                  One uppercase letter (A-Z)
                </div>
                <div className={`requirement ${passwordRequirements.hasLowercase ? "met" : ""}`}>
                  <span className="requirement-icon">{passwordRequirements.hasLowercase ? "✓" : "○"}</span>
                  One lowercase letter (a-z)
                </div>
                <div className={`requirement ${passwordRequirements.hasNumber ? "met" : ""}`}>
                  <span className="requirement-icon">{passwordRequirements.hasNumber ? "✓" : "○"}</span>
                  One number (0-9)
                </div>
                <div className={`requirement ${passwordRequirements.hasSpecial ? "met" : ""}`}>
                  <span className="requirement-icon">{passwordRequirements.hasSpecial ? "✓" : "○"}</span>
                  Special Characters (! @ # $ % ^ & * ( ) _ +)
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">Confirm New Password:</label>
            <div className="password-input-wrapper">
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="password-input"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <img
                  src={showConfirmPassword ? "/hide.png" : "/view.png"}
                  alt={showConfirmPassword ? "Hide" : "Show"}
                  className="toggle-icon"
                />
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="btn btn-save"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
