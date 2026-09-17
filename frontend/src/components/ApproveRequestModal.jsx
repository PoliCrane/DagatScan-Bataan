import { useState } from "react";
import "../pages/styles/accountModals.css";
import { showSuccessHtml, showError } from "../utils/sweetAlertUtils";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { openRequestLetter } from "../utils/requestLetter";

import { API_BASE_URL } from "../config/api";
// The system issues the initial password on approval — neither the applicant nor the
// approver picks one. It is emailed to the applicant and shown once here as a fallback.
export default function ApproveRequestModal({ isOpen, request, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    setError("");
    onClose();
  };

  const handleApprove = async () => {
    setError("");
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
          body: JSON.stringify({}),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to approve request");
      }
      await showSuccessHtml(
        `Account created for <strong>${request.username}</strong><br/>` +
        `<small>Temporary password: <strong>${data.temporaryPassword}</strong></small><br/>` +
        `<small>Also emailed to ${request.email}. They can change it from their account menu after signing in.</small>`
      );
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

      <Message
        severity="info"
        className="w-full"
        text="Approving creates the account with an automatically generated temporary password, emailed to the applicant and shown once here."
      />
    </Dialog>
  );
}
