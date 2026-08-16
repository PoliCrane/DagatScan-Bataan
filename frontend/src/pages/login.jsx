import { useState } from "react";
import { loginUser } from "../api/auth";
import { useNavigate } from "react-router-dom";
import { showLoading, showSuccess, showError } from "../utils/sweetAlertUtils";
import { useAuth } from "../contexts/useAuth";
import "./styles/forms.css";

export default function Login({ onClose, onSwitchToForgotPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Close modal before showing loading dialog
    if (onClose) onClose();

    // Show loading dialog
    await showLoading("Logging in...", 2000);

    const res = await loginUser({ email, password });

    if (res.token) {
      auth.login(res);

      // Show success
      await showSuccess(`Welcome back, ${res.username || 'User'}!`);

      // Redirect based on user role (no confirmation needed, just go)
      if (res.roles === "admin") {
        navigate("/admin/data-upload");
      } else if (res.roles === "municipal") {
        navigate("/home");
      } else {
        navigate("/home");
      }
    } else if (res.error) {
      // Show error
      await showError(res.error);
      setError(res.error);
    }
    setLoading(false);
  };

  return (
    <div className="form-container login-form">
      <div className="form-header-brand">
        <img src="/DSLogo.png" alt="DagatScan Bataan Logo" className="form-header-logo" />
        <h2 className="form-header-title">DagatScan <span>Bataan</span></h2>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          className="form-input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <div className="password-field">
          <div className="password-input-wrapper">
            <input
              className="form-input"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              title={showPassword ? "Hide password" : "Show password"}
            >
              <img 
                src={showPassword ? "/view.png" : "/hide.png"}
                alt={showPassword ? "Hide password" : "Show password"}
                className="toggle-icon"
              />
            </button>
          </div>
        </div>
            
        <p className="form-footer">
          <button 
            onClick={() => onSwitchToForgotPassword && onSwitchToForgotPassword()}
            style={{
              background: "none",
              border: "none",
              color: "#0077B6",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: "14px",
              padding: 0,
            }}
          >
            Forgot Password?
          </button>
        </p>
        <button className="form-btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="form-link">
        Don't have an account?{" "}
        <button
          onClick={() => {
            if (onClose) onClose();
            navigate("/request-account");
          }}
          style={{
            background: "none",
            border: "none",
            color: "#0077B6",
            cursor: "pointer",
            textDecoration: "underline",
            fontSize: "14px",
            padding: 0,
          }}
        >
          Request an account here
        </button>
      </p>
    </div>
  );
}
