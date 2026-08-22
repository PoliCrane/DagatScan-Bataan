import { useState } from "react";
import "../pages/styles/accountModals.css";
import { showSuccess, showError } from "../utils/sweetAlertUtils";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Password } from "primereact/password";
import { Message } from "primereact/message";
import { openRequestLetter } from "../utils/requestLetter";

import { API_BASE_URL } from "../config/api";
// the admin sets the account's initial password here, at approval time — the request form no longer collects one from the applicant
export default function ApproveRequestModal({ isOpen, request, onClose, onSuccess }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [expandPassword, setExpandPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordRequirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const handleClose = () => {
    setPassword("");
    setConfirmPassword("");
    setError("");
    onClose();
  };

  const handleApprove = async () => {
    setError("");
    if (!confirmPassword.trim()) {
      setError("Please confirm the password");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!Object.values(passwordRequirements).every(Boolean)) {
      setError("Password does not meet all requirements below");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/admin/account-requests/${request.id}/approve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to approve request");
      }
      await showSuccess(`Account created for ${request.username}`);
      setPassword("");
      setConfirmPassword("");
      onSuccess();
    } catch (err) {
      await showError(err.message);
      setError(err.message);
      console.error("Error approving request:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  const footer = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" outlined severity="secondary" onClick={handleClose} disabled={loading} />
      <Button
        label={loading ? "Approving..." : "Approve & Create Account"}
        icon="pi pi-check"
        onClick={handleApprove}
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
      header="Approve Account Request"
      visible={isOpen}
      onHide={handleClose}
      footer={footer}
      style={{ width: "min(34rem, 92vw)" }}
      modal
      draggable={false}
      dismissableMask
    >
      {error && <Message severity="error" text={error} className="mb-3 w-full" />}

      <div className="approve-request-summary">
        <p><strong>{request.username}</strong> ({request.email}) — {request.municipality}</p>
        <p>Contact: {request.contact_number} · Position: {request.position}</p>
        <p>
          <Button
            label="View Letter"
            icon="pi pi-file-pdf"
            link
            className="btn-view-letter-link p-0"
            onClick={() => openRequestLetter(request.id)}
          />
        </p>
        {request.additional_remarks && <p>Remarks: {request.additional_remarks}</p>}
      </div>

      <div className="form-group">
        <label htmlFor="approve-password">Set Initial Password *</label>
        <Password
          id="approve-password"
          className="w-full"
          inputClassName="form-input w-full"
          inputStyle={{ width: "100%" }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setExpandPassword(true)}
          onBlur={() => setExpandPassword(false)}
          placeholder="Set initial password"
          disabled={loading}
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
        <label htmlFor="approve-confirm-password">Confirm Password *</label>
        <Password
          id="approve-confirm-password"
          className="w-full"
          inputClassName="form-input w-full"
          inputStyle={{ width: "100%" }}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          disabled={loading}
          toggleMask
          feedback={false}
        />
        {confirmPassword && (
          <div className={`password-match-hint ${password === confirmPassword ? "match" : "mismatch"}`}>
            {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
          </div>
        )}
      </div>
    </Dialog>
  );
}
