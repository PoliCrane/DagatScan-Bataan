import { memo, useRef, useState } from "react";
import "../pages/styles/mapLegend.css";
import { SEGMENT_COLORS, SEGMENT_RISK_LEVELS } from "../utils/segmentData";

// derived from the shared risk classification so it can't drift from the map colors
const RISK_TIER_ORDER = ["VERY_HIGH", "HIGH", "MODERATE", "LOW", "VERY_LOW"];

function MapLegend() {
  const legendRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  const riskLevels = RISK_TIER_ORDER.map((key) => ({
    color: SEGMENT_COLORS[`${key}_RISK`],
    label: SEGMENT_RISK_LEVELS[key],
  }));

  return (
    <div className={`map-legend ${expanded ? "is-expanded" : "is-collapsed"}`} ref={legendRef}>
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
