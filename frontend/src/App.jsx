import {BrowserRouter,Routes,Route} from "react-router-dom";
import { lazy, Suspense } from "react";
import { PrimeReactProvider } from "primereact/api";

import NdwiGenerationWidget from "./components/NdwiGenerationWidget";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { NdwiGenerationProvider } from "./contexts/NdwiGenerationContext";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/index";

const Home = lazy(() => import("./pages/Home"));
const MapPage = lazy(() => import("./pages/coastalmonitoring"));
const ErosionAnalysis = lazy(() => import("./pages/erosionanalysis"));
const Reports = lazy(() => import("./pages/Reports"));
const CoastalAwareness = lazy(() => import("./pages/CoastalAwareness"));
const DataUpload = lazy(() => import("./pages/admin/DataUpload"));
const DataManagement = lazy(() => import("./pages/admin/DataManagement"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const AuditTrail = lazy(() => import("./pages/admin/AuditTrail"));
const PolicyPage = lazy(() => import("./pages/PolicyPage"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const RequestAccount = lazy(() => import("./pages/requestAccount"));
const Register = lazy(() => import("./pages/register"));
const ValidationReport = lazy(() => import("./pages/ValidationReport"));
const StyleGuide = lazy(() => import("./pages/StyleGuide"));

const PRIME_CONFIG = { ripple: true, inputStyle: "outlined" };

const pageFallback = (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#0077B6", fontFamily: "sans-serif" }}>
    Loading...
  </div>
);

export default function App(){

return(

<>

<PrimeReactProvider value={PRIME_CONFIG}>
<ErrorBoundary>
<AuthProvider>
<NdwiGenerationProvider>
<BrowserRouter>

<Suspense fallback={pageFallback}>
<Routes>

<Route path="/" element={<Index/>}/>
<Route path="/index" element={<Index/>}/>
<Route path="/home" element={
  <ProtectedRoute allowedRoles={["municipal","admin","superadmin"]}><Home/></ProtectedRoute>
}/>
<Route path="/coastalmonitoring" element={<MapPage/>}/>
<Route path="/erosion-analysis" element={<ErosionAnalysis/>}/>
<Route path="/reports" element={<Reports/>}/>
<Route path="/validation" element={<ValidationReport/>}/>
{import.meta.env.DEV && <Route path="/style-guide" element={<StyleGuide/>}/>}
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
</Suspense>

<NdwiGenerationWidget/>

</BrowserRouter>
</NdwiGenerationProvider>
</AuthProvider>
</ErrorBoundary>
</PrimeReactProvider>

</>

)

}
