import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./index-organized.css";
import ChangePasswordModal from "../components/ChangePasswordModal";
import AuthModals from "../components/AuthModals";
import { useAuth } from "../contexts/useAuth";

export default function Navbar({ username, isLoggedIn }){
  const navigate = useNavigate();
  const auth = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const authModalsRef = useRef(null);

  const logout = () => {
    auth.logout();
    navigate("/index");
  };

  return (
    <div className="main-navbar">
      <div className="main-navbar-brand">
        <img src="/DSLogo.png" alt="DagatScan Bataan Logo" className="main-navbar-logo" />
        <div className="main-navbar-header">
          <h3>DagatScan <span>Bataan</span></h3>
        </div>
      </div>

      <div className="navbar-right">
        <div className="online-status-badge">
          <span className="online-status-dot" />
          Online
        </div>

        {isLoggedIn ? (
          <div className="profile-dropdown-container">
            <button
              className="profile-btn"
              onMouseEnter={() => setShowDropdown(true)}
              onMouseLeave={() => setShowDropdown(false)}
            >
              <img src="/user.png" alt="User Profile" className="profile-icon" />
              <span className="profile-username">{username || "User"}</span>
              <img src="/dropdown.png" alt="Dropdown" className="dropdownprofile" />
            </button>

            {showDropdown && (
              <div
                className="profile-dropdown"
                onMouseEnter={() => setShowDropdown(true)}
                onMouseLeave={() => setShowDropdown(false)}
              >
                <button className="dropdown-item" onClick={() => {
                  setShowPasswordModal(true);
                  setShowDropdown(false);
                }}>
                  <img src="/lock.png" alt="Change Password" className="dropdown-icon" />
                  Change Password
                </button>
                <button className="dropdown-item logout" onClick={logout}>
                  <img src="/logout.png" alt="Logout" className="dropdown-icon" />
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="navbar-actions">
            <button className="navbar-btn" onClick={() => navigate("/")}>
              Back to Main
            </button>
            <button className="navbar-btn2" onClick={() => authModalsRef.current?.openLogin()}>
              Login
            </button>
          </div>
        )}
      </div>

      {isLoggedIn ? (
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          username={username}
        />
      ) : (
        <AuthModals ref={authModalsRef} />
      )}
    </div>
  );
}