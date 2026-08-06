import { useEffect, useRef, useState } from "react";
import "../pages/styles/erosionLegend.css";

export default function ErosionLegend() {
  const legendRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  let lastScrollY = 0;

  const leftColumn = [
    { color: "#FFEA00", label: "Previous Shoreline" },
    { color: "#fc4c00", label: "Erosion Area" },
    { color: "#66CDAA", label: "Accretion Area" },
  ];

  const rightColumn = [
    { color: "#FF3131", label: "Current Shoreline" },
    { color: "#7CFC00", label: "Predicted Shoreline" },
  ];

  useEffect(() => {
    let sidebar = null;
    const handleMouseEnter = () => {
      if (legendRef.current) legendRef.current.style.left = "calc(224px + 15px)";
    };
    const handleMouseLeave = () => {
      if (legendRef.current) legendRef.current.style.left = "calc(65px + 15px)";
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
    <div className={`erosion-legend ${isVisible ? "visible" : "hidden"}`} ref={legendRef}>
      <div className="legend-header">
        <img src="/legend.png" alt="Legend" className="legend-icon" />
        <h3 className="legend-title">Legend</h3>
      </div>

      <div className="legend-content">
        <div className="legend-columns">
          {/* Left Column */}
          <div className="legend-column">
            {leftColumn.map((item, index) => (
              <div key={index} className="legend-item">
                <div
                  className="legend-line"
                  style={{ backgroundColor: item.color }}
                ></div>
                <span className="legend-label">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Right Column */}
          <div className="legend-column">
            {rightColumn.map((item, index) => (
              <div key={index} className="legend-item">
                <div
                  className="legend-line"
                  style={{ backgroundColor: item.color }}
                ></div>
                <span className="legend-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
