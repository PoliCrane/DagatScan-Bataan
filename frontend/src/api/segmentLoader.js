// Fetches real erosion data from the database and builds segment definitions; returns null so callers can fall back to hardcoded segments.

import { classifyErosionRisk, getRiskColor } from "../utils/segmentData";

import { API_BASE_URL } from "../config/api";
// re-exported for existing imports; segmentData.js is the source of truth for classification
export const calculateRiskLevel = classifyErosionRisk;
export { getRiskColor };

// fetches zones from the database and converts to segments using their stored GeoJSON geometry
export const fetchMunicipalitySegments = async (municipality, year = null) => {
  try {
    let url = `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipality)}/zones`;

    if (year) {
      url += `?year=${year}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Database segments unavailable for ${municipality}, using fallback`);
      return null;
    }

    const data = await response.json();
    let zones = data.zones || [];
    
    // No year requested: show only the latest year's zones.
    if (!year && zones.length > 0) {
      const latestYear = Math.max(...zones.map(z => z.year));
      zones = zones.filter(z => z.year === latestYear);
      console.log(`✅ Loaded ${zones.length} zones for ${municipality} from database (year ${latestYear})`);
    } else {
      console.log(`✅ Loaded ${zones.length} zones for ${municipality} from database${year ? ` (year ${year})` : ''}`);
    }

    const segments = zones
      .filter(zone => zone.geojsonData && zone.geojsonData.geometry)
      .map((zone) => {
        // Recompute risk from erosionRate rather than trusting stored riskLevel; null/undefined passes through as NO_DATA.
        const calculatedRisk = classifyErosionRisk(zone.erosionRate);

        const geometry = zone.geojsonData.geometry;
        let segmentCoords = [];
        
        if (geometry.type === "LineString") {
          segmentCoords = geometry.coordinates;
        } else if (geometry.type === "Polygon") {
          segmentCoords = geometry.coordinates[0]; // outer ring
        } else if (geometry.type === "MultiLineString") {
          segmentCoords = geometry.coordinates.flat();
        } else if (geometry.type === "MultiPolygon") {
          segmentCoords = geometry.coordinates.flat(2);
        }

        // GeoJSON is [lon, lat]; Leaflet needs [lat, lon] — swap here.
        const leafletCoords = segmentCoords.map(coord => [coord[1], coord[0]]);

        console.log(`📍 Segment ${zone.id}: erosionRate=${zone.erosionRate} → risk=${calculatedRisk}, coords converted: ${leafletCoords.length} points`);
        
        return {
          id: `${municipality.toUpperCase()}_SEG_${zone.id}`,
          name: zone.specificArea || `Segment ${zone.id}`,
          risk: calculatedRisk,
          description: zone.erosionRate !== null && zone.erosionRate !== undefined
            ? `Erosion rate: ${zone.erosionRate.toFixed(2)} m/year | Cumulative: ${zone.cumulativeErosion.toFixed(2)} m`
            : "No erosion rate yet (baseline year)",
          erosionRate: zone.erosionRate,
          cumulativeErosion: zone.cumulativeErosion,
          unit: "m/year",
          shoreline: leafletCoords,
          color: getRiskColor(calculatedRisk),
          dataQuality: zone.dataQuality,
          year: zone.year,
          sourceType: zone.sourceType,
        };
      });

    if (segments.length === 0) {
      console.warn(`No zones with valid geometry found for ${municipality}`);
      return null;
    }

    return segments;
  } catch (error) {
    console.warn(`Error fetching segments for ${municipality}:`, error);
    return null;
  }
};

