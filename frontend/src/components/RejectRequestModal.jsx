import { useState } from "react";
import "../pages/styles/accountModals.css";
import { showSuccess, showError } from "../utils/sweetAlertUtils";

import { API_BASE_URL } from "../config/api";
// rejection modal with an optional reason field; backend already accepted this field, frontend just never sent it before
export default function RejectRequestModal({ isOpen, request, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    setReason("");
    setError("");
    onClose();
  };

  const handleReject = async () => {
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/admin/account-requests/${request.id}/reject`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to reject request");
      }
      await showSuccess(`Request from ${request.username} rejected`);
      setReason("");
      onSuccess();
    } catch (err) {
      await showError(err.message);
      setError(err.message);
      console.error("Error rejecting request:", err);
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
          <h2>Reject Account Request</h2>
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

          <p>Are you sure you want to reject this request? The applicant will not be able to log in.</p>

          <div className="form-group">
            <label htmlFor="reject-reason">Rejection Reason</label>
            <textarea
              id="reject-reason"
              className="form-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason (optional)"
              disabled={loading}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={handleClose}>Cancel</button>
          <button className="btn btn-save" onClick={handleReject} disabled={loading}>
            {loading ? "Rejecting..." : "Reject Request"}
          </button>
        </div>
      </div>
    </>
  );
}
