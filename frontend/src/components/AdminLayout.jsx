import Navbar from "../pages/navbar";
import AppSidebar from "../components/AppSidebar";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../contexts/useAuth";
import "../pages/styles/responsive-shell.css";

export default function AdminLayout({ children }) {
  const location = useLocation();
  const { username } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPath, setLastPath] = useState(location.pathname);

  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setDrawerOpen(false);
  }

  return (
    <div className={`layout-container ${drawerOpen ? "drawer-open" : ""}`}>
      <Navbar username={username || "Admin"} isLoggedIn={true} />
      <button
        type="button"
        aria-label={drawerOpen ? "Close menu" : "Open menu"}
        onClick={() => setDrawerOpen((open) => !open)}
        className="md:hidden fixed left-3 top-[58px] z-1001 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white shadow-raised"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {drawerOpen ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      {drawerOpen && (
        <div className="drawer-backdrop md:hidden" onClick={() => setDrawerOpen(false)} />
      )}
      <div className="layout-content">
        <AppSidebar />
        <div className="layout-main" key={location.pathname}>
          {children}
        </div>
      </div>
    </div>
  );
}
