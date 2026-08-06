import { SEGMENT_COLORS, SEGMENT_RISK_LEVELS } from "../utils/segmentData";

// Static (non-toggleable) risk-level reference for the Dashboard — a
// simpler sibling to MapLegend.jsx, which is map-specific and manages its
// own visibility-toggle state that doesn't apply here.
const RISK_TIER_ORDER = ["VERY_HIGH", "HIGH", "MODERATE", "LOW", "VERY_LOW"];

export default function RiskLevelLegendCard() {
  const riskLevels = RISK_TIER_ORDER.map((key) => ({
    color: SEGMENT_COLORS[`${key}_RISK`],
    label: SEGMENT_RISK_LEVELS[key],
  }));

  return (
    <div className="info-box risk-legend-card">
      <div className="info-header-with-icon">
        <img src="/risk.png" alt="risk-icon" className="info-icon" />
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
