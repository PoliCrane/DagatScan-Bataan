import { useNavigate, useLocation } from "react-router-dom";

// Public tier only — Layout.jsx routes admin/superadmin and municipal accounts to their own sidebars
export default function MapSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide sidebar on index page
  if (location.pathname === "/" || location.pathname === "/index") {
    return null;
  }

  // Determine active button based on current location
  const isActive = (path) => location.pathname === path;

  return (
    <div className="map-sidebar">
      <div className="sidebar-content">
        <div className="sidebar-section">
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
