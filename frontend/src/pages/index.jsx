import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import SiteFooter from "../components/SiteFooter";
import IndexNavBar from "./indexNavBar";
import "./index-organized.css";

export default function Index() {
  const authModalsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate("/home");
  }, [navigate]);

  return (
    <div>
      <IndexNavBar
        onLoginClick={() => authModalsRef.current?.openLogin()}
        onRegisterClick={() => navigate("/request-account")}
        onForgotPasswordClick={() => authModalsRef.current?.openForgotPassword()}
        showMiddleNav={true}
      />

      <div id="home" className="IndexBG" style={{ backgroundImage: "url('/tempoBG.jpg')" }}>

        <h1>DagatScan <span>Bataan</span></h1>
        <p>
          A Coastal Erosion Visualization & Awareness System
        </p>
        <button onClick={() => navigate("/coastalmonitoring")}>
          Explore Map
        </button>
      </div>

      <div id="features" className="core-features">
        <h2>Core Features</h2>
        <div className="features-container">
          <div className="feature-card">
            <div className="feature-card-logo">
              <img src="/corefeature1.png" alt="Core Feature 1  " className="navbar-logo" />
            </div>
            <div className="feature-card-content">
              <h3>View Coastline</h3>
              <p>Compare Past and Present Coastlines</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-logo">
              <img src="/corefeature2.png" alt="Core Feature 2" className="navbar-logo" />
            </div>
            <div className="feature-card-content">
              <h3>Predict Erosion</h3>
              <p>Forecast future Coastal Erosion</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-logo">
              <img src="/corefeature3.png" alt="Core Feature 3" className="navbar-logo" />
            </div>
            <div className="feature-card-content">
              <h3>Generate Reports</h3>
              <p>Download Erosion Reports</p>
            </div>
          </div>
        </div>
      </div>

        <br />
          <br />

      <div id="about" className="about-dagatscan" style={{ backgroundImage: "url('/tempoaboutBG.jpg')" }}>
        <h1>About DagatScan Bataan</h1>
        <p>
          Our goal is to promote coastal awareness and support coastal monitoring in Bataan 
          by providing a clear and accessible system for visualizing coastal erosion and 
          changes over time.
        </p>
      </div>

      <SiteFooter />

      <AuthModals ref={authModalsRef} />
    </div>
  );
}
