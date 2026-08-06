import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import IndexNavBar from "./indexNavBar";
import Layout from "../components/Layout";
import "./styles/footer-pages.css";
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
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <div className="footer-page-header" style={{ backgroundImage: "url('/tempoaboutBG.jpg')" }}>
            <h1>Contact Us</h1>
          </div>

          <div className="footer-page-content">
            <div className="contact-container">
              <h3 className="contact-container-header">Contact Information</h3>

              <div className="contact-item">
                <img src="/email.png" alt="Email" className="contact-icon" />
                <div className="contact-details">
                  <label>Email:</label>
                  <span>dagatscan.bataan@gmail.com</span>
                </div>
              </div>

              <div className="contact-item">
                <img src="/institution.png" alt="Institution" className="contact-icon" />
                <div className="contact-details">
                  <label>Institution:</label>
                  <span>Bataan Peninsula State University</span>
                </div>
              </div>

              <div className="contact-item">
                <img src="/info.png" alt="Note" className="contact-icon" />
                <div className="contact-details">
                  <label>Note:</label>
                  <span>For official coastal data, refer to DENR- Bataan</span>
                </div>
              </div>
            </div>

            <p className="contact-description">
              For official coastal assessments and environmental data validation, users
              are advised to refer to the Department of Environment and Natural
              Resources (DENR) – Bataan.
            </p>
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
