/**
 * EPR (End Point Rate) Utilities
 * Functions for calculating and generating shorelines using EPR method
 */

// Position(t) = Position(ref) + EPR × (t - ref_year); epr is negative for erosion, positive for accretion
export const calculatePositionByEPR = (
  referencePosition,
  epr,
  targetYear,
  referenceYear = 2026
) => {
  if (!epr || isNaN(epr)) {
    console.warn("Invalid EPR, returning reference position");
    return referencePosition;
  }

  const yearsDifference = targetYear - referenceYear;
  return referencePosition + (epr * yearsDifference);
};

// Moves each point perpendicular to the coastline direction; offset is positive = inland, negative = seaward
const defaultOffsetCoastline = (coastlinePoints, offset) => {
  if (!coastlinePoints || coastlinePoints.length < 2) return [];

  return coastlinePoints.map((point, index) => {
    let normal = [0, 0];

    if (index === 0) {
      // First point: use direction to next point
      const next = coastlinePoints[1];
      normal = [next[1] - point[1], -(next[0] - point[0])];
    } else if (index === coastlinePoints.length - 1) {
      // Last point: use direction from previous point
      const prev = coastlinePoints[index - 1];
      normal = [point[1] - prev[1], -(point[0] - prev[0])];
    } else {
      // Middle point: average of surrounding directions (2-sided normal)
      const prev = coastlinePoints[index - 1];
      const next = coastlinePoints[index + 1];
      normal = [(next[1] - prev[1]) / 2, -((next[0] - prev[0]) / 2)];
    }

    // Normalize to unit vector
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
    if (length === 0) return point;

    normal[0] /= length;
    normal[1] /= length;

    // Convert offset from meters to degrees
    // 1 degree latitude ≈ 111 km
    const offsetDegrees = offset / 111000;

    return [
      point[0] + normal[0] * offsetDegrees,
      point[1] + normal[1] * offsetDegrees,
    ];
  });
};

// Simple linear EPR model driven by a single rate value, works for any year (past/future)
export const generateShoreline_ByEPR = (
  referenceShoreline,
  epr,
  targetYear,
  referenceYear = 2026,
  offsetFunction = defaultOffsetCoastline
) => {
  if (!referenceShoreline || referenceShoreline.length === 0) {
    console.warn("Invalid reference shoreline");
    return [];
  }

  if (!epr || isNaN(epr)) {
    console.warn("Invalid EPR, returning reference shoreline");
    return referenceShoreline;
  }

  // Calculate total position change
  // Negate EPR so positive erosion moves shoreline INLAND (negative offset)
  const yearDifference = targetYear - referenceYear;
  const totalPositionChange = -epr * yearDifference;

  // Apply perpendicular offset
  return offsetFunction(referenceShoreline, totalPositionChange);
};

// Position(t) = Position₀ + EPR×Δt + 0.5×trend×Δt² — adds an acceleration term to the linear EPR model
export const generateShoreline_EPRWithTrend = (
  referenceShoreline,
  epr,
  trend = 0,
  targetYear,
  referenceYear = 2026,
  offsetFunction = defaultOffsetCoastline
) => {
  if (!referenceShoreline || referenceShoreline.length === 0) {
    return [];
  }

  const Δt = targetYear - referenceYear;

  // Linear term: EPR × time
  // Negate EPR so positive erosion moves shoreline INLAND (negative offset)
  const linearChange = -epr * Δt;

  // Quadratic term: 0.5 × acceleration × time²
  const accelerationChange = 0.5 * trend * (Δt * Δt);

  // Total change
  const totalChange = linearChange + accelerationChange;

  return offsetFunction(referenceShoreline, totalChange);
};

export const calculateEPRConfidence = (
  dataYears,
  erosionRateVariance = 0
) => {
  if (!dataYears || dataYears.length === 0) {
    return 0.5; // Default neutral confidence
  }

  const timeSpan = Math.max(...dataYears) - Math.min(...dataYears);

  // More years = more confident (reach max at 15+ years)
  const timeConfidence = Math.min(timeSpan / 15, 1);

  // Less variation = more confident
  const varianceConfidence = Math.max(1 - (erosionRateVariance / 2), 0.3);

  // Weighted average: 70% time, 30% variance
  return timeConfidence * 0.7 + varianceConfidence * 0.3;
};

export const formatEPR = (epr, decimals = 2) => {
  const value = Math.abs(Number(epr) || 0).toFixed(decimals);
  const direction = epr < 0 ? "Erosion" : epr > 0 ? "Accretion" : "Stable";
  return `${value} m/year (${direction})`;
};

export default {
  calculatePositionByEPR,
  generateShoreline_ByEPR,
  generateShoreline_EPRWithTrend,
  calculateEPRConfidence,
  formatEPR,
};
