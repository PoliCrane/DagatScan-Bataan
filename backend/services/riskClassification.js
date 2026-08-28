// Erosion risk classification, single source of truth for the backend. 5 tiers by erosion_rate
// (m/year; negative = erosion, positive = accretion). Threshold provenance and citation
// requirements are documented in Docs/RISK_TIER_SOURCES.md.
// Frontend has its own copy (frontend/src/utils/segmentData.js) - after editing thresholds in
// either file, run `node backend/verify-risk-tiers-sync.js` to confirm they still agree.

const RISK_TIERS = [
  { key: "VERY_HIGH", test: (r) => r <= -5 },
  { key: "HIGH", test: (r) => r <= -1 },
  { key: "MODERATE", test: (r) => r < 1 },
  { key: "LOW", test: (r) => r < 5 },
  { key: "VERY_LOW", test: () => true },
];

const RISK_COLORS = {
  VERY_HIGH: "#c0392b",
  HIGH: "#e67e22",
  MODERATE: "#f1c40f",
  LOW: "#27ae60",
  VERY_LOW: "#2980b9",
  NO_DATA: "#617172",
};

const RISK_LABELS = {
  VERY_HIGH: "Very High",
  HIGH: "High",
  MODERATE: "Moderate",
  LOW: "Low",
  VERY_LOW: "Very Low",
  NO_DATA: "No Data",
};

function classifyErosionRisk(erosionRate) {
  if (erosionRate === null || erosionRate === undefined) return "NO_DATA";
  const rate = Number(erosionRate);
  if (Number.isNaN(rate)) return "NO_DATA";
  return RISK_TIERS.find((tier) => tier.test(rate)).key;
}

const { STABLE_BAND_M_PER_YEAR } = require("../config/constants");

function classifyShorelineStatus(erosionRate) {
  if (erosionRate === null || erosionRate === undefined) return "NO_DATA";
  const rate = Number(erosionRate);
  if (Number.isNaN(rate)) return "NO_DATA";
  if (Math.abs(rate) < STABLE_BAND_M_PER_YEAR) return "STABLE";
  return rate < 0 ? "EROSION" : "ACCRETION";
}

module.exports = {
  classifyErosionRisk,
  classifyShorelineStatus,
  STABLE_BAND_M_PER_YEAR,
  RISK_COLORS,
  RISK_LABELS,
};
