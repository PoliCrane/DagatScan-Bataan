import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles/dashboard.css";
import { getRiskColor, SEGMENT_RISK_LEVELS } from "../utils/segmentData";
import RiskLevelLegendCard from "../components/RiskLevelLegendCard";
import useGuidedTour from "../hooks/useGuidedTour";
import TourInfoButton from "../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../tours/pageIds";
import { dashboardSteps } from "../tours/steps/dashboardSteps";

import { API_BASE_URL } from "../config/api";

// Standardized status palette used across the system: green = online/operational,
// yellow = warning/degraded, red = critical/outage, blue = ongoing process,
// gray = inactive. "System Status" reflects real backend reachability, not just
// which environment this build is running in — checking naturally covers a
// Render free-tier cold start, since it just stays blue for as long as that takes.
const BACKEND_STATUS_CONFIG = {
  checking: { color: "blue", label: "Checking...", info: "Contacting backend" },
  online: { color: "green", label: "Online", info: "Backend operational" },
  offline: { color: "red", label: "Offline", info: "Backend unreachable" },
};

// Staggered by the parent's staggerChildren — each card just needs its own entrance.
const STAT_CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export default function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("User");
  const [currentDate, setCurrentDate] = useState("");
  const [stats, setStats] = useState({
    activeMonitoringSites: 0,
    latestErosionRate: 0,
    dataRecords: 0,
    highRiskAreas: 0
  });
  const [allZones, setAllZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState("checking");
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.DASHBOARD, dashboardSteps);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Boundary fetched (not hardcoded) so fitted bounds match the real province shape.
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [bataanBounds, setBataanBounds] = useState(null);

  useEffect(() => {
    const loadGeoJson = async () => {
      try {
        const response = await fetch("/data/BATAAN.geojson");
        const data = await response.json();
        setGeoJsonData(data);
        setBataanBounds(L.geoJSON(data).getBounds());
      } catch (err) {
        console.error("Error loading Bataan boundary:", err);
      }
    };
    loadGeoJson();
  }, []);

  // Drives the sidebar's "System Status" card — a real connectivity check,
  // not just an environment label. Stays "checking" for as long as a Render
  // free-tier cold start takes, since that's exactly what a pending fetch is.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/health`)
      .then((res) => {
        if (!cancelled) setBackendStatus(res.ok ? "online" : "offline");
      })
      .catch(() => {
        if (!cancelled) setBackendStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // .map-container's size changes once sidebar content replaces its loading
  // state; Leaflet caches its initial size, so force a resize check.
  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Dashboard is admin/superadmin/municipal only; others get redirected.
  const userRole = localStorage.getItem("roles");
  const isMunicipal = userRole === "municipal";
  const municipalityName = isMunicipal ? localStorage.getItem("municipality") : null;
  const scopeLabel = isMunicipal && municipalityName ? municipalityName : "Bataan";

  useEffect(() => {
    if (userRole !== "admin" && userRole !== "superadmin" && userRole !== "municipal") {
      navigate("/coastalmonitoring", { replace: true });
      return;
    }

    // Get username from localStorage
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }

    // Set current date
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setCurrentDate(today.toLocaleDateString('en-US', options));

    // Fetch summary + zones — province-wide for admins, scoped to their own
    // municipality for municipal accounts.
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const summaryUrl = isMunicipal
        ? `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipalityName)}/summary`
        : `${API_BASE_URL}/api/shoreline/bataan/summary`;
      const zonesUrl = isMunicipal
        ? `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipalityName)}/zones`
        : `${API_BASE_URL}/api/shoreline/bataan/all-zones`;

      const summaryResponse = await fetch(summaryUrl);
      const summaryData = summaryResponse.ok ? await summaryResponse.json() : null;

      const zonesResponse = await fetch(zonesUrl);
      const zonesData = zonesResponse.ok ? await zonesResponse.json() : { zones: [] };

      if (summaryData && zonesData) {
        // Baseline zones have no erosion rate by definition; exclude them.
        const zonesWithData = (zonesData.zones || []).filter(
          (z) => z.erosionRate !== null && z.erosionRate !== undefined
        );

        // "Active" means currently monitored, i.e. this year's uploads — not every
        // site ever monitored across all history. Falls back to the latest year
        // that actually has data if the current year has nothing uploaded yet,
        // so this doesn't show a misleading 0 right after the calendar rolls over.
        const currentYear = new Date().getFullYear();
        const yearsWithData = [...new Set(zonesWithData.map((z) => z.year))];
        const activeYear = yearsWithData.includes(currentYear)
          ? currentYear
          : (yearsWithData.length ? Math.max(...yearsWithData) : currentYear);
        const activeYearZones = zonesWithData.filter((z) => z.year === activeYear);

        // Count distinct physical monitoring locations (municipality + specific area)
        const totalSites = new Set(activeYearZones.map(z => `${z.municipality}::${z.specificArea}`)).size;

        // Count total historical measurement records
        const totalRecords = zonesWithData.length;

        setStats({
          activeMonitoringSites: totalSites,
          latestErosionRate: Math.abs(summaryData.avgErosionRate || 0).toFixed(2),
          dataRecords: totalRecords,
          highRiskAreas: summaryData.riskDistribution?.veryHighRisk || 0
        });

        // The segment list below should reflect the same "active year" as the
        // stat card above, not every year ever uploaded.
        setAllZones(activeYearZones);
        console.log("✓ Dashboard data loaded successfully");
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      setStats({
        activeMonitoringSites: 0,
        latestErosionRate: "0.00",
        dataRecords: 0,
        highRiskAreas: 0
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="dashboard-container">
        {/* Welcome Section */}
        <div className="dashboard-welcome">
          <h1>Welcome back, {username}! </h1>
          <p>Coastal Erosion Monitoring System for {scopeLabel}</p>
          <p className="welcome-timestamp">{currentDate}</p>
        </div>

        {/* Stats Section */}
        <motion.div
          className="dashboard-stats"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        >
          <motion.div className="stat-card" variants={STAT_CARD_VARIANTS}>
            <i className="pi pi-compass stat-icon" aria-hidden="true" />
            <div className="stat-label">Active Monitoring Sites</div>
            <div className="stat-value">{loading ? "..." : stats.activeMonitoringSites}</div>
            <div className="stat-info">Real-time data collection ongoing</div>
          </motion.div>
          <motion.div className="stat-card" variants={STAT_CARD_VARIANTS}>
            <i className="pi pi-chart-line stat-icon" aria-hidden="true" />
            <div className="stat-label">Latest Erosion Rate</div>
            <div className="stat-value">{loading ? "..." : stats.latestErosionRate} m</div>
            <div className="stat-info">Average annual change</div>
          </motion.div>
          <motion.div className="stat-card" variants={STAT_CARD_VARIANTS}>
            <i className="pi pi-database stat-icon" aria-hidden="true" />
            <div className="stat-label">Data Records</div>
            <div className="stat-value">{loading ? "..." : stats.dataRecords.toLocaleString()}</div>
            <div className="stat-info">Historical measurements</div>
          </motion.div>
          <motion.div className="stat-card" variants={STAT_CARD_VARIANTS}>
            <i className="pi pi-exclamation-triangle stat-icon stat-icon-warning" aria-hidden="true" />
            <div className="stat-label">Very High Risk Areas</div>
            <div className="stat-value">{loading ? "..." : stats.highRiskAreas}</div>
            <div className="stat-info">Critical erosion warning</div>
          </motion.div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="dashboard-grid">
          {/* Main Section */}
          <div className="dashboard-main">
            {/* Coastal Erosion Map Section */}
            <div className="dashboard-map-section">
              <div className="dashboard-section-header">
                <h2 className="dashboard-section-title">Coastal Erosion Map</h2>
                <a href="#" className="view-full-link" onClick={(e) => { e.preventDefault(); navigate("/coastalmonitoring"); }}>
                  View Full Map
                </a>
              </div>
              <div className="map-container" ref={mapContainerRef}>
                {bataanBounds && (
                  <MapContainer
                    ref={mapRef}
                    bounds={bataanBounds}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    dragging={true}
                    doubleClickZoom={true}
                    scrollWheelZoom={false}
                    keyboard={false}
                  >
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri"
                    />
                    {geoJsonData && (
                      <GeoJSON
                        data={geoJsonData}
                        style={() => ({
                          color: "#0096FF",
                          weight: 2,
                          opacity: 0.6,
                          fillColor: "#F0FFFF",
                          fillOpacity: 0.15,
                        })}
                      />
                    )}
                  </MapContainer>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="dashboard-sidebar">
            {/* System Status */}
            <div className={`info-box system-status status-${BACKEND_STATUS_CONFIG[backendStatus].color}`}>
              <div className="info-header">
                <div className={`status-indicator status-${BACKEND_STATUS_CONFIG[backendStatus].color}`}></div>
                <h3>System Status</h3>
              </div>
              <p>{BACKEND_STATUS_CONFIG[backendStatus].label}</p>
              <p className="info-meta">
                {BACKEND_STATUS_CONFIG[backendStatus].info} — {import.meta.env.PROD ? "Production" : "Local dev"}
              </p>
            </div>

            <RiskLevelLegendCard />

            {/* Current Focus Area */}
            <div className="info-box focus-area">
              <div className="info-header-with-icon">
                <i className="pi pi-crosshairs info-icon" aria-hidden="true" />
                <h3>Current Focus Area</h3>
              </div>
              <p>{scopeLabel} Coastal Zone - {loading ? "..." : stats.activeMonitoringSites} active monitoring sites.</p>
            </div>

            {/* High Risk Areas Container */}
            <div className="high-risk-container">
              <div className="high-risk-header">
                <i className="pi pi-bell info-icon" aria-hidden="true" />
                <h3>All Monitoring Segments</h3>
                <a href="#" className="view-all-link" onClick={(e) => { e.preventDefault(); navigate("/coastalmonitoring"); }}>
                  View all
                </a>
              </div>
              <p className="high-risk-description">
                {allZones.length} segments identified {isMunicipal ? `in ${scopeLabel}` : "across Bataan municipalities"}.
              </p>
              <div className="segments-scrollable-container">
                {loading ? (
                  <div className="loading-message">Loading segments...</div>
                ) : allZones.length > 0 ? (
                  allZones.map((zone) => {
                    const riskColor = getRiskColor(zone.riskLevel);
                    const riskLabel = SEGMENT_RISK_LEVELS[zone.riskLevel] || zone.riskLevel;
                    return (
                      <div 
                        key={zone.id}
                        className="segment-item-home"
                        style={{ borderLeftColor: riskColor }}
                      >
                        <div className="segment-item-header">
                          <span className="segment-name">
                            <strong>{zone.municipality}</strong> - {zone.specificArea}
                          </span>
                          <span className="segment-risk-badge" style={{ backgroundColor: riskColor }}>
                            {riskLabel}
                          </span>
                        </div>
                        <div className="segment-item-details">
                          <span className="segment-detail">
                            <strong>Erosion Rate:</strong> {zone.erosionRate.toFixed(2)} m/yr
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="no-data-message">No segment data available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}