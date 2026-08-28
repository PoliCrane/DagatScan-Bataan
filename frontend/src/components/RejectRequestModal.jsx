import { useState } from "react";
import "../pages/styles/accountModals.css";
import { showSuccess, showError } from "../utils/sweetAlertUtils";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { openRequestLetter } from "../utils/requestLetter";

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

  const footer = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" outlined severity="secondary" onClick={handleClose} disabled={loading} />
      <Button
        label={loading ? "Rejecting..." : "Reject Request"}
        icon="pi pi-times"
        severity="danger"
        onClick={handleReject}
        loading={loading}
      />
    </div>
  );

  return (
    <Dialog
      header="Reject Account Request"
      visible={isOpen}
      onHide={handleClose}
      footer={footer}
      style={{ width: "min(32rem, 92vw)" }}
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

      <p>Are you sure you want to reject this request? The applicant will not be able to log in.</p>

      <div className="form-group">
        <label htmlFor="reject-reason">Rejection Reason</label>
        <InputTextarea
          id="reject-reason"
          className="form-textarea w-full"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason (optional)"
          disabled={loading}
          rows={3}
          autoResize
        />
      </div>
    </Dialog>
  );
}
