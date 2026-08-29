import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import IndexNavBar from "./indexNavBar";
import Layout from "../components/Layout";
import { StaticPageShell, StaticPageSection } from "../components/StaticPageShell";
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
      <StaticPageShell title="Terms of Service">
        <div className="mb-6 rounded-card bg-primary/5 p-5 md:p-6">
          <h2 className="m-0 mb-2 font-sans text-xl font-bold text-navy">Introduction</h2>
          <p className="m-0 text-[15px] leading-relaxed text-muted">
            DagatScan Bataan is a web-based coastal erosion visualization and awareness system developed
            for academic and research purposes.
          </p>
        </div>
        <StaticPageSection icon="/analytics.png" title="Use of the System">
          <p>
            The system provides coastal erosion data visualization for informational, educational, and
            research purposes only. All outputs are intended to support understanding of coastal
            conditions and should not be used as the sole basis for official decision-making.
          </p>
        </StaticPageSection>
        <StaticPageSection icon="/bar-chart.png" title="Data and Outputs">
          <p>
            All system outputs, including maps, statistics, simulations, and reports, are generated based
            on available datasets. Results may vary depending on the quality and availability of historical
            maps and satellite imagery used in the system.
          </p>
        </StaticPageSection>
        <StaticPageSection icon="/userresponsibility.png" title="User Responsibility">
          <p>
            Users are responsible for the interpretation and use of the information provided. The system
            does not replace official assessments or field-based evaluations conducted by authorized
            agencies.
          </p>
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
