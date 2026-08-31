import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip } from "primereact/tooltip";
import { useAuth } from "../contexts/useAuth";
import "../pages/styles/app-sidebar.css";

const MAIN_ITEMS = [
  { path: "/home", label: "Dashboard", icon: "pi-home", roles: ["municipal", "admin", "superadmin"] },
  { path: "/coastalmonitoring", label: "Coastal Monitoring", icon: "pi-map" },
  { path: "/erosion-analysis", label: "Erosion Analysis", icon: "pi-chart-line" },
  { path: "/reports", label: "Reports", icon: "pi-file" },
  { path: "/coastal-awareness", label: "Coastal Awareness", icon: "pi-book" },
];

const ADMIN_ITEMS = [
  { path: "/admin/data-upload", label: "Data Upload", icon: "pi-cloud-upload", roles: ["admin", "superadmin"] },
  { path: "/admin/data-management", label: "Data Management", icon: "pi-database", roles: ["admin", "superadmin"] },
  { path: "/validation", label: "Accuracy Report", icon: "pi-verified", roles: ["admin", "superadmin"] },
  { path: "/admin/user-management", label: "User Management", icon: "pi-users", roles: ["superadmin"] },
  { path: "/admin/audit-trail", label: "Audit Trail", icon: "pi-history", roles: ["superadmin"] },
];

const FOOTER_LINKS = [
  { path: "/terms-of-service", label: "Terms of Service" },
  { path: "/privacy-policy", label: "Privacy Policy" },
  { path: "/contact-us", label: "Contact Us" },
];

const PIN_KEY = "dagatscan_sidebar_pinned";

function allowed(item, role) {
  if (!item.roles) return true;
  return role ? item.roles.includes(role) : false;
}

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roles } = useAuth();

  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(PIN_KEY) === "true";
    } catch {
      return false;
    }
  });

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PIN_KEY, String(next));
      } catch {
        // storage unavailable — the toggle still works for this session
      }
      return next;
    });
  }, []);

  // Landing page has its own chrome
  if (location.pathname === "/" || location.pathname === "/index") return null;

  const mainItems = MAIN_ITEMS.filter((item) => allowed(item, roles));
  const adminItems = ADMIN_ITEMS.filter((item) => allowed(item, roles));

  // Class kept for the drawer/hover rules in layout.css + responsive-shell.css
  const shellClass = adminItems.length > 0 ? "admin-sidebar" : "map-sidebar";

  const renderItem = (item) => {
    const isActive = location.pathname === item.path;
    return (
      <li key={item.path}>
        <button
          type="button"
          className={`app-sidebar-item ${isActive ? "active" : ""}`}
          onClick={() => navigate(item.path)}
          aria-current={isActive ? "page" : undefined}
          aria-label={item.label}
          data-pr-tooltip={item.label}
          data-pr-position="right"
        >
          <span className="app-sidebar-rail" aria-hidden="true" />
          <i className={`pi ${item.icon} app-sidebar-icon`} aria-hidden="true" />
          <span className="app-sidebar-label">{item.label}</span>
        </button>
      </li>
    );
  };

  return (
    <nav
      className={`${shellClass} app-sidebar ${pinned ? "pinned" : ""}`}
      aria-label="Main navigation"
    >
      <Tooltip target=".app-sidebar-item" showDelay={250} disabled={pinned} />

      <div className="sidebar-content app-sidebar-scroll">
        <ul className="app-sidebar-group">{mainItems.map(renderItem)}</ul>

        {adminItems.length > 0 && (
          <>
            <p className="app-sidebar-group-label">Admin Controls</p>
            <ul className="app-sidebar-group">{adminItems.map(renderItem)}</ul>
          </>
        )}
      </div>

      <div className="app-sidebar-bottom">
        <button
          type="button"
          className="app-sidebar-pin"
          onClick={(e) => {
            togglePin();
            e.currentTarget.blur();
          }}
          aria-pressed={pinned}
          aria-label={pinned ? "Collapse menu" : "Keep menu open"}
          title={pinned ? "Collapse menu" : "Keep menu open"}
        >
          <i className={`pi ${pinned ? "pi-angle-double-left" : "pi-angle-double-right"}`} aria-hidden="true" />
          <span className="app-sidebar-label">{pinned ? "Collapse menu" : "Keep menu open"}</span>
        </button>

        <div className="app-sidebar-footer">
          {FOOTER_LINKS.map((link) => (
            <button
              key={link.path}
              type="button"
              className="app-sidebar-footer-link"
              onClick={() => navigate(link.path, { state: { from: "system" } })}
            >
              {link.label}
            </button>
          ))}
          <p className="app-sidebar-copyright">© 2026 DagatScan Bataan</p>
        </div>
      </div>
    </nav>
  );
}
