import { API_BASE_URL } from "../config/api";
import { showError } from "./sweetAlertUtils";

// Request letters hold PII, so they are served only through the authenticated
// superadmin endpoint. Fetch with the bearer token and hand the browser a blob.
export async function openRequestLetter(requestId) {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_BASE_URL}/admin/account-requests/${requestId}/letter`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Could not load the request letter");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    await showError(err.message);
  }
}
