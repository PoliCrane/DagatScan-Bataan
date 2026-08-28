import { useState } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Password } from "primereact/password";
import { Message } from "primereact/message";
import "../pages/styles/changePasswordModal.css";
import { showSuccess, showError, showLoading } from "../utils/sweetAlertUtils";

import { API_BASE_URL } from "../config/api";
export default function ChangePasswordModal({ isOpen, onClose, username }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    setError("");
    onClose();
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" outlined severity="secondary" onClick={handleCancel} disabled={loading} />
      <Button
        label={loading ? "Saving..." : "Save"}
        icon="pi pi-check"
        onClick={handleSave}
        loading={loading}
      />
    </div>
  );

  const requirementRow = (met, text) => (
    <div className={`requirement ${met ? "met" : ""}`}>
      <span className="requirement-icon">{met ? "✓" : "○"}</span>
      {text}
    </div>
  );

  return (
    <Dialog
      header="Change Password"
      visible={isOpen}
      onHide={handleCancel}
      footer={footer}
      style={{ width: "min(30rem, 92vw)" }}
      modal
      draggable={false}
      dismissableMask
    >
      {error && <Message severity="error" text={error} className="mb-3 w-full" />}

      <div className="form-group">
        <label htmlFor="current-password">Current Password:</label>
        <Password
          id="current-password"
          className="w-full"
          inputClassName="form-input w-full"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter current password"
          toggleMask
          feedback={false}
        />
      </div>

      <div className="form-group">
        <label htmlFor="new-password">New Password:</label>
        <Password
          id="new-password"
          className="w-full"
          inputClassName="form-input w-full"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onFocus={() => setExpandPassword(true)}
          onBlur={() => setExpandPassword(false)}
          placeholder="Enter new password"
          toggleMask
          feedback={false}
        />
        {expandPassword && (
          <div className="password-requirements">
            {requirementRow(passwordRequirements.minLength, "At least 8 characters")}
            {requirementRow(passwordRequirements.hasUppercase, "One uppercase letter (A-Z)")}
            {requirementRow(passwordRequirements.hasLowercase, "One lowercase letter (a-z)")}
            {requirementRow(passwordRequirements.hasNumber, "One number (0-9)")}
            {requirementRow(passwordRequirements.hasSpecial, "Special Characters (! @ # $ % ^ & * ( ) _ +)")}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="confirm-password">Confirm New Password:</label>
        <Password
          id="confirm-password"
          className="w-full"
          inputClassName="form-input w-full"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          toggleMask
          feedback={false}
        />
      </div>
    </Dialog>
  );
}
