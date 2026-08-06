import Navbar from "../pages/navbar";
import AdminSidebar from "../components/AdminSidebar";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

export default function AdminLayout({ children }) {
  const location = useLocation();
  const [username, setUsername] = useState("Admin");

  useEffect(() => {
    // Get username from localStorage or set default
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  return (
    <div className="layout-container">
      <Navbar username={username} isLoggedIn={true} />
      <div className="layout-content">
        <AdminSidebar />
        <div className="layout-main" key={location.pathname}>
          {children}
        </div>
      </div>
    </div>
  );
}
