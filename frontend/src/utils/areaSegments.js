/**
 * Builds one clickable segment per real analyzed shoreline area — either one
 * entry per distinct satellite-detected `specific_area`, or (when no
 * satellite areas exist) a single segment covering the whole polygon-derived
 * coastline. Shared by the Coastal Monitoring and Erosion Analysis pages so
 * both show the exact same segments for a municipality.
 *
 * Each segment's risk is classified from its OWN erosion rate (not a single
 * municipality-wide risk label), so a segment's polyline/marker color always
 * reflects that segment's current shoreline — not some other area's trend.
 */
import { calculateRiskLevel } from "../api/segmentLoader";

import { API_BASE_URL } from "../config/api";
export function buildAreaSegments(areas, fallbackErosionRate) {
  if (!areas || areas.length === 0) return [];

  return areas.map((area, index) => {
    const shoreline = area.coastlinePoints;
    const hasSufficientData = area.hasSufficientData ?? false;
    // Prefer this area's own regression-based LRR; only fall back to the
    // municipality-wide rate when the area itself lacks a computed one.
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
      // Sufficient-data segments show lrrConfidence/year/source as their own
      // stat rows instead (SegmentsPanel.jsx, coastalmonitoring.jsx) — this
      // stays reserved for the actionable insufficient-data warning.
      description: hasSufficientData
        ? null
        : `Only ${yearsAvailable.length} year${yearsAvailable.length === 1 ? "" : "s"} on record — upload another year to enable trend analysis`,
    };
  });
}

/**
 * Fetches the satellite-detected coastline area(s) for a municipality, and
 * falls back to a single "Main Coastline" area (using the polygon-derived
 * coastline + a fetched municipality-wide LRR) when no satellite-analyzed
 * area exists yet.
 */
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

  // No satellite-analyzed area yet — fall back to the polygon-derived
  // coastline as a single area, gated on real year count.
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
