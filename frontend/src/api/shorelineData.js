/**
 * Shoreline Data Service
 * Provides unified interface for fetching real data from database
 * Automatically falls back to simulated data if database is empty
 */

import { generateYearlyShorelineData } from "../utils/fakeDataset";

import { API_BASE_URL as BACKEND_URL } from "../config/api";
const API_BASE_URL = `${BACKEND_URL}/api`;

// Returns null (not []) on failure/empty so callers know to fall back to simulated data
export const fetchMunicipalityData = async (
  municipality,
  options = {}
) => {
  try {
    const { startYear, endYear, sourceType } = options;
    let url = `${API_BASE_URL}/shoreline/municipality/${encodeURIComponent(
      municipality
    )}`;

    const params = [];
    if (startYear) params.push(`startYear=${startYear}`);
    if (endYear) params.push(`endYear=${endYear}`);
    if (sourceType) params.push(`sourceType=${sourceType}`);

    if (params.length > 0) url += `?${params.join("&")}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(
        `⚠️ Database query failed for ${municipality} (HTTP ${response.status}). No data available.`
      );
      return null; // Return null to trigger fallback
    }

    const result = await response.json();
    console.log(`✅ Successfully loaded ${result.data?.length || 0} records from database for ${municipality}`);
    return result.data;
  } catch (error) {
    console.warn(
      `Error fetching real data for ${municipality}:`,
      error.message
    );
    return null; // Return null to trigger fallback
  }
};

export const getFallbackData = (
  coastlinePoints,
  municipality,
  startYear = 2015,
  endYear = 2026
) => {
  console.log(
    `⚠ Using simulated data for ${municipality} (${startYear}-${endYear})`
  );
  return generateYearlyShorelineData(coastlinePoints, startYear, endYear);
};

// erosion is positive = inland, negative = accretion/seaward
const offsetCoastlineByErosion = (coastlinePoints, erosion) => {
  if (!coastlinePoints || coastlinePoints.length < 2) return [];

  return coastlinePoints.map((point, index) => {
    // Calculate perpendicular direction to offset
    let normal = [0, 0];

    if (index === 0) {
      const next = coastlinePoints[1];
      normal = [next[1] - point[1], -(next[0] - point[0])];
    } else if (index === coastlinePoints.length - 1) {
      const prev = coastlinePoints[index - 1];
      normal = [point[1] - prev[1], -(point[0] - prev[0])];
    } else {
      const prev = coastlinePoints[index - 1];
      const next = coastlinePoints[index + 1];
      normal = [(next[1] - prev[1]) / 2, -((next[0] - prev[0]) / 2)];
    }

    // Normalize
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
    if (length === 0) return point;

    normal[0] /= length;
    normal[1] /= length;

    // Apply offset (1 degree ≈ 111 km)
    const offsetDegrees = (erosion / 111000);

    return [
      point[0] + normal[0] * offsetDegrees,
      point[1] + normal[1] * offsetDegrees,
    ];
  });
};

// Tries the database first, falls back to simulated data when empty/unavailable
export const getShorelineData = async (
  municipality,
  coastlinePoints,
  options = {}
) => {
  const { startYear = 2015, endYear = 2026, useFallback = true } = options;

  // Try to fetch real data from database
  const realData = await fetchMunicipalityData(municipality, {
    startYear,
    endYear,
  });

  if (realData && realData.length > 0 && coastlinePoints && coastlinePoints.length > 0) {
    // Enrich real data with calculated shoreline coordinates
    return realData.map((yearData) => ({
      ...yearData,
      shoreline: offsetCoastlineByErosion(coastlinePoints, yearData.cumulativeErosion),
    }));
  }

  // Fallback to simulated data if enabled
  if (useFallback && coastlinePoints && coastlinePoints.length > 0) {
    console.log(`⚠️ No real data found for ${municipality} - using simulated data (${startYear}-${endYear})`);
    return getFallbackData(
      coastlinePoints,
      municipality,
      startYear,
      endYear
    );
  }

  // No data and no fallback
  if (!useFallback) {
    console.error(`❌ No real data found for ${municipality} and fallback is disabled. Map will have no shoreline data.`);
  }

  return [];
};

export const getYearData = async (municipality, year) => {
  try {
    const url = `${API_BASE_URL}/shoreline/municipality/${encodeURIComponent(
      municipality
    )}/year/${year}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${year} data for ${municipality}:`, error);
    return null;
  }
};

// For seeding test/demo data
export const seedDatabaseWithSimulatedData = async (
  municipality,
  options = {}
) => {
  try {
    const { startYear = 2015, endYear = 2026 } = options;

    const response = await fetch(`${API_BASE_URL}/shoreline/seed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        municipality,
        startYear,
        endYear,
      }),
    });

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✓ Seeded ${municipality} with simulated data`);
    return data;
  } catch (error) {
    console.error(`Error seeding ${municipality}:`, error);
    return null;
  }
};

// Admin only
export const deleteMunicipalityData = async (municipality) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/shoreline/municipality/${encodeURIComponent(
        municipality
      )}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✓ Deleted data for ${municipality}`);
    return data;
  } catch (error) {
    console.error(`Error deleting data for ${municipality}:`, error);
    return null;
  }
};

// Tells the UI whether it's showing live or simulated data
export const getDataSourceInfo = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (response.ok) {
      return {
        backend: "connected",
        timestamp: new Date(),
      };
    }
  } catch (error) {
    console.warn("Backend not available");
  }

  return {
    backend: "disconnected",
    note: "Using simulated data only",
  };
};
