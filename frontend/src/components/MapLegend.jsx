import { memo, useEffect, useRef, useState } from "react";
import "../pages/styles/mapLegend.css";
import { SEGMENT_COLORS, SEGMENT_RISK_LEVELS } from "../utils/segmentData";

// derived from the shared risk classification so it can't drift from the map colors
const RISK_TIER_ORDER = ["VERY_HIGH", "HIGH", "MODERATE", "LOW", "VERY_LOW"];

function MapLegend() {
  const legendRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  let lastScrollY = 0;

  const riskLevels = RISK_TIER_ORDER.map((key) => ({
    color: SEGMENT_COLORS[`${key}_RISK`],
    label: SEGMENT_RISK_LEVELS[key],
  }));

  const segmentMarkers = [
    { icon: "S", label: "Segment Marker", color: "var(--primary)" },
  ];

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
    <div className={`map-legend ${isVisible ? "visible" : "hidden"}`} ref={legendRef}>
      <div className="legend-header">
        <i className="pi pi-list legend-icon" aria-hidden="true" />
        <h3 className="legend-title">Legend</h3>
      </div>

      <div className="legend-content">
        <h4 className="legend-subtitle">Erosion Risk Level</h4>
        <div className="risk-levels">
          {riskLevels.map((level, index) => (
            <div key={index} className="risk-level-item">
              <div
                className="risk-circle"
                style={{ backgroundColor: level.color }}
              ></div>
              <span className="risk-label">{level.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(MapLegend);
