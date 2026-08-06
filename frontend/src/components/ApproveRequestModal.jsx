import { useState } from "react";
import "../pages/styles/accountModals.css";
import { showSuccess, showError } from "../utils/sweetAlertUtils";

import { API_BASE_URL } from "../config/api";
// The request form no longer collects a password from the applicant — the
// admin sets the account's initial password here, at approval time (see
// server.js's POST /admin/account-requests/:id/approve).
export default function ApproveRequestModal({ isOpen, request, onClose, onSuccess }) {
  const [password, setPassword] = useState("");
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
    setError("");
    onClose();
  };

  const handleApprove = async () => {
    setError("");
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

  return (
    <>
      {isOpen && <div className="modal-overlay" onClick={handleClose}></div>}
      <div className={`account-modal ${isOpen ? "open" : ""}`}>
        <div className="modal-header">
          <h2>Approve Account Request</h2>
          <button className="close-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}

          <div className="approve-request-summary">
            <p><strong>{request.username}</strong> ({request.email}) — {request.municipality}</p>
            <p>Contact: {request.contact_number} · Position: {request.position}</p>
            <p>
              <a
                className="btn-view-letter-link"
                href={request.request_letter_url || `${API_BASE_URL}/uploads/request-letters/${request.request_letter_filename}`}
                target="_blank"
                rel="noreferrer"
              >
                View Letter
              </a>
            </p>
            {request.additional_remarks && (
              <p>Remarks: {request.additional_remarks}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="approve-password">Set Initial Password *</label>
            <div className="password-input-wrapper">
              <input
                id="approve-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setExpandPassword(true)}
                onBlur={() => setExpandPassword(false)}
                placeholder="Set initial password"
                disabled={loading}
              />
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={handleClose}>Cancel</button>
          <button className="btn btn-save" onClick={handleApprove} disabled={loading}>
            {loading ? "Approving..." : "Approve & Create Account"}
          </button>
        </div>
      </div>
    </>
  );
}
