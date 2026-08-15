/**
 * Builds one clickable segment per analyzed shoreline area — one per
 * satellite-detected `specific_area`, or a single polygon-derived segment
 * if none exist. Each segment's risk is classified from its own erosion rate.
 */
import { calculateRiskLevel } from "../api/segmentLoader";

import { API_BASE_URL } from "../config/api";
export function buildAreaSegments(areas, fallbackErosionRate) {
  if (!areas || areas.length === 0) return [];

  return areas.map((area, index) => {
    const shoreline = area.coastlinePoints;
    const hasSufficientData = area.hasSufficientData ?? false;
    // prefer the area's own LRR, fall back to municipality-wide rate
    const erosionRate = area.lrrRate ?? fallbackErosionRate ?? 0;
    const yearsAvailable = area.yearsAvailable || [];

    return {
      id: area.specificArea ? `AREA_${area.specificArea}` : `AREA_${index + 1}`,
      name: area.specificArea || `Area ${index + 1}`,
      shoreline,
      markerPosition: shoreline[Math.floor(shoreline.length / 2)],
      risk: calculateRiskLevel(erosionRate),
      erosionRate,
      lrrConfidence: area.lrrConfidence ?? null,
      unit: "m/year",
      source: area.sourceType,
      year: area.year,
      yearsAvailable,
      hasSufficientData,
      // reserved for the insufficient-data warning message
      description: hasSufficientData
        ? null
        : `Only ${yearsAvailable.length} year${yearsAvailable.length === 1 ? "" : "s"} on record — upload another year to enable trend analysis`,
    };
  });
}

// fetches satellite-detected areas, or falls back to a single "Main Coastline" area from the polygon + municipality-wide LRR
export async function fetchAreaSegments(municipality, fallbackShoreline, yearlyShorelineData) {
  try {
    const satRes = await fetch(
      `${API_BASE_URL}/api/shoreline/satellite-coastline/${encodeURIComponent(municipality)}`
    );
    if (satRes.ok) {
      const satData = await satRes.json();
      if (satData.hasSatelliteCoastline && satData.areas?.length > 0) {
        return { segments: buildAreaSegments(satData.areas), satelliteAreas: satData.areas };
      }
    }
  } catch (err) {
    console.warn(`Could not fetch satellite coastline for ${municipality}:`, err.message);
  }

  // no satellite area yet — fall back to the polygon-derived coastline
  if (!fallbackShoreline || fallbackShoreline.length < 2) {
    return { segments: [], satelliteAreas: [] };
  }

  const hasSufficientData = yearlyShorelineData.length >= 2;
  let lrrRate = null;
  let lrrConfidence = null;
  if (hasSufficientData) {
    try {
      const lrrRes = await fetch(
        `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipality)}/epr`
      );
      if (lrrRes.ok) {
        const lrrData = await lrrRes.json();
        lrrRate = lrrData.epr_rate;
        lrrConfidence = lrrData.confidence;
      }
    } catch (err) {
      console.warn(`Could not fetch LRR for fallback coastline (${municipality}):`, err.message);
    }
  }

  const fallbackArea = {
    specificArea: "Main Coastline",
    coastlinePoints: fallbackShoreline,
    sourceType: "Polygon Boundary",
    hasSufficientData,
    lrrRate,
    lrrConfidence,
    yearsAvailable: yearlyShorelineData.map((y) => y.year),
    year: yearlyShorelineData[yearlyShorelineData.length - 1]?.year,
  };

  return { segments: buildAreaSegments([fallbackArea]), satelliteAreas: [] };
}
