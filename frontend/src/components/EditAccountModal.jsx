import { useState, useEffect } from "react";
import "../pages/styles/accountModals.css";
import { showSuccess, showError, confirmAction, showLoading } from "../utils/sweetAlertUtils";
import { getMunicipalities } from "../api/auth";

import { API_BASE_URL } from "../config/api";
export default function EditAccountModal({ isOpen, onClose, account, onSuccess }) {
  const [formData, setFormData] = useState({
    username: "",
    municipality_id: "",
    roles: "",
  });
  const [municipalities, setMunicipalities] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // A superadmin's own role isn't editable through this modal (out of
  // scope — see server.js's /role route, which still technically allows a
  // superadmin caller to assign it, just not exposed here).
  const isSuperadminAccount = account?.roles === "superadmin";
  // Driven by the LIVE selection, not the account's original role, so the
  // municipality field appears/disappears as the role dropdown changes.
  const showMunicipalityField = formData.roles === "municipal";

  useEffect(() => {
    if (account) {
      setFormData({
        username: account.username,
        municipality_id: account.municipality_id || "",
        roles: account.roles,
      });
    }
  }, [account, isOpen]);

  // Fetched unconditionally on open (not gated on the account's current
  // role) so the list is already ready if the superadmin switches the role
  // dropdown to Municipal mid-edit, instead of a flash of an empty select.
  useEffect(() => {
    if (isOpen && municipalities.length === 0) {
      getMunicipalities()
        .then((data) => setMunicipalities(Array.isArray(data) ? data : []))
        .catch((err) => console.error("Could not load municipalities:", err.message));
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSave = async () => {
    setError("");

    // Validation
    if (!formData.username.trim()) {
      setError("Username is required");
      return;
    }
    if (showMunicipalityField && !formData.municipality_id) {
      setError("Please select a municipality for this account");
      return;
    }

    const roleChanged = !isSuperadminAccount && formData.roles !== account.roles;

    // Close modal before showing confirmation dialog
    onClose();

    // Step 1: Ask for confirmation
    const confirmed = await confirmAction(
      roleChanged
        ? `Update username to <strong>${formData.username}</strong> and change role to <strong>${formData.roles}</strong>?<br/><small>Current: ${account.username} (${account.roles})</small>`
        : `Update username to <strong>${formData.username}</strong>?<br/><small>Current: ${account.username}</small>`
    );

    if (!confirmed) return;

    setLoading(true);

    // Step 2: Show loading dialog
    await showLoading("Updating account...", 2000);

    try {
      const token = localStorage.getItem("token");

      // Role change (+ the municipality_id consistency that comes with it)
      // goes through the dedicated /role route first — /edit's own
      // municipality_id handling can only set a new value or keep the
      // existing one, it can't clear it, so that logic has to live there.
      if (roleChanged) {
        const roleResponse = await fetch(`${API_BASE_URL}/admin/users/${account.id}/role`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            roles: formData.roles,
            municipality_id: formData.roles === "municipal" ? formData.municipality_id : undefined,
          }),
        });
        const roleData = await roleResponse.json();
        if (!roleResponse.ok) {
          await showError(roleData.error || "Failed to update role");
          return;
        }
      }

      // Username (+ municipality_id, but only when the role didn't just
      // change above — avoids a redundant duplicate write of something
      // /role already set).
      const editBody = { username: formData.username };
      if (showMunicipalityField && !roleChanged) {
        editBody.municipality_id = formData.municipality_id;
      }

      const response = await fetch(`${API_BASE_URL}/admin/users/${account.id}/edit`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(editBody),
      });

      const data = await response.json();

      if (!response.ok) {
        await showError(data.error || "Failed to update account");
        return;
      }

      // Step 3: Show success
      await showSuccess(`Account updated successfully!<br/><small>Username: ${formData.username}</small>`);
      onSuccess();
      handleCancel();
    } catch (err) {
      await showError("An error occurred. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setError("");
    onClose();
  };

  if (!account) return null;

  return (
    <>
      {isOpen && <div className="modal-overlay" onClick={handleCancel}></div>}
      <div className={`account-modal ${isOpen ? "open" : ""}`}>
        <div className="modal-header">
          <h2>Edit Account</h2>
          <button className="close-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="id">ID:</label>
            <input
              id="id"
              type="text"
              value={account.id}
              disabled
              className="form-input disabled"
            />
            <small className="field-note">Cannot be changed</small>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email:</label>
            <input
              id="email"
              type="email"
              value={account.email}
              disabled
              className="form-input disabled"
            />
            <small className="field-note">Cannot be changed</small>
          </div>

          <div className="form-group">
            <label htmlFor="username">Username *</label>
            <input
              id="username"
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter username"
              className="form-input"
            />
          </div>

          {isSuperadminAccount ? (
            <div className="form-group">
              <label htmlFor="roles">Role:</label>
              <input
                id="roles"
                type="text"
                value="Superadmin"
                disabled
                className="form-input disabled"
              />
              <small className="field-note">Cannot be changed here</small>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="roles">Role *</label>
              <select
                id="roles"
                name="roles"
                value={formData.roles}
                onChange={handleChange}
                className="form-input"
              >
                <option value="municipal">Municipal</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}

          {showMunicipalityField && (
            <div className="form-group">
              <label htmlFor="municipality_id">Municipality: *</label>
              <select
                id="municipality_id"
                name="municipality_id"
                value={formData.municipality_id}
                onChange={handleChange}
                className="form-input"
              >
                <option value="">Select municipality</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
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
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}
