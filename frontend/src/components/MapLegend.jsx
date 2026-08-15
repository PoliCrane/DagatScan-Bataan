import { useEffect, useRef, useState } from "react";
import "../pages/styles/mapLegend.css";
import { SEGMENT_COLORS, SEGMENT_RISK_LEVELS } from "../utils/segmentData";

// derived from the shared risk classification so it can't drift from the map colors
const RISK_TIER_ORDER = ["VERY_HIGH", "HIGH", "MODERATE", "LOW", "VERY_LOW"];

export default function MapLegend() {
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
    let sidebar = null;
    const handleMouseEnter = () => {
      if (legendRef.current) legendRef.current.style.left = "calc(224px + 15px)";
    };
    const handleMouseLeave = () => {
      if (legendRef.current) legendRef.current.style.left = "calc(65px + 15px)";
    };

    const findAndObserveSidebar = () => {
      const mapSidebar = document.querySelector(".map-sidebar");
      const adminSidebar = document.querySelector(".admin-sidebar");
      sidebar = mapSidebar || adminSidebar;

      if (sidebar) {
        sidebar.addEventListener("mouseenter", handleMouseEnter);
        sidebar.addEventListener("mouseleave", handleMouseLeave);
      }
    };

    // wait for the DOM to render before querying
    const timeoutId = setTimeout(findAndObserveSidebar, 100);

    return () => {
      clearTimeout(timeoutId);
      if (sidebar) {
        sidebar.removeEventListener("mouseenter", handleMouseEnter);
        sidebar.removeEventListener("mouseleave", handleMouseLeave);
      }
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
    <div className={`map-legend ${isVisible ? "visible" : "hidden"}`} ref={legendRef}>
      <div className="legend-header">
        <img src="/legend.png" alt="Legend" className="legend-icon" />
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
