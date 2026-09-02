import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import AuthModals from "../components/AuthModals";
import MagneticButton from "../components/MagneticButton";
import SiteFooter from "../components/SiteFooter";
import IndexNavBar from "./indexNavBar";
import { useAuth } from "../contexts/useAuth";
import "./index-organized.css";

// Same fixed shoreline colors as the live Erosion Analysis map's
// ErosionLegend.jsx and the generated PDF report (backend/routes/reports.js)
// use, so these previews match what the app/PDF actually show.
const SHORELINE_COLORS = {
  previous: "#FFEA00",
  current: "#FF3131",
  predicted: "#7CFC00",
  erosion: "#fc4c00",
};

const FEATURES = [
  {
    index: "01",
    icon: "pi pi-map",
    title: "View Coastline",
    text: "Compare past and present coastlines from satellite-derived shoreline data.",
    mockup: "coastline",
  },
  {
    index: "02",
    icon: "pi pi-chart-line",
    title: "Predict Erosion",
    text: "Project future shoreline positions with confidence bounds and validated accuracy.",
    mockup: "predict",
  },
  {
    index: "03",
    icon: "pi pi-file-export",
    title: "Generate Reports",
    text: "Download per-municipality erosion assessment reports and open data.",
    mockup: "reports",
  },
];

// Real Esri satellite map crops with actual shoreline_zones geometry (area
// 21, "Bagac Testing", years 2015/2026) baked in via the same
// renderShorelineMap pipeline the PDF report itself uses — generated once
// (see gen-mockup-maps2.js, not part of the app) rather than re-rendered
// live, since this is a static marketing preview, not a data view.
function ShorelineMapMockup({ src, legend }) {
  return (
    <div className="ds-mockup-map">
      <div className="ds-mockup-map-box">
        <img src={src} alt="" className="ds-mockup-map-img" />
      </div>
      <div className="ds-mockup-map-legend">
        {legend.map((item) => (
          <div key={item.label} className="ds-mockup-map-legend-item">
            <span className="ds-mockup-map-legend-swatch" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureMockup({ id }) {
  if (id === "coastline") {
    return (
      <ShorelineMapMockup
        src="/mockup-coastline-map.png"
        legend={[
          { color: SHORELINE_COLORS.previous, label: "Previous Shoreline" },
          { color: SHORELINE_COLORS.current, label: "Current Shoreline" },
          { color: SHORELINE_COLORS.erosion, label: "Erosion Area" },
        ]}
      />
    );
  }
  if (id === "predict") {
    return (
      <ShorelineMapMockup
        src="/mockup-predict-map.png"
        legend={[
          { color: SHORELINE_COLORS.current, label: "Current Shoreline" },
          { color: SHORELINE_COLORS.predicted, label: "Predicted Shoreline" },
        ]}
      />
    );
  }
  return (
    <div className="ds-mockup-pdf-card">
      <div className="ds-mockup-report-header">
        <i className="pi pi-file-pdf" aria-hidden="true" />
        Bagac_Erosion_Report.pdf
      </div>
      <div className="ds-mockup-report-line" style={{ width: "88%" }} />
      <div className="ds-mockup-report-line" style={{ width: "64%" }} />
      <div className="ds-mockup-report-row">
        <span className="ds-mockup-report-pill">HIGH RISK</span>
        <div className="ds-mockup-report-line" style={{ width: "40%", margin: 0 }} />
      </div>
    </div>
  );
}

const READOUTS = [
  { value: "12", unit: "municipalities", label: "Coastline under survey" },
  { value: "2015", unit: "baseline", label: "First imagery epoch" },
  { value: "10 m", unit: "resolution", label: "Sentinel-2 pixel size" },
  { value: "\u00b195%", unit: "interval", label: "Prediction confidence" },
];

export default function Index() {
  const authModalsRef = useRef(null);
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const activeFeature = FEATURES[activeFeatureIndex];

  useEffect(() => {
    if (isLoggedIn) navigate("/home");
  }, [isLoggedIn, navigate]);

  return (
    <div className="ds-landing font-sans">
      <IndexNavBar
        onLoginClick={() => authModalsRef.current?.openLogin()}
        onRegisterClick={() => navigate("/request-account")}
        onForgotPasswordClick={() => authModalsRef.current?.openForgotPassword()}
        showMiddleNav={true}
      />

      <section
        id="home"
        className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-6"
        style={{ backgroundImage: "url('/tempoBG.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="ds-hero-wash absolute inset-0" />
        <div className="ds-hero-grid absolute inset-0" />
        <div className="relative mx-auto max-w-3xl py-24 text-center text-white">
          <span className="ds-eyebrow">
            <span className="ds-eyebrow-dot" />
            Coastal Monitoring for Bataan
          </span>
          <h1 className="ds-hero-title">
            DagatScan <span className="ds-hero-accent">Bataan</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/85 sm:text-lg">
            A coastal erosion visualization and awareness system — satellite-derived
            shorelines, validated predictions, and risk assessments for all 12 coastal
            municipalities.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <MagneticButton
              onClick={() => navigate("/coastalmonitoring")}
              className="ds-cta ds-cta-primary"
            >
              <i className="pi pi-map-marker" aria-hidden="true" />
              Explore Map
            </MagneticButton>
          </div>
        </div>
        <div className="ds-hero-fade" aria-hidden="true" />
      </section>

      <section className="ds-readout-band" aria-label="Survey parameters">
        <div className="ds-readout-inner">
          {READOUTS.map((r) => (
            <div className="ds-readout" key={r.label}>
              <span className="ds-readout-value">{r.value}</span>
              <span className="ds-readout-unit">{r.unit}</span>
              <span className="ds-readout-label">{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl px-6 py-16 md:py-20">
        <p className="ds-section-kicker">What the system does</p>
        <h2 className="ds-section-title">Core Features</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">
          From raw satellite imagery to defensible shoreline-change insight.
        </p>
        <div className="ds-feature-showcase mt-10">
          <div className="ds-feature-list" role="tablist" aria-label="Core features">
            {FEATURES.map((f, i) => (
              <button
                key={f.title}
                type="button"
                role="tab"
                aria-selected={i === activeFeatureIndex}
                className={`ds-feature-tab${i === activeFeatureIndex ? " ds-feature-tab-active" : ""}`}
                onClick={() => setActiveFeatureIndex(i)}
              >
                <span className="ds-feature-tab-icon">
                  <i className={f.icon} aria-hidden="true" />
                </span>
                <span className="ds-feature-tab-copy">
                  <span className="ds-feature-tab-title">
                    <span className="ds-feature-tab-index">{f.index}</span>
                    {f.title}
                  </span>
                  <span className="ds-feature-tab-text">{f.text}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="ds-feature-preview">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="ds-feature-preview-panel"
                role="tabpanel"
              >
                <FeatureMockup id={activeFeature.mockup} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section
        id="about"
        className="relative overflow-hidden px-6 py-20"
        style={{ backgroundImage: "url('/tempoaboutBG.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="ds-about-wash absolute inset-0" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="ds-section-kicker ds-on-dark">Mission</p>
          <h2 className="ds-section-title ds-on-dark">About DagatScan Bataan</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-white/80">
            Our goal is to promote coastal awareness and support coastal monitoring in
            Bataan by providing a clear and accessible system for visualizing coastal
            erosion and changes over time.
          </p>
        </div>
      </section>

      <SiteFooter />

      <AuthModals ref={authModalsRef} />
    </div>
  );
}
