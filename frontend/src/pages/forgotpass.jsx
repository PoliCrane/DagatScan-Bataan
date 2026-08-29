import { useState } from "react";
import { forgotPass } from "../api/auth";
import { useNavigate } from "react-router-dom";
import { showLoading, showSuccess, showError } from "../utils/sweetAlertUtils";
import "./styles/forgotpass.css";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";

export default function ForgotPassword({ onClose, onSwitchToLogin, onSwitchToResetPassword }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!email) {
      await showError("Email is required");
      setError("Email is required");
      setLoading(false);
      return;
    }

    // Close modal before showing loading dialog
    if (onClose) onClose();

    // Show loading dialog
    await showLoading("Sending reset code...", 2000);

    const res = await forgotPass(email);

    if (res.error) {
      // Show error dialog (modal will be closed, error dialog brings it attention)
      await showError(res.error);
      setError(res.error);
      
      // Reopen modal on error
      // Modal should automatically reopen since onClose was called
    } else {
      // Show success dialog
      await showSuccess("Password reset code sent to your email!");
      setSuccess("Password reset code sent to your email!");
      localStorage.setItem("resetEmail", email);
      
      if (onSwitchToResetPassword) {
        onSwitchToResetPassword(email);
      }
    }
    setLoading(false);
  };

  return (
    <div className="form-container">
      <h2>Forgot Password</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit}>
        <p style={{ color: "#666", marginBottom: "20px", fontSize: "14px" }}>
          Enter your email address and we'll send you a code to reset your password.
        </p>
        <InputText
          className="form-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
        />
        <Button
          className="form-btn"
          type="submit"
          label={loading ? "Sending..." : "Send Reset Code"}
          loading={loading}
          disabled={loading}
        />
      </form>
      <p className="form-link">
        Remember your password? <button type="button" className="link-button" onClick={() => onSwitchToLogin && onSwitchToLogin()}>Login</button>
      </p>
    </div>
  );

}
