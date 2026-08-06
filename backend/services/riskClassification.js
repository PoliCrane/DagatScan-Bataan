/**
 * Erosion risk classification — single source of truth for the backend.
 *
 * Scheme follows MGB's published "Coastal susceptibility / Physical
 * vulnerability rating criteria" (Table 1, Temporal changes in shoreline
 * position, meters/yr): 5 tiers driven by erosion_rate (m/year, negative =
 * erosion/retreat, positive = accretion/growth).
 *
 * Kept as an ordered first-match tier table so adding/adjusting a tier later
 * is a one-line change, not a rewrite of every call site. The frontend has
 * its own copy (frontend/src/utils/segmentData.js) — no shared package
 * between the two runtimes, so after editing either file's thresholds, run
 * `node backend/verify-risk-tiers-sync.js` to confirm they still agree.
 */

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

module.exports = { classifyErosionRisk, RISK_COLORS, RISK_LABELS };
