import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import SiteFooter from "../components/SiteFooter";
import IndexNavBar from "./indexNavBar";
import { useAuth } from "../contexts/useAuth";
import "./index-organized.css";

const FEATURES = [
  {
    icon: "/corefeature1.png",
    title: "View Coastline",
    text: "Compare past and present coastlines from satellite-derived shoreline data.",
  },
  {
    icon: "/corefeature2.png",
    title: "Predict Erosion",
    text: "Project future shoreline positions with confidence bounds and validated accuracy.",
  },
  {
    icon: "/corefeature3.png",
    title: "Generate Reports",
    text: "Download per-municipality erosion assessment reports and open data.",
  },
];

export default function Index() {
  const authModalsRef = useRef(null);
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn) navigate("/home");
  }, [isLoggedIn, navigate]);

  return (
    <div className="bg-white font-sans">
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
        <div className="absolute inset-0 bg-linear-to-b from-navy/70 via-navy/50 to-navy/80" />
        <div className="relative mx-auto max-w-3xl py-24 text-center text-white">
          <span className="mb-5 inline-block rounded-full border border-white/40 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest backdrop-blur">
            Coastal Monitoring for Bataan
          </span>
          <h1 className="m-0 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            DagatScan <span className="text-accent">Bataan</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/85 sm:text-lg">
            A coastal erosion visualization and awareness system — satellite-derived
            shorelines, validated predictions, and risk assessments for all 12 coastal
            municipalities.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => navigate("/coastalmonitoring")}
              className="rounded-lg bg-primary px-7 py-3 text-base font-semibold text-white shadow-raised transition hover:bg-primary-dark"
            >
              Explore Map
            </button>
            <button
              onClick={() => navigate("/validation")}
              className="rounded-lg border border-white/50 bg-white/10 px-7 py-3 text-base font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              View Accuracy Report
            </button>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl px-6 py-16 md:py-20">
        <h2 className="m-0 text-center text-3xl font-bold text-navy">Core Features</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-muted">
          From raw satellite imagery to defensible shoreline-change insight.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-card border border-line bg-white p-6 text-center shadow-card transition hover:-translate-y-1 hover:shadow-raised"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-card">
                <img src={f.icon} alt="" className="h-9 w-9" />
              </div>
              <h3 className="m-0 text-lg font-bold text-primary">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="about"
        className="relative overflow-hidden px-6 py-20"
        style={{ backgroundImage: "url('/tempoaboutBG.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="absolute inset-0 bg-white/85" />
        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="m-0 text-3xl font-bold text-navy">About DagatScan Bataan</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-muted">
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
