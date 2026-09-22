import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, GeoJSON, Polyline, Marker, Popup, useMap } from 'react-leaflet';
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

// Status colors are standardized across the system (green=online, yellow=warning,
// red=critical, blue=in-progress, gray=inactive). Reflects real backend
// reachability, not the environment — "checking" naturally covers a Render
// free-tier cold start.
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

// MapContainer only reads `bounds` when it initialises, and the preview mounts before
// .map-container reaches its final size — so the fit is applied from inside the map,
// where it can be redone once the real size is known. Same pattern as CoastalMonitoring.
function DashboardMapFocus({ bounds, containerRef }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !bounds) return undefined;

    const fit = () => {
      map.invalidateSize();
      // maxZoom stops a single short stretch of monitored coast from zooming the
      // preview down to street level, where nothing is recognisable.
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    };
    fit();

    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [map, bounds, containerRef]);

  return null;
}

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

  // Populates the sidebar's "System Status" card.
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

  // Dashboard is admin/superadmin/municipal only; others get redirected.
  const userRole = localStorage.getItem("roles");
  const isMunicipal = userRole === "municipal";
  const municipalityName = isMunicipal ? localStorage.getItem("municipality") : null;
  const scopeLabel = isMunicipal && municipalityName ? municipalityName : "Bataan";

  // Traced shoreline lines for the map overlay + markers below. Municipal accounts get
  // this from the municipality-scoped /zones endpoint; admin/superadmin get it from
  // /bataan/all-zones?includeGeometry=true — both return geometry under the same
  // `geojsonData` key, so this mapping is identical either way.
  const dashboardShorelines = useMemo(() => {
    return allZones
      .map((zone) => {
        const geometry = zone.geojsonData?.geometry;
        const coordinates =
          geometry?.type === "LineString"
            ? geometry.coordinates
            : geometry?.type === "MultiLineString"
              ? geometry.coordinates.flat()
              : null;
        if (!coordinates || coordinates.length < 2) return null;

        return {
          id: zone.id,
          name: zone.specificArea,
          risk: zone.riskLevel,
          erosionRate: zone.erosionRate,
          year: zone.year,
          positions: coordinates.map(([lon, lat]) => [lat, lon]),
          color: getRiskColor(zone.riskLevel),
        };
      })
      .filter(Boolean);
  }, [allZones]);

  // Municipal accounts open onto their own monitored coast rather than the whole
  // province. Fitting the municipality polygon isn't close enough to be useful — several
  // are far taller than the map box is, so the fit is height-bound and leaves the
  // segments a few pixels wide. Fitting the segments themselves is what makes them
  // legible; the municipality outline is the fallback when none have geometry yet.
  const focusBounds = useMemo(() => {
    if (!isMunicipal || !municipalityName) return bataanBounds;

    const segmentPoints = dashboardShorelines.flatMap((line) => line.positions);
    if (segmentPoints.length > 1) return L.latLngBounds(segmentPoints);

    if (!geoJsonData) return bataanBounds;
    const owned = geoJsonData.features.filter(
      (feature) => feature.properties?.MUNICIPALI?.toUpperCase() === municipalityName.toUpperCase()
    );
    if (owned.length === 0) return bataanBounds;

    // Several municipalities are split into multiple polygons (offshore islets);
    // fit the largest one so the preview lands on the mainland coast, not a rock.
    const boxArea = (feature) => {
      const b = L.geoJSON(feature).getBounds();
      return (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth());
    };
    const mainland = owned.reduce((largest, current) =>
      boxArea(current) > boxArea(largest) ? current : largest
    );
    return L.geoJSON(mainland).getBounds();
  }, [isMunicipal, municipalityName, dashboardShorelines, geoJsonData, bataanBounds]);

  useEffect(() => {
    if (userRole !== "admin" && userRole !== "superadmin" && userRole !== "municipal") {
      navigate("/coastalmonitoring", { replace: true });
      return;
    }

    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }

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
        : `${API_BASE_URL}/api/shoreline/bataan/all-zones?includeGeometry=true`;

      const summaryResponse = await fetch(summaryUrl);
      const summaryData = summaryResponse.ok ? await summaryResponse.json() : null;

      const zonesResponse = await fetch(zonesUrl);
      const zonesData = zonesResponse.ok ? await zonesResponse.json() : { zones: [] };

      if (summaryData && zonesData) {
        // Baseline zones have no erosion rate by definition; exclude them.
        const zonesWithData = (zonesData.zones || []).filter(
          (z) => z.erosionRate !== null && z.erosionRate !== undefined
        );

        // "Active" means each area's own latest shoreline, not every year ever
        // uploaded — but NOT a single global year either. A single global cutoff
        // (e.g. "whichever year is newest anywhere") would silently drop any area
        // that hasn't been re-surveyed yet this cycle, even though its own most
        // recent data is perfectly valid — e.g. Morong Bay Area's latest is 2025,
        // and it must still show up even when some other area already has 2026.
        const latestByArea = new Map();
        for (const zone of zonesWithData) {
          const key = `${zone.municipality}::${zone.specificArea}`;
          const current = latestByArea.get(key);
          if (!current || zone.year > current.year) {
            latestByArea.set(key, zone);
          }
        }
        const latestZones = [...latestByArea.values()];

        const totalRecords = zonesWithData.length;

        setStats({
          activeMonitoringSites: latestZones.length,
          latestErosionRate: Math.abs(summaryData.avgErosionRate || 0).toFixed(2),
          dataRecords: totalRecords,
          highRiskAreas: summaryData.riskDistribution?.veryHighRisk || 0
        });

        // The segment list below should reflect the same "one row per area" set as
        // the stat card above, not every year ever uploaded.
        setAllZones(latestZones);
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
        <div className="dashboard-welcome">
          <h1>Welcome back, {username}! </h1>
          <p>Coastal Erosion Monitoring System for {scopeLabel}</p>
          <p className="welcome-timestamp">{currentDate}</p>
        </div>

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

        <div className="dashboard-grid">
          <div className="dashboard-main">
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
                    bounds={focusBounds}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    dragging={true}
                    doubleClickZoom={true}
                    scrollWheelZoom={false}
                    keyboard={false}
                  >
                    <DashboardMapFocus bounds={focusBounds} containerRef={mapContainerRef} />
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri"
                    />
                    {geoJsonData && (
                      <GeoJSON
                        data={geoJsonData}
                        style={(feature) => {
                          // Neighbouring municipalities fade back so a municipal user's
                          // own coastline reads as the subject of the preview.
                          const isOwn =
                            feature.properties?.MUNICIPALI?.toUpperCase() ===
                            municipalityName?.toUpperCase();
                          if (isMunicipal && !isOwn) {
                            return {
                              color: "#0096FF",
                              weight: 1,
                              opacity: 0.25,
                              fillColor: "#F0FFFF",
                              fillOpacity: 0.05,
                            };
                          }
                          return {
                            color: "#0096FF",
                            weight: 2,
                            opacity: 0.6,
                            fillColor: "#F0FFFF",
                            fillOpacity: 0.15,
                          };
                        }}
                      />
                    )}

                    {dashboardShorelines.map((line) => (
                      <Polyline
                        key={`dashboard-shoreline-${line.id}`}
                        positions={line.positions}
                        pathOptions={{ color: line.color, weight: 4, opacity: 0.95 }}
                      />
                    ))}

                    {/* One marker per monitored area, so segments are identifiable and
                        not just visible. Same treatment as the Coastal Monitoring map. */}
                    {dashboardShorelines.map((line) => {
                      const midpoint = line.positions[Math.floor(line.positions.length / 2)];
                      if (!midpoint) return null;

                      return (
                        <Marker
                          key={`dashboard-marker-${line.id}`}
                          position={midpoint}
                          icon={L.divIcon({
                            className: "segment-marker",
                            html: `<div class="segment-marker-icon" style="background:${line.color}; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:13px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;">!</div>`,
                            iconSize: [28, 28],
                            iconAnchor: [14, 14],
                          })}
                        >
                          <Popup>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{line.name}</div>
                            <div
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                background: `${line.color}22`,
                                color: line.color,
                              }}
                            >
                              {SEGMENT_RISK_LEVELS[line.risk] || line.risk}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 6 }}>
                              {line.erosionRate != null
                                ? `${Number(line.erosionRate).toFixed(2)} m/year`
                                : "No rate yet"}
                              {line.year != null && ` · ${line.year}`}
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                )}
              </div>
            </div>
          </div>

          <div className="dashboard-sidebar">
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

            <div className="info-box focus-area">
              <div className="info-header-with-icon">
                <i className="pi pi-crosshairs info-icon" aria-hidden="true" />
                <h3>Current Focus Area</h3>
              </div>
              <p>{scopeLabel} Coastal Zone - {loading ? "..." : stats.activeMonitoringSites} active monitoring sites.</p>
            </div>

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