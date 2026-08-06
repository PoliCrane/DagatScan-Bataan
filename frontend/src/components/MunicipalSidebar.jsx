import { useNavigate, useLocation } from "react-router-dom";

// Same as AdminSidebar minus Admin Controls (Data Upload/User Management are DENR-PENRO only); reuses admin-sidebar CSS class
export default function MunicipalSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide sidebar only on index/landing page
  if (location.pathname === "/" || location.pathname === "/index") {
    return null;
  }

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
