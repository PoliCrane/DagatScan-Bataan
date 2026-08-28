import { memo, useEffect, useRef, useState } from "react";
import "../pages/styles/erosionAnalysisCards.css";
import { getCoastlineLength } from "../utils/coastlineUtils";
import { SEGMENT_RISK_LEVELS } from "../utils/segmentData";

import { API_BASE_URL } from "../config/api";
function ErosionAnalysisCards({
  selectedMunicipality,
  municipalityStats,
  yearlyShorelineData,
  predictedYear = null,
  shorelineSegments = [],
  selectedSegmentId = null,
  autoRefreshInterval = 30000 // Auto-refresh every 30 seconds if data updates
}) {
  const cardsRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);

  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState("Loading...");
  
  const refreshIntervalRef = useRef(null);
  let lastScrollY = 0;

  const fetchAnalysisData = async (municipality) => {
    if (!municipality) {
      setAnalysisData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipality)}/analysis`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to load data (HTTP ${response.status})`);
      }

      const data = await response.json();
      setAnalysisData(data);

      if (data.metadata?.dataYearNote) {
        setDataSource(`Database (Latest: ${data.metadata?.analysisYear})`);
      } else {
        setDataSource("Database (Current Year)");
      }
      
      console.log(`✓ Loaded analysis data for ${municipality}:`, data);
    } catch (err) {
      console.warn(`Error fetching analysis data for ${municipality}:`, err);
      setError(err.message);
      setAnalysisData(null);
      setDataSource("Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysisData(selectedMunicipality);

    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    if (selectedMunicipality && autoRefreshInterval) {
      refreshIntervalRef.current = setInterval(() => {
        fetchAnalysisData(selectedMunicipality);
      }, autoRefreshInterval);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [selectedMunicipality, autoRefreshInterval]);

  // use database data if available, otherwise fall back to props
  const baseErosionData = analysisData ? {
    municipalityName: analysisData.erosionData?.municipalityName || selectedMunicipality,
    coastlineLength: analysisData.erosionData?.coastlineLength || "0",
    affectedAreaHa: analysisData.erosionData?.affectedArea != null
      ? (Number(analysisData.erosionData.affectedArea) / 10).toFixed(2)
      : null,
    riskLevel: analysisData.erosionData?.riskLevel || "NO_DATA",
    erosionRate: Number(analysisData.metadata?.erosionRate ?? 0).toFixed(2),
    dataYear: analysisData.metadata?.analysisYear,
    dataSource: "Database"
  } : (selectedMunicipality && municipalityStats ? {
    municipalityName: selectedMunicipality,
    coastlineLength: "—",
    riskLevel: municipalityStats.riskLevel,
    erosionRate: municipalityStats.averageErosionRate?.toFixed(2) || "0",
    dataSource: "Municipality summary"
  } : {
    municipalityName: "Select Municipality",
    coastlineLength: "0",
    riskLevel: "NO_DATA",
    erosionRate: "0",
    dataSource: "No Data"
  });

  // one area selected: show its own data. otherwise: average across areas with sufficient data
  const selectedSegment = shorelineSegments.find((s) => s.id === selectedSegmentId);
  const sufficientSegments = shorelineSegments.filter((s) => s.hasSufficientData);
  let erosionData = baseErosionData;
  let insufficientDataMessage = null;

  if (selectedSegment) {
    if (!selectedSegment.hasSufficientData) {
      insufficientDataMessage = `${selectedSegment.name} only has ${selectedSegment.yearsAvailable.length} year(s) of data — upload another year for this area to see erosion analysis.`;
    } else {
      erosionData = {
        ...baseErosionData,
        municipalityName: `${selectedMunicipality} — ${selectedSegment.name}`,
        coastlineLength: getCoastlineLength(selectedSegment.shoreline).toFixed(2),
        // this segment's own rate, not the municipality-wide DB average
        erosionRate: (selectedSegment.erosionRate ?? 0).toFixed(2),
      };
    }
  } else if (shorelineSegments.length > 0) {
    if (sufficientSegments.length === 0) {
      insufficientDataMessage = `No analyzed area in ${selectedMunicipality} has 2+ years of data yet — upload another year to see erosion analysis.`;
    } else {
      const avgLength =
        sufficientSegments.reduce((sum, seg) => sum + getCoastlineLength(seg.shoreline), 0) /
        sufficientSegments.length;
      const avgRate =
        sufficientSegments.reduce((sum, seg) => sum + (seg.erosionRate ?? 0), 0) /
        sufficientSegments.length;
      erosionData = {
        ...baseErosionData,
        municipalityName: `${selectedMunicipality} (Average of ${sufficientSegments.length} area${sufficientSegments.length > 1 ? "s" : ""})`,
        coastlineLength: avgLength.toFixed(2),
        erosionRate: avgRate.toFixed(2),
      };
    }
  }

  const currentYear = new Date().getFullYear();
  const latestYear = analysisData?.metadata?.analysisYear || currentYear;

  // position below the erosion legend dynamically since its height varies
  useEffect(() => {
    const positionCards = () => {
      const erosionLegend = document.querySelector(".erosion-legend");
      const cards = cardsRef.current;
      if (!erosionLegend || !cards) return;

      const legendRect = erosionLegend.getBoundingClientRect();
      const spacingBelow = 15;
      const newTop = legendRect.top + legendRect.height + spacingBelow + window.scrollY;
      cards.style.top = `${newTop}px`;
    };

    // wait for the legend to render/measure before positioning against it
    const timeoutId = setTimeout(positionCards, 100);
    window.addEventListener("resize", positionCards);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", positionCards);
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
    <div className={`analysis-cards-container ${isVisible ? "visible" : "hidden"}`} ref={cardsRef}>
      <div className="analysis-card erosion-card">
        <div className="card-header">
          <i className="pi pi-chart-line card-icon" aria-hidden="true" />
          <h3 className="card-title">Erosion Analysis</h3>
          {loading && <span className="card-loading">Loading...</span>}
        </div>

        <div className="card-content">
          {error ? (
            <div style={{ color: "#d32f2f", textAlign: "center", padding: "20px 0", fontSize: "12px" }}>
              ⚠ {error}
            </div>
          ) : insufficientDataMessage ? (
            <div style={{ color: "#b45309", textAlign: "center", padding: "20px 0", fontSize: "12px" }}>
              {insufficientDataMessage}
            </div>
          ) : selectedMunicipality ? (
            <>
              {selectedSegment && (
                <div className="card-item">
                  <i className="pi pi-arrows-h card-icon" aria-hidden="true" />
                  <span className="card-label">Coastline Length</span>
                  <span className="card-value">
                    {erosionData.coastlineLength} <span className="card-unit">km</span>
                  </span>
                </div>
              )}

              {erosionData.affectedAreaHa != null && (
                <div className="card-item">
                  <i className="pi pi-map card-icon" aria-hidden="true" />
                  <span className="card-label">Est. Affected Area</span>
                  <span className="card-value">
                    {erosionData.affectedAreaHa} <span className="card-unit">ha</span>
                  </span>
                </div>
              )}

              <div className="card-item">
                <i className="pi pi-chart-line card-icon" aria-hidden="true" />
                <span className="card-label">Erosion Rate</span>
                <span className="card-value">{erosionData.erosionRate} <span className="card-unit">m/year</span></span>
              </div>

              <div className="card-item">
                <i className="pi pi-exclamation-triangle card-icon" aria-hidden="true" />
                <span className="card-label">Risk Level</span>
                <span className={`card-value risk-${erosionData.riskLevel.toLowerCase().replace(/_/g, "-")}`}>
                  {SEGMENT_RISK_LEVELS[erosionData.riskLevel] || erosionData.riskLevel}
                </span>
              </div>

              <div className="card-item card-item--location">
                <i className="pi pi-map-marker card-icon" aria-hidden="true" />
                <span className="card-label">Location</span>
                <span className="card-value">{erosionData.municipalityName}</span>
              </div>
            </>
          ) : (
            <div style={{ color: "#999", textAlign: "center", padding: "20px 0", fontSize: "14px" }}>
              Select a municipality to view erosion data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ErosionAnalysisCards);
