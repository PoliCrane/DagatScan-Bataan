import { useState, useEffect } from "react";
import "../pages/styles/accountModals.css";
import { showSuccess, showError } from "../utils/sweetAlertUtils";
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
    roles: "user",
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

      await showSuccess(`Account created successfully!<br/><small>Username: ${formData.username}</small>`);
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

  return (
    <>
      {isOpen && <div className="modal-overlay" onClick={handleCancel}></div>}
      <div className={`account-modal ${isOpen ? "open" : ""}`}>
        <div className="modal-header">
          <h2>Add New Account</h2>
          <button className="close-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}

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

          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter email address"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                onFocus={() => setExpandPassword(true)}
                onBlur={() => setExpandPassword(false)}
                placeholder="Enter password"
                className="form-input"
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

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password *</label>
            <div className="password-input-wrapper">
              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter password"
                className="form-input"
              />
            </div>
            {formData.confirmPassword && (
              <div className={`password-match-hint ${formData.password === formData.confirmPassword ? "match" : "mismatch"}`}>
                {formData.password === formData.confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="roles">Account Role:</label>
            <select
              id="roles"
              name="roles"
              value={formData.roles}
              onChange={handleChange}
              className="form-input"
            >
              <option value="municipal">Municipal</option>
              <option value="admin">Administrator</option>
              {isSuperadmin && <option value="superadmin">Superadmin</option>}
            </select>
          </div>

          {formData.roles === "municipal" && (
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
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>
      </div>
      
    </>
  );
}
