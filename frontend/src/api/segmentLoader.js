/**
 * Segment Loader Service
 * Fetches real erosion data from database and creates segment definitions
 * Falls back to hardcoded segments if database data unavailable
 */

import { classifyErosionRisk, getRiskColor } from "../utils/segmentData";

import { API_BASE_URL } from "../config/api";
// Re-exported so existing imports (e.g. areaSegments.js) keep working
// unchanged — segmentData.js is the single source of truth for classification.
export const calculateRiskLevel = classifyErosionRisk;
export { getRiskColor };

/**
 * Fetch zones from database and convert to segments
 * Uses actual GeoJSON geometries stored in database (no artificial coastline division)
 * @param {string} municipality - Municipality name
 * @param {number} year - Optional specific year to fetch (defaults to latest)
 * @returns {Promise<array>} - Array of segments with real coordinates from stored geometries
 */
export const fetchMunicipalitySegments = async (municipality, year = null) => {
  try {
    let url = `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipality)}/zones`;
    
    // If year specified, fetch only that year; otherwise fetch all and filter to latest
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
    
    // If no specific year requested, filter to latest year only
    if (!year && zones.length > 0) {
      const latestYear = Math.max(...zones.map(z => z.year));
      zones = zones.filter(z => z.year === latestYear);
      console.log(`✅ Loaded ${zones.length} zones for ${municipality} from database (year ${latestYear})`);
    } else {
      console.log(`✅ Loaded ${zones.length} zones for ${municipality} from database${year ? ` (year ${year})` : ''}`);
    }

    // Convert database zones to segment format using actual stored geometries
    const segments = zones
      .filter(zone => zone.geojsonData && zone.geojsonData.geometry) // Only include zones with geometry
      .map((zone) => {
        // Calculate risk from erosionRate (don't trust stored riskLevel which may be wrong).
        // Pass the raw value through (not coerced to 0) so a null/undefined
        // rate (baseline years) correctly classifies as NO_DATA.
        const calculatedRisk = classifyErosionRisk(zone.erosionRate);

        // Extract coordinates from stored GeoJSON geometry
        const geometry = zone.geojsonData.geometry;
        let segmentCoords = [];
        
        if (geometry.type === "LineString") {
          segmentCoords = geometry.coordinates;
        } else if (geometry.type === "Polygon") {
          segmentCoords = geometry.coordinates[0]; // Use outer ring
        } else if (geometry.type === "MultiLineString") {
          segmentCoords = geometry.coordinates.flat();
        } else if (geometry.type === "MultiPolygon") {
          segmentCoords = geometry.coordinates.flat(2);
        }

        // Convert from GeoJSON [lon, lat] to Leaflet [lat, lon] format
        // GeoJSON: [120.65, 14.495] → Leaflet: [14.495, 120.65]
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

