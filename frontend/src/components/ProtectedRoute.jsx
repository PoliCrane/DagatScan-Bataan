import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function ProtectedRoute({ allowedRoles = null, children }) {
  const { isLoggedIn, roles } = useAuth();

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(roles)) {
    return <Navigate to="/coastalmonitoring" replace />;
  }

  return children;
}
