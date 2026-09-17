import { useState, useEffect } from "react";
import "../pages/styles/accountModals.css";
import { showSuccessHtml, showError } from "../utils/sweetAlertUtils";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
import { getMunicipalities } from "../api/auth";

import { API_BASE_URL } from "../config/api";
export default function AddAccountModal({ isOpen, onClose, onSuccess, onError }) {
  const currentUserRole = localStorage.getItem("roles");
  const isSuperadmin = currentUserRole === "superadmin";

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    roles: "municipal",
    municipality_id: "",
  });
  const [municipalities, setMunicipalities] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMunicipalities()
      .then((data) => setMunicipalities(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Could not load municipalities:", err.message));
  }, []);

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
    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }

    if (formData.roles === "municipal" && !formData.municipality_id) {
      setError("Please select a municipality for this account");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email");
      return;
    }

    onClose();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/admin/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          roles: formData.roles,
          municipality_id: formData.municipality_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        await showError(data.error || "Failed to create account");
        // reopens the modal once the error dialog closes
        if (onError) {
          setTimeout(() => onError(), 100);
        }
        return;
      }

      // Shown once here as well as emailed, so the account is still usable if the
      // email bounces or lands in spam.
      await showSuccessHtml(
        `Account created successfully!<br/>` +
        `<small>Username: <strong>${formData.username}</strong></small><br/>` +
        `<small>Temporary password: <strong>${data.temporaryPassword}</strong></small><br/>` +
        `<small>Also emailed to ${formData.email}. They can change it from their account menu after signing in.</small>`
      );
      onSuccess();
      handleCancel();
    } catch (err) {
      await showError("An error occurred. Please try again.");
      console.error(err);
      if (onError) {
        setTimeout(() => onError(), 100);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      username: "",
      email: "",
      roles: "municipal",
      municipality_id: "",
    });
    setError("");
    onClose();
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" outlined severity="secondary" onClick={handleCancel} disabled={loading} />
      <Button
        label={loading ? "Creating..." : "Create Account"}
        icon="pi pi-user-plus"
        onClick={handleSave}
        loading={loading}
      />
    </div>
  );

  const roleOptions = [
    { label: "Municipal", value: "municipal" },
    { label: "Administrator", value: "admin" },
    ...(isSuperadmin ? [{ label: "Superadmin", value: "superadmin" }] : []),
  ];

  const onField = (name) => (e) => handleChange({ target: { name, value: e.value ?? e.target.value } });

  return (
    <Dialog
      header="Add Account"
      visible={isOpen}
      onHide={handleCancel}
      footer={footer}
      style={{ width: "min(32rem, 92vw)" }}
      modal
      draggable={false}
      dismissableMask
    >
      {error && <Message severity="error" text={error} className="mb-3 w-full" />}

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

      <div className="form-group">
        <label htmlFor="email">Email *</label>
        <InputText
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Enter email address"
          className="form-input w-full"
        />
      </div>

      <div className="form-group">
        <label htmlFor="roles">Account Role:</label>
        <Dropdown
          id="roles"
          className="form-input w-full"
          value={formData.roles}
          onChange={onField("roles")}
          options={roleOptions}
        />
      </div>

      {formData.roles === "municipal" && (
        <div className="form-group">
          <label htmlFor="municipality_id">Municipality: *</label>
          <Dropdown
            id="municipality_id"
            className="form-input w-full"
            value={formData.municipality_id}
            onChange={onField("municipality_id")}
            options={municipalities.map((m) => ({ label: m.name, value: m.id }))}
            placeholder="Select municipality"
            filter={municipalities.length > 5}
          />
        </div>
      )}

      <Message
        severity="info"
        className="w-full"
        text="A temporary password is generated automatically and emailed to the user. It is also shown once here after the account is created."
      />
    </Dialog>
  );
}
