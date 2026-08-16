import Layout from "../components/Layout";
import MapLegend from "../components/MapLegend";
import CoastalSummary from "../components/CoastalSummary";
import SatelliteToggle from "../components/SatelliteToggle";
import SegmentsPanel from "../components/SegmentsPanel";
import { MapContainer, Marker, Popup, TileLayer, GeoJSON, useMap, Polyline } from 'react-leaflet'
import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./index-organized.css";
import "./styles/segments.css";
import { extractCoastline, smoothCoastline, filterSegmentsToCoastalOnly } from "../utils/coastlineUtils";
import { getShorelineData } from "../api/shorelineData";
import { fetchAreaSegments } from "../utils/areaSegments";
import { getRiskColor, SEGMENT_RISK_LEVELS } from "../utils/segmentData";
import useGuidedTour from "../hooks/useGuidedTour";
import useMunicipalityDataStatus from "../hooks/useMunicipalityDataStatus";
import TourInfoButton from "../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../tours/pageIds";
import { coastalMonitoringSteps } from "../tours/steps/coastalMonitoringSteps";

function MapController({ geoJsonData, bataanBounds, selectedMunicipality, municipalityBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // If municipality selected, zoom to it
    if (selectedMunicipality && municipalityBounds) {
      map.fitBounds(municipalityBounds, { padding: [50, 50] });
    } 
    // Otherwise show all Bataan
    else if (geoJsonData && bataanBounds) {
      map.fitBounds(bataanBounds, { padding: [20, 20] });
    }

  }, [selectedMunicipality, municipalityBounds, geoJsonData, bataanBounds, map]);

  return null;
}

