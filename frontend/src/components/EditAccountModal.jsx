import { useState, useEffect } from "react";
import "../pages/styles/accountModals.css";
import { showSuccessHtml, showError, confirmActionHtml, showLoading } from "../utils/sweetAlertUtils";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
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

  // superadmin's own role isn't editable through this modal
  const isSuperadminAccount = account?.roles === "superadmin";
  // driven by the live selection so the field appears/disappears as the role dropdown changes
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

  // fetched unconditionally on open so the list is ready if the role dropdown switches to Municipal mid-edit
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

    if (!formData.username.trim()) {
      setError("Username is required");
      return;
    }
    if (showMunicipalityField && !formData.municipality_id) {
      setError("Please select a municipality for this account");
      return;
    }

    const roleChanged = !isSuperadminAccount && formData.roles !== account.roles;

    onClose();

    const confirmed = await confirmActionHtml(
      roleChanged
        ? `Update username to <strong>${formData.username}</strong> and change role to <strong>${formData.roles}</strong>?<br/><small>Current: ${account.username} (${account.roles})</small>`
        : `Update username to <strong>${formData.username}</strong>?<br/><small>Current: ${account.username}</small>`
    );

    if (!confirmed) return;

    setLoading(true);

    await showLoading("Updating account...", 2000);

    try {
      const token = localStorage.getItem("token");

      // role changes go through the dedicated /role route — /edit's own municipality_id handling can't clear a value, only set/keep one
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

      // only include municipality_id if /role didn't already set it above
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

      await showSuccessHtml(`Account updated successfully!<br/><small>Username: ${formData.username}</small>`);
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

  const footer = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" outlined severity="secondary" onClick={handleCancel} disabled={loading} />
      <Button
        label={loading ? "Saving..." : "Save Changes"}
        icon="pi pi-check"
        onClick={handleSave}
        loading={loading}
      />
    </div>
  );

  return (
    <Dialog
      header="Edit Account"
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
        <label htmlFor="id">ID:</label>
        <InputText id="id" value={String(account.id)} disabled className="form-input disabled w-full" />
        <small className="field-note">Cannot be changed</small>
      </div>

      <div className="form-group">
        <label htmlFor="email">Email:</label>
        <InputText id="email" value={account.email} disabled className="form-input disabled w-full" />
        <small className="field-note">Cannot be changed</small>
      </div>

      <div className="form-group">
        <label htmlFor="username">Username *</label>
        <InputText
          id="username"
          name="username"
          value={formData.username}
          onChange={handleChange}
          placeholder="Enter username"
          className="form-input w-full"
        />
      </div>

      {isSuperadminAccount ? (
        <div className="form-group">
          <label htmlFor="roles">Role:</label>
          <InputText id="roles" value="Superadmin" disabled className="form-input disabled w-full" />
          <small className="field-note">Cannot be changed here</small>
        </div>
      ) : (
        <div className="form-group">
          <label htmlFor="roles">Role *</label>
          <Dropdown
            id="roles"
            className="form-input w-full"
            value={formData.roles}
            onChange={(e) => handleChange({ target: { name: "roles", value: e.value } })}
            options={[
              { label: "Municipal", value: "municipal" },
              { label: "Admin", value: "admin" },
            ]}
          />
        </div>
      )}

      {showMunicipalityField && (
        <div className="form-group">
          <label htmlFor="municipality_id">Municipality: *</label>
          <Dropdown
            id="municipality_id"
            className="form-input w-full"
            value={formData.municipality_id}
            onChange={(e) => handleChange({ target: { name: "municipality_id", value: e.value } })}
            options={municipalities.map((m) => ({ label: m.name, value: m.id }))}
            placeholder="Select municipality"
            filter={municipalities.length > 5}
          />
        </div>
      )}
    </Dialog>
  );
}
