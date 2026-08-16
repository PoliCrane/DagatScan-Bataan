import {BrowserRouter,Routes,Route} from "react-router-dom";

import MobileBlockOverlay from "./components/MobileBlockOverlay";
import NdwiGenerationWidget from "./components/NdwiGenerationWidget";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { NdwiGenerationProvider } from "./contexts/NdwiGenerationContext";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/index";
import Home from "./pages/Home";
import MapPage from "./pages/coastalmonitoring";
import ErosionAnalysis from "./pages/erosionanalysis";
import Reports from "./pages/Reports";
import CoastalAwareness from "./pages/CoastalAwareness";
import DataUpload from "./pages/admin/DataUpload";
import DataManagement from "./pages/admin/DataManagement";
import UserManagement from "./pages/admin/UserManagement";
import AuditTrail from "./pages/admin/AuditTrail";
import PolicyPage from "./pages/PolicyPage";
import TermsOfService from "./pages/TermsOfService";
import ContactUs from "./pages/ContactUs";
import RequestAccount from "./pages/requestAccount";
import Register from "./pages/register";

export default function App(){

return(

<>

<MobileBlockOverlay/>

<ErrorBoundary>
<AuthProvider>
<NdwiGenerationProvider>
<BrowserRouter>

<Routes>

<Route path="/" element={<Index/>}/>
<Route path="/index" element={<Index/>}/>
<Route path="/home" element={
  <ProtectedRoute allowedRoles={["municipal","admin","superadmin"]}><Home/></ProtectedRoute>
}/>
<Route path="/coastalmonitoring" element={<MapPage/>}/>
<Route path="/erosion-analysis" element={<ErosionAnalysis/>}/>
<Route path="/reports" element={<Reports/>}/>
<Route path="/coastal-awareness" element={<CoastalAwareness/>}/>
<Route path="/admin/data-upload" element={
  <ProtectedRoute allowedRoles={["admin","superadmin"]}><DataUpload/></ProtectedRoute>
}/>
<Route path="/admin/data-management" element={
  <ProtectedRoute allowedRoles={["admin","superadmin"]}><DataManagement/></ProtectedRoute>
}/>
<Route path="/admin/user-management" element={
  <ProtectedRoute allowedRoles={["superadmin"]}><UserManagement/></ProtectedRoute>
}/>
<Route path="/admin/audit-trail" element={
  <ProtectedRoute allowedRoles={["superadmin"]}><AuditTrail/></ProtectedRoute>
}/>
<Route path="/privacy-policy" element={<PolicyPage/>}/>
<Route path="/terms-of-service" element={<TermsOfService/>}/>
<Route path="/contact-us" element={<ContactUs/>}/>
<Route path="/request-account" element={<RequestAccount/>}/>
<Route path="/request-account/apply" element={<Register/>}/>

</Routes>

<NdwiGenerationWidget/>

</BrowserRouter>
</NdwiGenerationProvider>
</AuthProvider>
</ErrorBoundary>

</>

)

}
