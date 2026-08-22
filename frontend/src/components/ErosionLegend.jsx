import { memo, useEffect, useRef, useState } from "react";
import "../pages/styles/erosionLegend.css";

function ErosionLegend() {
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
    <div className={`erosion-legend ${isVisible ? "visible" : "hidden"}`} ref={legendRef}>
      <div className="legend-header">
        <i className="pi pi-list legend-icon" aria-hidden="true" />
        <h3 className="legend-title">Legend</h3>
      </div>

      <div className="legend-content">
        <div className="legend-columns">
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

export default memo(ErosionLegend);
