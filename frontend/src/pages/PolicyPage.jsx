import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import IndexNavBar from "./indexNavBar";
import Layout from "../components/Layout";
import "./styles/footer-pages.css";
import "./styles/footer.css";

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
      <div className="footer-page-wrapper">
        <div className="footer-page-container privacy-policy-container">
          <div className="footer-page-header" style={{ backgroundImage: "url('/tempoaboutBG.jpg')" }}>
            <h1>Privacy Policy</h1>
          </div>

          <div className="footer-page-content">
            <section className="footer-page-section">
              <div className="section-header">
                <img src="/database.png" alt="Data Collection Icon" className="section-icon" />
                <h3>Data Collection</h3>
              </div>
              <p>
                The system may collect basic user information such as account credentials for
                authentication and access to system features.
              </p>
            </section>

            <section className="footer-page-section">
              <div className="section-header">
                <img src="/database-usage.png" alt="Data Usage Icon" className="section-icon" />
                <h3>Data Usage</h3>
              </div>
              <p>
                Collected information is used solely for system functionality, including user account
                management, authentication, and access control.
              </p>
            </section>

            <section className="footer-page-section">
              <div className="section-header">
                <img src="/data-sharing.png" alt="Data Sharing Icon" className="section-icon" />
                <h3>Data Sharing</h3>
              </div>
              <p>
                The system does not collect sensitive personal data and does not share user
                information with external parties.
              </p>
            </section>

            <section className="footer-page-section">
              <div className="section-header">
                <img src="/data-collection.png" alt="Data Sources Icon" className="section-icon" />
                <h3>System Data Sources</h3>
              </div>
              <p>
                Coastal data used in the system, including maps and satellite images, are sourced
                from authorized or publicly available datasets such as:
              </p>
              <ul className="data-sources-list">
                <li>DENR - Bataan</li>
              </ul>
            </section>
          </div>
        </div>
      </div>

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
