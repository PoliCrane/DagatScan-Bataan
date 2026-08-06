import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import IndexNavBar from "./indexNavBar";
import Layout from "../components/Layout";
import "./styles/footer-pages.css";
import "./styles/footer.css";

export default function TermsOfService() {
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
            <h1>Terms of Service</h1>
          </div>

          <div className="footer-page-content">
            <div className="introduction">
              <h2>Introduction</h2>
              <p>
                DagatScan Bataan is a web-based coastal erosion visualization and awareness system developed
                for academic and research purposes.
              </p>
            </div>

            <section className="footer-page-section">
              <div className="section-header">
                <img src="/analytics.png" alt="Usage Icon" className="section-icon" />
                <h3>Use of the System</h3>
              </div>
              <p>
                The system provides coastal erosion data visualization for informational, educational, and
                research purposes only. All outputs are intended to support understanding of coastal
                conditions and should not be used as the sole basis for official decision-making.
              </p>
            </section>

            <section className="footer-page-section">
              <div className="section-header">
                <img src="/bar-chart.png" alt="Data Icon" className="section-icon" />
                <h3>Data and Outputs</h3>
              </div>
              <p>
                All system outputs, including maps, statistics, simulations, and reports, are generated based
                on available datasets. Results may vary depending on the quality and availability of historical
                maps and satellite imagery used in the system.
              </p>
            </section>

            <section className="footer-page-section">
              <div className="section-header">
                <img src="/userresponsibility.png" alt="Responsibility Icon" className="section-icon" />
                <h3>User Responsibility</h3>
              </div>
              <p>
                Users are responsible for the interpretation and use of the information provided. The system
                does not replace official assessments or field-based evaluations conducted by authorized
                agencies.
              </p>
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
