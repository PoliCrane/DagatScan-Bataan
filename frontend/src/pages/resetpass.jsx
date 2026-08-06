import { useState, useRef, useEffect } from "react";
import { resetPass } from "../api/auth";
import { useNavigate, useLocation } from "react-router-dom";
import "./index-organized.css";
import { showError, showSuccess, showLoading } from "../utils/sweetAlertUtils";

export default function ResetPassword({ email: propEmail, onClose, onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandPassword, setExpandPassword] = useState(false);
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Password validation requirements
  const passwordRequirements = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)
  };

  // Try to get email from props, location state, or localStorage
  useEffect(() => {
    const initialEmail = propEmail || location.state?.email || localStorage.getItem("resetEmail") || "";
    setEmail(initialEmail);
  }, [propEmail, location.state?.email]);

  const handleCodeChange = (e, index) => {
    const value = e.target.value.replace(/\D/g, "");
    
    if (value) {
      const newCode = [...resetCode];
      newCode[index] = value[0];
      setResetCode(newCode);
      
      // Auto focus to next input
      if (index < 5 && value) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleCodeKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      const newCode = [...resetCode];
      if (resetCode[index]) {
        newCode[index] = "";
        setResetCode(newCode);
      } else if (index > 0) {
        newCode[index - 1] = "";
        setResetCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newCode = pastedData.split("").concat(Array(6).fill("")).slice(0, 6);
    setResetCode(newCode);
    
    // Focus on the last filled input or the last input if all are filled
    const lastFilledIndex = Math.min(newCode.lastIndexOf(newCode.filter(c => c)[newCode.filter(c => c).length - 1]) || 5, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const fullResetCode = resetCode.join("");

    // Validation
    if (!email.trim()) {
      await showError("Email is required");
      setError("Email is required");
      setLoading(false);
      return;
    }

    if (!fullResetCode || fullResetCode.length !== 6) {
      await showError("Reset code must be 6 digits");
      setError("Reset code must be 6 digits");
      setLoading(false);
      return;
    }

    if (!newPassword || !confirmPassword) {
      await showError("Password fields are required");
      setError("Password fields are required");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      await showError("Passwords do not match");
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      await showError("Password must be at least 8 characters");
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (!passwordRequirements.hasUppercase) {
      await showError("Password must contain at least one uppercase letter");
      setError("Password must contain at least one uppercase letter");
      setLoading(false);
      return;
    }

    if (!passwordRequirements.hasLowercase) {
      await showError("Password must contain at least one lowercase letter");
      setError("Password must contain at least one lowercase letter");
      setLoading(false);
      return;
    }

    if (!passwordRequirements.hasNumber) {
      await showError("Password must contain at least one number");
      setError("Password must contain at least one number");
      setLoading(false);
      return;
    }

    if (!passwordRequirements.hasSpecial) {
      await showError("Password must contain at least one special character (! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' : \" \\ | , . < > /)");
      setError("Password must contain at least one special character (! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' : \" \\ | , . < > /)");
      setLoading(false);
      return;
    }

    // Close modal before showing loading dialog
    if (onClose) onClose();

    // Show loading
    await showLoading("Resetting password...", 2000);

    try {
      const res = await resetPass(email, fullResetCode, newPassword);

      if (res.error) {
        // Show error dialog (modal will be closed)
        await showError(res.error);
        setError(res.error);
      } else {
        // Show success dialog
        await showSuccess("Password reset successfully!");
        setSuccess("Password reset successfully! Redirecting to login...");
        localStorage.removeItem("resetEmail");
        
        // Redirect to login (no confirmation needed, just go)
        if (onSwitchToLogin) {
          onSwitchToLogin();
        } else {
          navigate("/login");
        }
      }
    } catch (err) {
      console.error("Reset password error:", err);
      // Show error dialog (modal will be closed)
      await showError("An error occurred. Please try again.");
      setError("An error occurred. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="form-container">
      <h2>Reset Password</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit}>
        <input
          className="form-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
        />
        
        <label style={{ fontSize: "12px", color: "#0077B6", fontWeight: "600", marginTop: "15px", display: "block", marginBottom: "10px" }}>
          Reset Code
        </label>
        <div className="verification-code-container">
          {resetCode.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              className="verification-code-box"
              type="text"
              value={digit}
              onChange={(e) => handleCodeChange(e, index)}
              onKeyDown={(e) => handleCodeKeyDown(e, index)}
              onPaste={handleCodePaste}
              maxLength="1"
              disabled={loading}
              inputMode="numeric"
              autoComplete="off"
            />
          ))}
        </div>

        <input
          className="form-input"
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onFocus={() => setExpandPassword(true)}
          onBlur={() => setExpandPassword(false)}
          disabled={loading}
          required
        />
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
        <input
          className="form-input"
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          required
        />
        <button className="form-btn" type="submit" disabled={loading || resetCode.join("").length !== 6 || !email.trim()}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>
      <p className="form-link">
        <button className="link-button" onClick={() => onSwitchToLogin && onSwitchToLogin()}>
          Back to Login
        </button>
      </p>
    </div>
  );
}
