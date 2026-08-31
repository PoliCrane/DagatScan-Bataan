import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import SiteFooter from "../components/SiteFooter";
import IndexNavBar from "./indexNavBar";
import { useAuth } from "../contexts/useAuth";
import "./index-organized.css";

const FEATURES = [
  {
    index: "01",
    icon: "pi pi-map",
    title: "View Coastline",
    text: "Compare past and present coastlines from satellite-derived shoreline data.",
  },
  {
    index: "02",
    icon: "pi pi-chart-line",
    title: "Predict Erosion",
    text: "Project future shoreline positions with confidence bounds and validated accuracy.",
  },
  {
    index: "03",
    icon: "pi pi-file-export",
    title: "Generate Reports",
    text: "Download per-municipality erosion assessment reports and open data.",
  },
];

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
            <button
              onClick={() => navigate("/coastalmonitoring")}
              className="ds-cta ds-cta-primary"
            >
              <i className="pi pi-map-marker" aria-hidden="true" />
              Explore Map
            </button>
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
        <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="ds-feature-card"
            >
              <span className="ds-feature-index">{f.index}</span>
              <span className="ds-feature-icon">
                <i className={f.icon} aria-hidden="true" />
              </span>
              <h3 className="ds-feature-title">{f.title}</h3>
              <p className="ds-feature-text">{f.text}</p>
            </div>
          ))}
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
