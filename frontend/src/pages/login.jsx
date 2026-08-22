import { useState } from "react";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
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

      {error && <Message severity="error" text={error} className="mb-3 w-full" />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <InputText
          className="form-input w-full"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <Password
          className="w-full"
          inputClassName="form-input w-full"
          inputStyle={{ width: "100%" }}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          toggleMask
          feedback={false}
        />

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
        <Button
          type="submit"
          className="form-btn w-full"
          label={loading ? "Logging in..." : "Log in"}
          icon="pi pi-sign-in"
          loading={loading}
        />
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
