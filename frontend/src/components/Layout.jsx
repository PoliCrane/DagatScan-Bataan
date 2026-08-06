import Navbar from "../pages/navbar";
import MapSidebar from "../components/MapSidebar";
import AdminSidebar from "../components/AdminSidebar";
import MunicipalSidebar from "../components/MunicipalSidebar";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Layout({ children }) {
  const location = useLocation();
  const [username, setUsername] = useState("User");
  const [sidebarTier, setSidebarTier] = useState("public");
  const isLoggedIn = !!localStorage.getItem("token");

  useEffect(() => {
    // Get username from localStorage or set default
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }

    const userRole = localStorage.getItem("roles");
    if (userRole === "admin" || userRole === "superadmin") {
      setSidebarTier("admin");
    } else if (userRole === "municipal") {
      setSidebarTier("municipal");
    } else {
      setSidebarTier("public");
    }
  }, []);

  return (
    <div className="layout-container">
      <Navbar username={username} isLoggedIn={isLoggedIn} />
      <div className="layout-content">
        {sidebarTier === "admin" && <AdminSidebar />}
        {sidebarTier === "municipal" && <MunicipalSidebar />}
        {sidebarTier === "public" && <MapSidebar />}
        <div className="layout-main" key={location.pathname}>
          {children}
        </div>
      </div>
    </div>
  );
}
