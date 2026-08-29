import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import IndexNavBar from "./indexNavBar";
import Layout from "../components/Layout";
import { StaticPageShell, StaticPageSection } from "../components/StaticPageShell";
import "./styles/footer.css";
import "./styles/requestAccount.css";

export default function PolicyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const authModalsRef = useRef(null);

  // System chrome for logged-in users, or guests arriving via a sidebar
  // footer link (state.from === "system") rather than the public index.
  const token = localStorage.getItem("token");
  const useSystemChrome = !!token || location.state?.from === "system";

  const content = (
    <>
      <StaticPageShell title="Privacy Policy">
        <StaticPageSection icon="/database.png" title="Data Collection">
          <p>
            The system may collect basic user information such as account credentials for
            authentication and access to system features.
          </p>
        </StaticPageSection>
        <StaticPageSection icon="/database-usage.png" title="Data Usage">
          <p>
            Collected information is used solely for system functionality, including user account
            management, authentication, and access control.
          </p>
        </StaticPageSection>
        <StaticPageSection icon="/data-sharing.png" title="Data Sharing">
          <p>
            The system does not collect sensitive personal data and does not share user
            information with external parties.
          </p>
        </StaticPageSection>
        <StaticPageSection icon="/data-collection.png" title="System Data Sources">
          <p>
            Coastal data used in the system, including maps and satellite images, are sourced
            from authorized or publicly available datasets such as:
          </p>
          <ul className="list-disc pl-6">
            <li>DENR - Bataan</li>
          </ul>
        </StaticPageSection>
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
                <h4 className="footer-chip-heading">Data Sources</h4>
                <ul>
                  <li>DENR - Bataan</li>
                </ul>
              </div>
            </div>

            <div className="footer-column footer-right">
              <h4 className="footer-chip-heading">Legal &amp; Information</h4>
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
    <div className="ds-landing font-sans">
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
