import Navbar from "../pages/navbar";
import MapSidebar from "../components/MapSidebar";
import AdminSidebar from "../components/AdminSidebar";
import MunicipalSidebar from "../components/MunicipalSidebar";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function Layout({ children }) {
  const location = useLocation();
  const { isLoggedIn, username: authUsername, roles } = useAuth();
  const username = authUsername || "User";

  const sidebarTier =
    roles === "admin" || roles === "superadmin"
      ? "admin"
      : roles === "municipal"
      ? "municipal"
      : "public";

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
