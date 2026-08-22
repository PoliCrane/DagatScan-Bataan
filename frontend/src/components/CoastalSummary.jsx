import { memo, useEffect, useRef, useState } from "react";
import "../pages/styles/coastalsummarycard.css";
import { SEGMENT_COLORS } from "../utils/segmentData";

import { API_BASE_URL } from "../config/api";
function CoastalSummary({ yearlyData = [], selectedMunicipality = null, segments = [] }) {
  const summaryRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  const [bataanSummary, setBataanSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  let lastScrollY = 0;

  useEffect(() => {
    const fetchBataanSummary = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/shoreline/bataan/summary`);
        if (response.ok) {
          const data = await response.json();
          setBataanSummary(data);
          console.log("✓ Loaded Bataan summary from database");
        } else {
          console.warn("Failed to fetch Bataan summary, using defaults");
          setBataanSummary(null);
        }
      } catch (error) {
        console.warn("Error fetching Bataan summary:", error.message);
        setBataanSummary(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBataanSummary();
  }, []);

  // use segment data when a municipality is selected, otherwise the Bataan-wide API data
  let activeSummary = bataanSummary;

  if (selectedMunicipality && segments && segments.length > 0) {
    const veryHighRiskSegments = segments.filter(seg => seg.risk === "VERY_HIGH");

    const avgErosionRate = segments.length > 0
      ? segments.reduce((sum, seg) => sum + (seg.erosionRate || 0), 0) / segments.length
      : 0;

    activeSummary = {
      veryHighRisk: veryHighRiskSegments.length,
      avgErosionRate: avgErosionRate,
      totalSegments: segments.length
    };
  }

  const displayVeryHighRiskCount = activeSummary?.riskDistribution?.veryHighRisk ?? activeSummary?.veryHighRisk ?? 0;
  const overallErosionRate = activeSummary?.avgErosionRate ?? null;
  const dataSource = activeSummary ? "Real Data" : "No Data";

  // position below the map legend dynamically since its height varies
  useEffect(() => {
    const positionCoastalSummary = () => {
      const mapLegend = document.querySelector(".map-legend");
      const summary = summaryRef.current;
      if (!mapLegend || !summary) return;

      const legendRect = mapLegend.getBoundingClientRect();
      const spacingBelow = 15;
      const newTop = legendRect.top + legendRect.height + spacingBelow + window.scrollY;
      summary.style.top = `${newTop}px`;
    };

    // wait for the legend to render/measure before positioning against it
    const timeoutId = setTimeout(positionCoastalSummary, 100);
    window.addEventListener("resize", positionCoastalSummary);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", positionCoastalSummary);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className={`coastal-summary-container ${isVisible ? "visible" : "hidden"}`} ref={summaryRef}>
      <div className="summary-card">
        <div className="card-header">
          <i className="pi pi-chart-line card-icon" aria-hidden="true" />
          <h3 className="card-title">
            Coastal Summary
          </h3>
        </div>

        <div className="card-content">
          <div className="card-item">
            <div className="risk-indicator" style={{ backgroundColor: SEGMENT_COLORS.VERY_HIGH_RISK }}></div>
            <span className="card-label">Very High Risk Zones</span>
            <span className="card-value">{displayVeryHighRiskCount}</span>
          </div>

          <div className="card-item">
            <i className="pi pi-chart-line card-icon" aria-hidden="true" />
            <span className="card-label">Erosion Rate</span>
            <span className="card-value">
              {overallErosionRate != null ? (
                <>
                  {overallErosionRate.toFixed(2)} <span className="card-unit">m/year</span>
                </>
              ) : (
                "No data"
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(CoastalSummary);