export default function CoastalMonitoring() {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [bataanBounds, setBataanBounds] = useState(null);
  const [isSatellite, setIsSatellite] = useState(true);
  const [hoveredMunicipality, setHoveredMunicipality] = useState(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState(null);
  const [municipalityBounds, setMunicipalityBounds] = useState(null);
  const [yearlyShorelineData, setYearlyShorelineData] = useState([]);
  const [segments, setSegments] = useState([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [showSegmentsPanel, setShowSegmentsPanel] = useState(false);
  const municipalitiesWithData = useMunicipalityDataStatus();

  // Store original segment coordinates to prevent cumulative drift
  const originalSegmentsRef = useRef([]);

  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.COASTAL_MONITORING, coastalMonitoringSteps);

  useEffect(() => {
    const loadGeoJson = async () => {
      try {
        const response = await fetch("/data/BATAAN.geojson");
        const data = await response.json();
        setGeoJsonData(data);

        // Calculate bounds from GeoJSON to fit ONLY Bataan
        const geoJsonLayer = L.geoJSON(data);
        const bounds = geoJsonLayer.getBounds();
        setBataanBounds(bounds);
      } catch (error) {
        console.error("Error loading GeoJSON:", error);
      }
    };

    loadGeoJson();
  }, []);

  // When municipality is selected, extract its coastline and fetch/generate yearly data
  useEffect(() => {
    if (!selectedMunicipality || !geoJsonData) {
      setYearlyShorelineData([]);
      setSegments([]);
      setShowSegmentsPanel(false);
      return;
    }

    try {
      // Find all features for this municipality
      const municipalityFeatures = geoJsonData.features.filter(
        (feature) => feature.properties?.MUNICIPALI?.toUpperCase() === selectedMunicipality.toUpperCase()
      );

      if (municipalityFeatures.length === 0) {
        console.warn(`Municipality ${selectedMunicipality} not found`);
        return;
      }

      // Filter to only Polygon features and find the largest one
      const polygonFeatures = municipalityFeatures.filter(f => f.geometry?.type === "Polygon");
      let mainFeature = polygonFeatures[0];

      if (polygonFeatures.length > 1) {
        mainFeature = polygonFeatures.reduce((largest, current) => {
          const largestBounds = L.geoJSON(largest).getBounds();
          const currentBounds = L.geoJSON(current).getBounds();
          const largestArea = (largestBounds.getEast() - largestBounds.getWest()) * (largestBounds.getNorth() - largestBounds.getSouth());
          const currentArea = (currentBounds.getEast() - currentBounds.getWest()) * (currentBounds.getNorth() - currentBounds.getSouth());
          return currentArea > largestArea ? current : largest;
        });
      }

      // Calculate bounds for this municipality
      const muniGeoJsonLayer = L.geoJSON(mainFeature);
      const muniBounds = muniGeoJsonLayer.getBounds();
      setMunicipalityBounds(muniBounds);

      // Extract coastline using topological edge detection
      // Pass all municipalities for boundary comparison
      const rawCoastline = extractCoastline(geoJsonData, selectedMunicipality);
      
      if (rawCoastline.length === 0) {
        console.warn(`No coastline found for ${selectedMunicipality}`);
        setYearlyShorelineData([]);
        setSegments([]);
        setShowSegmentsPanel(false);
        return;
      }

      const smoothedCoastline = smoothCoastline(rawCoastline, 1);

      // Fetch real data from database — no simulated fallback exists
      (async () => {
        const yearly = await getShorelineData(selectedMunicipality, smoothedCoastline, {
          startYear: 2015,
          endYear: new Date().getFullYear(),
        });
        
        setYearlyShorelineData(yearly);
        
        // Alert if no data was loaded (fallback is disabled)
        if (!yearly || yearly.length === 0) {
          console.error(`❌ No shoreline data loaded for ${selectedMunicipality} - database may not have records yet`);
          setYearlyShorelineData([]);
          setSegments([]);
          setShowSegmentsPanel(false);
          return;
        }
        
        // Log loaded data
        if (yearly && yearly.length > 0) {
          const latestYear = yearly[yearly.length - 1].year;
          console.log(`✅ Loaded ${yearly.length} years of data for ${selectedMunicipality} (${yearly[0].year}-${latestYear})`);
        }

        // Same satellite-detected coastline pipeline as Erosion Analysis;
        // falls back to the polygon coastline as one area if no satellite data yet.
        const { segments: segmentsToDisplay_Final } = await fetchAreaSegments(
          selectedMunicipality,
          smoothedCoastline,
          yearly
        );

        console.log(`✅ Segment visualization ready: ${segmentsToDisplay_Final.length} segments (satellite-detected coastline)`);
        
        setSegments(segmentsToDisplay_Final);
        
        // Store original segments for year filter calculations
        originalSegmentsRef.current = segmentsToDisplay_Final.map(seg => ({
          ...seg,
          shoreline: [...seg.shoreline] // Deep copy of original coordinates
        }));
        console.log(`Stored ${originalSegmentsRef.current.length} segments in originalSegmentsRef for year filter calculations`);
        setShowSegmentsPanel(true);

        // If we don't have municipality bounds from GeoJSON (for municipalities outside main boundary file),
        // calculate bounds from segment coordinates
        if (!municipalityBounds && segmentsToDisplay_Final && segmentsToDisplay_Final.length > 0) {
          const allCoords = [];
          segmentsToDisplay_Final.forEach(segment => {
            if (segment.shoreline && Array.isArray(segment.shoreline)) {
              allCoords.push(...segment.shoreline);
            }
          });
          
          if (allCoords.length > 0) {
            const segmentBounds = L.latLngBounds(allCoords);
            setMunicipalityBounds(segmentBounds);
            console.log(`Calculated bounds from ${segmentsToDisplay_Final.length} segments for ${selectedMunicipality}`);
          }
        }

        console.log(`Loaded ${selectedMunicipality} with ${yearly.length} years of shoreline data and ${segmentsToDisplay_Final.length} segments`);
      })();
    } catch (error) {
      console.error(`Error processing ${selectedMunicipality}:`, error);
      setYearlyShorelineData([]);
      setSegments([]);
      setShowSegmentsPanel(false);
    }
  }, [selectedMunicipality, geoJsonData]);

  // Handle municipality click
  const handleMunicipalityClick = (feature) => {
    const municipalityName = feature.properties?.MUNICIPALI;
    setSelectedMunicipality(municipalityName);
  };

  // Default to Bataan center if bounds not yet calculated
  const centerPoint = bataanBounds 
    ? bataanBounds.getCenter() 
    : [14.657, 120.500];

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <MapLegend />
      <CoastalSummary 
  yearlyData={yearlyShorelineData}
  selectedMunicipality={selectedMunicipality}
  segments={segments}
/>
      <SatelliteToggle isSatellite={isSatellite} onToggle={() => setIsSatellite(!isSatellite)} />
      
      <div style={{ padding: "20px", position: "relative" }}>
        <MapContainer center={centerPoint} zoom={12} scrollWheelZoom={true} zoomControl={false} style={{ height: "100vh", width: "100%" }} minZoom={11} maxZoom={15}>
          {isSatellite ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
            />
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
          )}

          {geoJsonData && municipalitiesWithData && (
            <GeoJSON
              data={geoJsonData}
              style={(feature) => {
                const name = feature.properties?.MUNICIPALI?.toUpperCase();
                const isLocked = !municipalitiesWithData.has(name);

                if (isLocked) {
                  return {
                    color: "#6B7280",
                    weight: 2,
                    opacity: 0.5,
                    fillColor: "#9CA3AF",
                    fillOpacity: 0.25,
                    cursor: "not-allowed",
                  };
                }

                const isSelected = name === selectedMunicipality?.toUpperCase();
                const isHovered = name === hoveredMunicipality?.toUpperCase();

                return {
                  color: isSelected ? "#0096FF" : isHovered ? "#3b82f6" : "	#89CFF0",
                  weight: isSelected ? 2 : isHovered ? 2.5 : 2,
                  opacity: isSelected ? 1 : isHovered ? 0.95 : 0.3,
                  fillColor: isSelected ? "#7393B3" : isHovered ? "#0054dc" : "	#F0FFFF",
                  fillOpacity: isSelected ? 0.1 : isHovered ? 0.4 : 0.1,
                  cursor: "pointer",
                };
              }}
              onEachFeature={(feature, layer) => {
                const name = feature.properties?.MUNICIPALI?.toUpperCase();
                const isLocked = !municipalitiesWithData.has(name);

                if (isLocked) {
                  layer.bindTooltip(
                    `No monitoring data available yet for ${feature.properties?.MUNICIPALI}`,
                    { sticky: true, direction: "top" }
                  );
                }

                layer.on("click", () => {
                  if (isLocked) return;
                  handleMunicipalityClick(feature);
                });

                layer.on("mouseover", () => {
                  if (isLocked) return;
                  setHoveredMunicipality(feature.properties?.MUNICIPALI);
                });

                layer.on("mouseout", () => {
                  setHoveredMunicipality(null);
                });
              }}
            />
          )}

          {/* Display Segment Polylines when municipality is selected */}
          {selectedMunicipality && segments.length > 0 && segments.map((segment) => {
            const riskColor = getRiskColor(segment.risk);
            return (
              <Polyline
                key={`polyline-${segment.id}`}
                positions={segment.shoreline}
                color={riskColor}
                weight={4}
                opacity={0.9}
              />
            );
          })}

          {/* Display Segment Markers positioned at midpoint of each segment */}
          {selectedMunicipality && segments.length > 0 && segments.map((segment) => {
            const riskColor = getRiskColor(segment.risk);
            // Calculate midpoint of the shoreline for marker placement
            const markerPosition = segment.shoreline[Math.floor(segment.shoreline.length / 2)];
            
            return markerPosition ? (
              <Marker
                key={`marker-${segment.id}`}
                position={markerPosition}
                icon={L.divIcon({
                  className: `segment-marker risk-${segment.risk.toLowerCase().replace(/_/g, "-")}`,
                  html: `<div class="segment-marker-icon" style="background: ${riskColor}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white;">!</div>`,
                  iconSize: [32, 32],
                })}
              >
                <Popup className="segment-marker-popup">
                  <div className="segment-marker-popup-header">{segment.name}</div>
                  <div
                    className="segment-marker-popup-risk"
                    style={{ background: `${riskColor}22`, color: riskColor }}
                  >
                    {SEGMENT_RISK_LEVELS[segment.risk] || segment.risk}
                  </div>
                  {segment.description && (
                    <div className="segment-marker-popup-info">{segment.description}</div>
                  )}
                  <div className="segment-marker-popup-rate">
                    <strong>Erosion Rate:</strong> {segment.erosionRate} {segment.unit}
                    {segment.year != null && <> · <strong>Latest:</strong> {segment.year}</>}
                  </div>
                </Popup>
              </Marker>
            ) : null;
          })}

          <MapController 
            geoJsonData={geoJsonData} 
            bataanBounds={bataanBounds}
            selectedMunicipality={selectedMunicipality}
            municipalityBounds={municipalityBounds}
          />
        </MapContainer>

        {/* Segments Panel */}
        <SegmentsPanel
          showPanel={showSegmentsPanel}
          selectedMunicipality={selectedMunicipality}
          segments={segments}
          selectedSegment={selectedSegment}
          onClose={() => {
            setSelectedMunicipality(null);
            setShowSegmentsPanel(false);
          }}
          onSelectSegment={setSelectedSegment}
        />
      </div>
    </Layout>
  )
}


