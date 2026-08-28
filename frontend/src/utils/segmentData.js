/**
 * Erosion risk classification — single source of truth for the frontend.
 * Tiers follow MGB's published shoreline-change rating criteria (Table 1, m/year).
 * Backend has its own copy (backend/services/riskClassification.js) — run
 * `node backend/verify-risk-tiers-sync.js` after editing either file's thresholds.
 */

const RISK_TIERS = [
  { key: "VERY_HIGH", test: (r) => r <= -5 },
  { key: "HIGH", test: (r) => r <= -1 },
  { key: "MODERATE", test: (r) => r < 1 },
  { key: "LOW", test: (r) => r < 5 },
  { key: "VERY_LOW", test: () => true },
];

export const SEGMENT_COLORS = {
  VERY_HIGH_RISK: "#c0392b",
  HIGH_RISK: "#e67e22",
  MODERATE_RISK: "#f1c40f",
  LOW_RISK: "#27ae60",
  VERY_LOW_RISK: "#2980b9",
  NO_DATA: "#617172",
};

export const SEGMENT_RISK_LEVELS = {
  VERY_HIGH: "Very High",
  HIGH: "High",
  MODERATE: "Moderate",
  LOW: "Low",
  VERY_LOW: "Very Low",
  NO_DATA: "No Data",
};

/**
 * Classify an erosion rate (m/year) into a risk tier key.
 * @param {number|null|undefined} erosionRate
 * @returns {string} One of VERY_HIGH/HIGH/MODERATE/LOW/VERY_LOW/NO_DATA
 */
export const classifyErosionRisk = (erosionRate) => {
  if (erosionRate === null || erosionRate === undefined) return "NO_DATA";
  const rate = Number(erosionRate);
  if (Number.isNaN(rate)) return "NO_DATA";
  return RISK_TIERS.find((tier) => tier.test(rate)).key;
};

/**
 * Get color for a risk tier key
 */
export const getRiskColor = (riskLevel) => {
  const normalizedLevel = (riskLevel || "").toUpperCase().trim();
  const riskMap = {
    VERY_HIGH: SEGMENT_COLORS.VERY_HIGH_RISK,
    HIGH: SEGMENT_COLORS.HIGH_RISK,
    MODERATE: SEGMENT_COLORS.MODERATE_RISK,
    LOW: SEGMENT_COLORS.LOW_RISK,
    VERY_LOW: SEGMENT_COLORS.VERY_LOW_RISK,
    NO_DATA: SEGMENT_COLORS.NO_DATA,
  };
  return riskMap[normalizedLevel] || SEGMENT_COLORS.MODERATE_RISK;
};
