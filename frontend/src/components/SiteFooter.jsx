import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

// shared by index.jsx and requestAccount.jsx to avoid duplicating the footer
export default function SiteFooter() {
  const navigate = useNavigate();

  return (
    <motion.footer
      className="footer"
      // opacity-only: a transform here would inflate the page's scrollHeight while off-screen
      // (this is the last element), flashing a scrollbar that "fixes itself" once whileInView fires
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
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
              <li>Google Earth Engine (Sentinel-2 / Landsat)</li>
              <li>NOAA IBTrACS</li>
              <li>NOAA CPC ONI</li>
              <li>Open-Meteo Marine Archive</li>
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
    </motion.footer>
  );
}
