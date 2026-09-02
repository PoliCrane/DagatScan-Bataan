import { useState, useEffect } from "react";
import "../pages/styles/accountModals.css";
import { showSuccessHtml, showError } from "../utils/sweetAlertUtils";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
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
    password: "",
    confirmPassword: "",
    roles: "municipal",
    municipality_id: "",
  });
  const [municipalities, setMunicipalities] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandPassword, setExpandPassword] = useState(false);

  useEffect(() => {
    getMunicipalities()
      .then((data) => setMunicipalities(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Could not load municipalities:", err.message));
  }, []);

  // Password validation requirements
  const passwordRequirements = {
    minLength: formData.password.length >= 8,
    hasUppercase: /[A-Z]/.test(formData.password),
    hasLowercase: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password)
  };

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
    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }
    if (!formData.password.trim()) {
      setError("Password is required");
      return;
    }

    if (!formData.confirmPassword.trim()) {
      setError("Please confirm the password");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!passwordRequirements.hasUppercase) {
      setError("Password must contain at least one uppercase letter");
      return;
    }

    if (!passwordRequirements.hasLowercase) {
      setError("Password must contain at least one lowercase letter");
      return;
    }

    if (!passwordRequirements.hasNumber) {
      setError("Password must contain at least one number");
      return;
    }

    if (!passwordRequirements.hasSpecial) {
      setError("Password must contain at least one special character (! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' : \" \\ | , . < > /)");
      return;
    }

    if (formData.roles === "municipal" && !formData.municipality_id) {
      setError("Please select a municipality for this account");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email");
      return;
    }

    // Close modal before showing loading state
    onClose();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      console.log("Creating account with data:", formData);
      const response = await fetch(`${API_BASE_URL}/admin/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          roles: formData.roles,
          municipality_id: formData.municipality_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        await showError(data.error || "Failed to create account");
        // Reopen modal after error dialog is dismissed
        if (onError) {
          setTimeout(() => onError(), 100);
        }
        return;
      }

      await showSuccessHtml(`Account created successfully!<br/><small>Username: ${formData.username}</small>`);
      onSuccess();
      handleCancel();
    } catch (err) {
      await showError("An error occurred. Please try again.");
      console.error(err);
      // Reopen modal after error dialog is dismissed
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
      password: "",
      confirmPassword: "",
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

  const requirementRow = (met, text) => (
    <div className={`requirement ${met ? "met" : ""}`}>
      <span className="requirement-icon">{met ? "✓" : "○"}</span>
      {text}
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
        <label htmlFor="password">Password *</label>
        <Password
          id="password"
          name="password"
          className="w-full"
          inputClassName="form-input w-full"
          value={formData.password}
          onChange={handleChange}
          onFocus={() => setExpandPassword(true)}
          onBlur={() => setExpandPassword(false)}
          placeholder="Enter password"
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
        <label htmlFor="confirmPassword">Confirm Password *</label>
        <Password
          id="confirmPassword"
          name="confirmPassword"
          className="w-full"
          inputClassName="form-input w-full"
          value={formData.confirmPassword}
          onChange={handleChange}
          placeholder="Re-enter password"
          toggleMask
          feedback={false}
        />
        {formData.confirmPassword && (
          <div className={`password-match-hint ${formData.password === formData.confirmPassword ? "match" : "mismatch"}`}>
            {formData.password === formData.confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
          </div>
        )}
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
    </Dialog>
  );
}
