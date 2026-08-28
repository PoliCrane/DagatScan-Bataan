import { useNavigate } from "react-router-dom";

// Shared footer used by both the landing page (index.jsx) and the Request
// an Account page (requestAccount.jsx) so it isn't duplicated across the two.
export default function SiteFooter() {
  const navigate = useNavigate();

  return (
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
  );
}
