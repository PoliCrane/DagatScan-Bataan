import { useEffect, useRef, useState } from "react";
import "../pages/styles/coastalsummarycard.css";
import { SEGMENT_COLORS } from "../utils/segmentData";

import { API_BASE_URL } from "../config/api";
export default function CoastalSummary({ yearlyData = [], selectedMunicipality = null, segments = [] }) {
  const summaryRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  const [bataanSummary, setBataanSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  let lastScrollY = 0;

  // Fetch Bataan-wide summary data
  useEffect(() => {
    const fetchBataanSummary = async () => {
      try {
        // Always fetch Bataan-wide summary (collective across all municipalities)
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

  // Compute summary from segments when municipality is selected
  // Otherwise use Bataan-wide API data
  let activeSummary = bataanSummary;
  
  if (selectedMunicipality && segments && segments.length > 0) {
    // Filter for VERY_HIGH risk segments (most severe tier)
    const veryHighRiskSegments = segments.filter(seg => seg.risk === "VERY_HIGH");

    // Calculate average erosion rate
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
  const overallErosionRate = activeSummary?.avgErosionRate ?? 1.2;
  const dataSource = activeSummary ? "Real Data" : "Simulated Data";

  useEffect(() => {
    let sidebar = null;
    const handleMouseEnter = () => {
      if (summaryRef.current) summaryRef.current.style.left = "calc(224px + 15px)";
    };
    const handleMouseLeave = () => {
      if (summaryRef.current) summaryRef.current.style.left = "calc(65px + 15px)";
    };

    // Find sidebar and listen to hover events
    const findAndObserveSidebar = () => {
      const mapSidebar = document.querySelector(".map-sidebar");
      const adminSidebar = document.querySelector(".admin-sidebar");
      sidebar = mapSidebar || adminSidebar;

      if (sidebar) {
        sidebar.addEventListener("mouseenter", handleMouseEnter);
        sidebar.addEventListener("mouseleave", handleMouseLeave);
      }
    };

    // Give DOM time to render before finding elements
    const timeoutId = setTimeout(findAndObserveSidebar, 100);

    return () => {
      clearTimeout(timeoutId);
      if (sidebar) {
        sidebar.removeEventListener("mouseenter", handleMouseEnter);
        sidebar.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, []);

  // Position CoastalSummary below MapLegend dynamically, so it always
  // clears the legend regardless of how tall the legend's content is.
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

    // Give the legend time to render/measure before positioning against it
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
        // Scrolling down
        setIsVisible(false);
      } else {
        // Scrolling up
        setIsVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className={`coastal-summary-container ${isVisible ? "visible" : "hidden"}`} ref={summaryRef}>
      {/* Coastal Summary Card */}
      <div className="summary-card">
        <div className="card-header">
          <img src="/rate.png" alt="Summary" className="card-icon" />
          <h3 className="card-title">
            Coastal Summary
          </h3>
        </div>

        <div className="card-content">
          {/* Very High Risk Zones */}
          <div className="card-item">
            <div className="risk-indicator" style={{ backgroundColor: SEGMENT_COLORS.VERY_HIGH_RISK }}></div>
            <span className="card-label">Very High Risk Zones</span>
            <span className="card-value">{displayVeryHighRiskCount}</span>
          </div>

          {/* Erosion Rate */}
          <div className="card-item">
            <img src="/rate.png" alt="Rate" className="card-icon" />
            <span className="card-label">Erosion Rate</span>
            <span className="card-value">
              {overallErosionRate.toFixed(2)} <span className="card-unit">m/year</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
