import { memo, useRef, useState } from "react";
import "../pages/styles/erosionLegend.css";

// The swatch is a 21px bar, so a dashed entry is drawn as a gradient rather than a
// border-style — that keeps the same box size/shadow as every solid entry. Dashes are
// kept long against short gaps; at this size anything shorter reads as blocks, not a line.
const swatchStyle = (item) =>
  item.dashed
    ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 8px, transparent 8px 11px)` }
    : { backgroundColor: item.color };

function ErosionLegend() {
  const legendRef = useRef(null);
  const [expanded, setExpanded] = useState(true);

  const leftColumn = [
    { color: "#FFEA00", label: "Previous Shoreline" },
    { color: "#fc4c00", label: "Erosion Area" },
    { color: "#66CDAA", label: "Accretion Area" },
  ];

  const rightColumn = [
    { color: "#FF10F0", label: "Current Shoreline" },
    { color: "#7CFC00", label: "Predicted Shoreline" },
    // The dashed pair drawn either side of the predicted line — same colour, so the
    // swatch has to carry the dash itself to distinguish it from the solid entry above.
    { color: "#7CFC00", label: "Prediction Range", dashed: true },
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
                  style={swatchStyle(item)}
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
                  style={swatchStyle(item)}
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
