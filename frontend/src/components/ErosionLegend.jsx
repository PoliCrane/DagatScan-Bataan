import { memo, useRef, useState } from "react";
import "../pages/styles/erosionLegend.css";

function ErosionLegend() {
  const legendRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  const leftColumn = [
    { color: "#FFEA00", label: "Previous Shoreline" },
    { color: "#fc4c00", label: "Erosion Area" },
    { color: "#66CDAA", label: "Accretion Area" },
  ];

  const rightColumn = [
    { color: "#FF3131", label: "Current Shoreline" },
    { color: "#7CFC00", label: "Predicted Shoreline" },
  ];

  return (
    <div className={`erosion-legend ${expanded ? "is-expanded" : "is-collapsed"}`} ref={legendRef}>
      <button
        type="button"
        className="legend-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <i className="pi pi-list legend-icon" aria-hidden="true" />
        <h3 className="legend-title">Legend</h3>
        <i className={`pi ${expanded ? "pi-chevron-down" : "pi-chevron-up"} legend-chevron`} aria-hidden="true" />
      </button>

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
