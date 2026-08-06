import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { requestAccount, getMunicipalities } from "../api/auth";
import { showError, showSuccess, showLoading } from "../utils/sweetAlertUtils";
import { isValidPhilippineMobile, isValidEmail } from "../utils/validation";
import AuthModals from "../components/AuthModals";
import SiteFooter from "../components/SiteFooter";
import IndexNavBar from "./indexNavBar";
import "./index-organized.css";
import "./styles/forms.css";
import "./styles/requestAccount.css";

const POSITION_OPTIONS = [
  "DENR Officer",
  "Municipal Environment and Natural Resources Officer (MENRO)",
  "LGU Staff",
  "Environmental Researcher",
  "Coastal Resource Management Officer",
  "Others",
];

// Account Registration — public-facing "Request Access" form. No password is
// collected here; an admin sets the account's initial password when
// approving the request (see UserManagement.jsx's ApproveRequestModal).
// Submits a signed request letter (PDF) alongside the applicant's details —
// see server.js's POST /request-account.
export default function Register() {
  const authModalsRef = useRef(null);
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [municipalities, setMunicipalities] = useState([]);
  const [contactNumber, setContactNumber] = useState("");
  const [position, setPosition] = useState("");
  const [positionIsOther, setPositionIsOther] = useState(false);
  const [requestLetterFile, setRequestLetterFile] = useState(null);
  const [additionalRemarks, setAdditionalRemarks] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    getMunicipalities()
      .then((data) => setMunicipalities(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Could not load municipalities:", err.message));
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = "#f0f7ff";
    e.currentTarget.style.borderColor = "#0077B6";
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = "";
    e.currentTarget.style.borderColor = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = "";
    e.currentTarget.style.borderColor = "";

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setRequestLetterFile(files[0]);
    }
  };

  const handlePositionChange = (e) => {
    const value = e.target.value;
    if (value === "Others") {
      setPositionIsOther(true);
      setPosition("");
    } else {
      setPositionIsOther(false);
      setPosition(value);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setRequestLetterFile(files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!fullName || !email || !municipalityId || !contactNumber || !position) {
      const msg = "All fields are required, including your municipality";
      await showError(msg);
      setError(msg);
      return;
    }

    if (!isValidEmail(email)) {
      const msg = "Please enter a valid email address";
      await showError(msg);
      setError(msg);
      return;
    }

    if (!isValidPhilippineMobile(contactNumber)) {
      const msg = "Contact number must be a valid PH mobile number (e.g. 09171234567 or +639171234567)";
      await showError(msg);
      setError(msg);
      return;
    }

    if (!requestLetterFile) {
      const msg = "Please attach your signed request letter (PDF)";
      await showError(msg);
      setError(msg);
      return;
    }

    if (
      requestLetterFile.type !== "application/pdf" &&
      !requestLetterFile.name.toLowerCase().endsWith(".pdf")
    ) {
      const msg = "Request letter must be a PDF file";
      await showError(msg);
      setError(msg);
      return;
    }

    setLoading(true);
    try {
      await showLoading("Submitting request...", 1500);

      const formData = new FormData();
      formData.append("username", fullName);
      formData.append("email", email);
      formData.append("municipality_id", municipalityId);
      formData.append("contact_number", contactNumber);
      formData.append("position", position);
      formData.append("request_letter", requestLetterFile);
      formData.append("additional_remarks", additionalRemarks);

      const res = await requestAccount(formData);

      if (res.error) {
        await showError(res.error);
        setError(res.error);
      } else if (res.message) {
        await showSuccess(
          "Request submitted!<br/><small>An administrator will review your request, and you'll receive an email if it's approved. You'll be able to log in at that point.</small>"
        );
        navigate("/request-account");
      } else {
        await showError("Unexpected response from server.");
        setError("Unexpected response from server.");
      }
    } catch (err) {
      console.error("Account request error:", err);
      await showError("Request failed. Please try again.");
      setError("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <IndexNavBar
        onLoginClick={() => authModalsRef.current?.openLogin()}
        showMiddleNav={true}
      />

      <div className="register-apply-container">
        <div className="register-card">
          <h1 className="request-account-heading">Account Registration</h1>
          <p className="register-apply-subtitle">
            Complete the form below to request a DagatScan Bataan account. Your request will be
            reviewed by the DENR-Bataan Administrator.
          </p>

          <div className="register-section-divider" />

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
          <h2 className="register-section-title">Personal Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter official email"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Municipal DENR Office *</label>
              <select
                className="form-input"
                value={municipalityId}
                onChange={(e) => setMunicipalityId(e.target.value)}
                disabled={loading}
              >
                <option value="">Select municipality</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Contact Number *</label>
              <input
                className="form-input"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value.replace(/[^\d+]/g, ""))}
                placeholder="e.g. 09171234567"
                maxLength={13}
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Position / Designation *</label>
              <select
                className="form-input"
                value={positionIsOther ? "Others" : position}
                onChange={handlePositionChange}
                disabled={loading}
              >
                <option value="">Select position</option>
                {POSITION_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {positionIsOther && (
                <input
                  className="form-input"
                  style={{ marginTop: 8 }}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Enter your position or designation"
                  disabled={loading}
                />
              )}
            </div>
          </div>

          <div className="register-section-divider" />

          <h2 className="register-section-title">Request Letter</h2>
          <label className="form-label">Upload Request Letter *</label>
          <div
            className="upload-drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf"
              onChange={handleFileSelect}
            />
            {requestLetterFile ? (
              <div className="file-selected-display">
                <div className="file-icon">✓</div>
                <p className="file-name">{requestLetterFile.name}</p>
                <p className="file-size">{(requestLetterFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="file-placeholder">
                <p className="placeholder-primary">Drag & Drop Files Here</p>
                <p className="placeholder-secondary">or Click to Upload</p>
                <p className="placeholder-secondary">PDF only (max 5MB)</p>
              </div>
            )}
          </div>

          <div className="register-section-divider" />

          <div className="form-group">
            <label className="form-label">Additional Remarks (Optional)</label>
            <textarea
              className="form-textarea"
              value={additionalRemarks}
              onChange={(e) => setAdditionalRemarks(e.target.value)}
              placeholder="Enter any additional information (Optional)"
              disabled={loading}
            />
          </div>

          <button className="form-btn" type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit Request"}
          </button>
          </form>
        </div>
      </div>

      <SiteFooter />

      <AuthModals ref={authModalsRef} />
    </div>
  );
}
