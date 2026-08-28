import { memo } from "react";
import { SEGMENT_COLORS, SEGMENT_RISK_LEVELS } from "../utils/segmentData";

// static (non-toggleable) risk-level reference for the Dashboard
const RISK_TIER_ORDER = ["VERY_HIGH", "HIGH", "MODERATE", "LOW", "VERY_LOW"];

function RiskLevelLegendCard() {
  const riskLevels = RISK_TIER_ORDER.map((key) => ({
    color: SEGMENT_COLORS[`${key}_RISK`],
    label: SEGMENT_RISK_LEVELS[key],
  }));

  return (
    <div className="info-box risk-legend-card">
      <div className="info-header-with-icon">
        <i className="pi pi-exclamation-triangle info-icon" aria-hidden="true" />
        <h3>Erosion Risk Level</h3>
      </div>
      <div className="risk-legend-list">
        {riskLevels.map((level) => (
          <div key={level.label} className="risk-legend-item">
            <span className="risk-legend-swatch" style={{ backgroundColor: level.color }} />
            <span className="risk-legend-label">{level.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(RiskLevelLegendCard);
