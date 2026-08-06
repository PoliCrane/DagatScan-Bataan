import { useNavigate, useLocation } from "react-router-dom";

export default function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperadmin = localStorage.getItem("roles") === "superadmin";

  // Hide sidebar only on index/landing page
  if (location.pathname === "/" || location.pathname === "/index") {
    return null;
  }

  // Determine active button based on current location
  const isActive = (path) => location.pathname === path;

  return (
    <div className="admin-sidebar">
      <div className="sidebar-content">
        <div className="sidebar-section">
          <button className={`sidebar-item ${isActive("/home") ? "active" : ""}`} onClick={() => navigate("/home")} title="Dashboard">
            <img src="/dashboard.png" alt="Dashboard" className="sidebar-icon" />
            <span>Dashboard</span>
          </button>
          <button className={`sidebar-item ${isActive("/coastalmonitoring") ? "active" : ""}`} onClick={() => navigate("/coastalmonitoring")} title="Coastal Monitoring">
            <img src="/coastalmonitoring.png" alt="Coastal Monitoring" className="sidebar-icon" />
            <span>Coastal Monitoring</span>
          </button>
          <button className={`sidebar-item ${isActive("/erosion-analysis") ? "active" : ""}`} onClick={() => navigate("/erosion-analysis")} title="Erosion Analysis">
            <img src="/erosionanalysis.png" alt="Erosion Analysis" className="sidebar-icon" />
            <span>Erosion Analysis</span>
          </button>
          <button className={`sidebar-item ${isActive("/reports") ? "active" : ""}`} onClick={() => navigate("/reports")} title="Reports">
            <img src="/report.png" alt="Reports" className="sidebar-icon" />
            <span>Reports</span>
          </button>
          <button className={`sidebar-item ${isActive("/coastal-awareness") ? "active" : ""}`} onClick={() => navigate("/coastal-awareness")} title="Coastal Awareness">
            <img src="/educational.png" alt="Coastal Awareness" className="sidebar-icon" />
            <span>Coastal Awareness</span>
          </button>
        </div>

        {/* Admin Controls Section */}
        <div className="admin-controls-section">
          <div className="admin-controls-title">Admin Controls</div>
          <div className="sidebar-section">
            <button 
              className={`sidebar-item ${isActive("/admin/data-upload") ? "active" : ""}`} 
              onClick={() => navigate("/admin/data-upload")} 
              title="Data Upload"
            >
              <img src="/upload-icon.png" alt="Data Upload" className="sidebar-icon" />
              <span>Data Upload</span>
            </button>
            
            <button
              className={`sidebar-item ${isActive("/admin/data-management") ? "active" : ""}`}
              onClick={() => navigate("/admin/data-management")}
              title="Data Management"
            >
              <img src="/datamanage.png" alt="Data Management" className="sidebar-icon" />
              <span>Data Management</span>
            </button>

            {isSuperadmin && (
              <button
                className={`sidebar-item ${isActive("/admin/user-management") ? "active" : ""}`}
                onClick={() => navigate("/admin/user-management")}
                title="User Management"
              >
                <img src="/user-management-icon.png" alt="User Management" className="sidebar-icon" />
                <span>User Management</span>
              </button>
            )}

            {isSuperadmin && (
              <button
                className={`sidebar-item ${isActive("/admin/audit-trail") ? "active" : ""}`}
                onClick={() => navigate("/admin/audit-trail")}
                title="Audit Trail"
              >
                <img src="/auditlog.png" alt="Audit Trail" className="sidebar-icon" />
                <span>Audit Trail</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-links">
          <button onClick={() => navigate("/terms-of-service", { state: { from: "system" } })} className="footer-link-button">Terms of Service</button>
          <button onClick={() => navigate("/privacy-policy", { state: { from: "system" } })} className="footer-link-button">Privacy Policy</button>
          <button onClick={() => navigate("/contact-us", { state: { from: "system" } })} className="footer-link-button">Contact Us</button>
        </div>
        <div className="sidebar-footer-copyright">
          &copy; 2026 DagatScan Bataan. All rights reserved.
        </div>
      </div>
    </div>
  );
}
