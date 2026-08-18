import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import IndexNavBar from "./indexNavBar";
import Layout from "../components/Layout";
import { StaticPageShell, StaticPageSection } from "../components/StaticPageShell";
import "./styles/footer.css";

export default function ContactUs() {
  const navigate = useNavigate();
  const location = useLocation();
  const authModalsRef = useRef(null);

  // System chrome for logged-in users, or guests arriving via a sidebar
  // footer link (state.from === "system") rather than the public index.
  const token = localStorage.getItem("token");
  const useSystemChrome = !!token || location.state?.from === "system";

  const content = (
    <>
      <StaticPageShell title="Contact Us">
        <div className="rounded-card border border-line bg-card/60 p-5 md:p-6">
          <h3 className="m-0 mb-4 font-sans text-lg font-bold text-primary md:text-xl">Contact Information</h3>
          {[
            ["/email.png", "Email", "dagatscan.bataan@gmail.com"],
            ["/institution.png", "Institution", "Bataan Peninsula State University"],
            ["/info.png", "Note", "For official coastal data, refer to DENR-Bataan"],
          ].map(([icon, label, value]) => (
            <div key={label} className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
              <img src={icon} alt="" className="h-9 w-9 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-bold uppercase tracking-wide text-faint">{label}</span>
                <span className="break-words text-[15px] text-ink">{value}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-card bg-primary/5 p-5 text-[15px] leading-relaxed text-muted">
          For official coastal assessments and environmental data validation, users
          are advised to refer to the Department of Environment and Natural
          Resources (DENR) – Bataan.
        </p>
      </StaticPageShell>

      {!useSystemChrome && (
        <footer className="footer">
          <div className="footer-content">
            <div className="footer-column footer-left">
              <div className="footer-branding">
                <img src="/DSLogo.png" alt="DagatScan Bataan Logo" className="footer-logo" />
                <div className="dagatscanheader">
                  <h3>DagatScan <span>Bataan</span></h3>
                  <p className="tagline">Empowering coastal awareness and preparedness through technology and data-driven insights.</p>
                </div>
              </div>
              <div className="footer-data-source">
                <h4>Data Sources</h4>
                <ul>
                  <li>DENR - Bataan</li>
                </ul>
              </div>
            </div>

            <div className="footer-column footer-right">
              <h4>Legal & Information</h4>
              <ul className="footer-links">
                <li><button onClick={() => navigate("/terms-of-service")} className="footer-link-btn">Terms of Service</button></li>
                <li><button onClick={() => navigate("/privacy-policy")} className="footer-link-btn">Privacy Policy</button></li>
                <li><button onClick={() => navigate("/contact-us")} className="footer-link-btn">Contact Us</button></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p>&copy; 2026 DagatScan Bataan. All rights reserved.</p>
          </div>
        </footer>
      )}
    </>
  );

  if (useSystemChrome) {
    return <Layout>{content}</Layout>;
  }

  return (
    <div>
      <IndexNavBar
        onLoginClick={() => authModalsRef.current?.openLogin()}
        onRegisterClick={() => navigate("/request-account")}
        onForgotPasswordClick={() => authModalsRef.current?.openForgotPassword()}
        showMiddleNav={true}
      />
      {content}
      <AuthModals ref={authModalsRef} />
    </div>
  );
}
