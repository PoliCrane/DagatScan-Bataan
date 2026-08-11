import Layout from "../components/Layout";
import ErosionLegend from "../components/ErosionLegend";
import ErosionAnalysisCards from "../components/ErosionAnalysisCards";
import AnalysisToolsCards from "../components/AnalysisToolsCards";
import SatelliteToggle from "../components/SatelliteToggle";
import { MapContainer, Marker, Popup, TileLayer, GeoJSON, useMap, useMapEvents, Polyline, Polygon } from 'react-leaflet'
import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./index-organized.css";
import "./styles/erosionSegmentPopup.css";
import { extractCoastline, smoothCoastline, getCoastlineLength } from "../utils/coastlineUtils";
import { getShorelineData } from "../api/shorelineData";
import { generateShoreline_ByEPR } from "../utils/eprUtils";
import { buildAreaSegments } from "../utils/areaSegments";
import { classifyErosionRisk, getRiskColor, SEGMENT_RISK_LEVELS } from "../utils/segmentData";
import useGuidedTour from "../hooks/useGuidedTour";
import useMunicipalityDataStatus from "../hooks/useMunicipalityDataStatus";
import TourInfoButton from "../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../tours/pageIds";
import { erosionAnalysisSteps } from "../tours/steps/erosionAnalysisSteps";
import { API_BASE_URL } from "../config/api";
// Colors match ErosionLegend's meaning-based palette (current/previous/predicted).
const CURRENT_SHORELINE_COLOR = "#FF3131";
// Matches the "Erosion Area" legend swatch and the same shaded ribbon used
// in the generated PDF report's map (backend/routes/reports.js).
const EROSION_AREA_COLOR = "#fc4c00";
// Shown instead of EROSION_AREA_COLOR for accretion (positive erosion rate) —
// teal-green, distinct from the municipal boundary outline's blue family.
const ACCRETION_AREA_COLOR = "#66CDAA";
// Muted color for segments that don't have 2+ years of data yet — visible but
// clearly not interactive for Compare/Predict, so the area stays discoverable.
const LOCKED_SEGMENT_COLOR = "#9CA3AF";

function MapController({ geoJsonData, bataanBounds, selectedMunicipality, municipalityBounds, satelliteBounds }) {
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

  // Zoom to satellite detected area when it loads (it may be much smaller than municipality)
  useEffect(() => {
    if (!map || !satelliteBounds) return;
    map.fitBounds(satelliteBounds, { padding: [80, 80], maxZoom: 16 });
  }, [satelliteBounds, map]);

  return null;
}

// Municipality/segment clicks stop propagation, so any click reaching here
// is truly outside everything — back out to the full Bataan overview.
function MapClickOutsideHandler({ onOutsideClick }) {
  useMapEvents({
    click: () => onOutsideClick(),
  });
  return null;
}

export default function ErosionAnalysis() {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [bataanBounds, setBataanBounds] = useState(null);
  const [isSatellite, setIsSatellite] = useState(true);
  const [coastlinePoints, setCoastlinePoints] = useState([]);
  const [yearlyShorelineData, setYearlyShorelineData] = useState([]);
  const [municipalityStats, setMunicipalityStats] = useState(null);
  const [hoveredMunicipality, setHoveredMunicipality] = useState(null);
  const municipalitiesWithData = useMunicipalityDataStatus();

  // Municipality drill-down state
  const [selectedMunicipality, setSelectedMunicipality] = useState(null);
  const [municipalityBounds, setMunicipalityBounds] = useState(null);
  
  // Prediction state
  const [predictedYear, setPredictedYear] = useState(null);
  const [predictedShoreline, setPredictedShoreline] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  // Derived from the same per-segment EPR data used to draw the predicted
  // shoreline, so the card never disagrees with the map.
  const [predictionResult, setPredictionResult] = useState(null);

  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.EROSION_ANALYSIS, erosionAnalysisSteps);

  // Comparison state. *IsEstimated arrays flag whether each shoreline is real
  // uploaded geometry (measured) or an EPR-offset approximation (estimated).
  const [comparedYear, setComparedYear] = useState(null);
  const [comparedShoreline, setComparedShoreline] = useState(null);
  const [comparedIsEstimated, setComparedIsEstimated] = useState([]);
  const [selectedYearComparison, setSelectedYearComparison] = useState(null);
  const [selectedYearShoreline, setSelectedYearShoreline] = useState(null);
  const [selectedYearIsEstimated, setSelectedYearIsEstimated] = useState([]);
  // Per-segment erosion rate for the compared pair, used only to pick the
  // change-area ribbon color (erosion vs. accretion) — not displayed directly.
  const [comparedSegmentErosionRate, setComparedSegmentErosionRate] = useState([]);

  // Shoreline segment selection — lets the user restrict compare/predict to
  // one stretch of coast instead of the entire current shoreline
  const [shorelineSegments, setShorelineSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);

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

  // Satellite-detected measured waterline(s) — one entry per distinct
  // analyzed area (specific_area), separate from the polygon-based simulation
  const [satelliteAreas, setSatelliteAreas] = useState([]);
  const [satelliteBounds, setSatelliteBounds] = useState(null);

  // When municipality is selected, extract its coastline and generate yearly data
  useEffect(() => {
    if (!selectedMunicipality || !geoJsonData) {
      setCoastlinePoints([]);
      setYearlyShorelineData([]);
      setMunicipalityStats(null);
      setSatelliteAreas([]);
      setSatelliteBounds(null);
      return;
    }

    try {
      // Find all features for this municipality (handles multiple polygons/islands)
      const municipalityFeatures = geoJsonData.features.filter(
        (feature) => feature.properties?.MUNICIPALI?.toUpperCase() === selectedMunicipality.toUpperCase()
      );

      if (municipalityFeatures.length === 0) {
        console.warn(`Municipality ${selectedMunicipality} not found`);
        return;
      }

      // Filter to only Polygon features and find the largest one (main landmass)
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

      // Always extract the polygon coastline as fallback baseline
      const rawCoastline = extractCoastline(geoJsonData, selectedMunicipality);
      const smoothedCoastline = rawCoastline.length > 0 ? smoothCoastline(rawCoastline, 1) : [];

      (async () => {
        // Polygon coastline is the base for offset simulation; satellite
        // coastline loads separately as the "Current Measured Shoreline".
        if (smoothedCoastline.length === 0) {
          console.warn(`No polygon coastline found for ${selectedMunicipality}`);
          setCoastlinePoints([]);
          setYearlyShorelineData([]);
          setMunicipalityStats(null);
          setSatelliteAreas([]);
          return;
        }

        setCoastlinePoints(smoothedCoastline);

        // 404 with a valid body means "no satellite data" — branch on
        // hasSatelliteCoastline, not res.ok, or stale areas stick on screen.
        try {
          const satRes = await fetch(`${API_BASE_URL}/api/shoreline/satellite-coastline/${encodeURIComponent(selectedMunicipality)}`);
          const satData = await satRes.json();
          if (satData.hasSatelliteCoastline && satData.areas?.length > 0) {
            setSatelliteAreas(satData.areas);
            // Compute bounds across all analyzed areas so MapController can zoom to them
            const allPoints = satData.areas.flatMap(a => a.coastlinePoints);
            const lats = allPoints.map(p => p[0]);
            const lngs = allPoints.map(p => p[1]);
            setSatelliteBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]);
            console.log(`✓ Loaded ${satData.areas.length} satellite-analyzed area(s) for ${selectedMunicipality}`);
          } else {
            setSatelliteAreas([]);
            setSatelliteBounds(null);
          }
        } catch (satErr) {
          console.warn('Could not fetch satellite coastline:', satErr.message);
          setSatelliteAreas([]);
          setSatelliteBounds(null);
        }

        // Fetch yearly erosion data using polygon coastline as base
        const yearly = await getShorelineData(selectedMunicipality, smoothedCoastline, {
          startYear: 2015,
          endYear: 2026,
          useFallback: false,
        });

        setYearlyShorelineData(yearly);

        if (!yearly || yearly.length === 0) {
          console.error(`❌ No shoreline data loaded for ${selectedMunicipality}`);
          setMunicipalityStats(null);
          return;
        }

        const baseErosionRate = yearly[yearly.length - 1].erosionRate;

        const stats = {
          averageErosionRate: baseErosionRate,
          totalRetreat: yearly[yearly.length - 1].cumulativeErosion - yearly[0].cumulativeErosion,
          currentYear: yearly[yearly.length - 1].year,
          startYear: yearly[0].year,
          riskLevel: classifyErosionRisk(baseErosionRate),
        };

        setMunicipalityStats(stats);

        console.log(`Loaded ${selectedMunicipality}:`, {
          coastlinePoints: smoothedCoastline.length,
          coastlineLength: getCoastlineLength(smoothedCoastline),
          yearlyData: yearly.length,
          stats,
        });
      })();
    } catch (error) {
      console.error(`Error processing ${selectedMunicipality}:`, error);
    }
  }, [selectedMunicipality, geoJsonData]);

  // One segment per analyzed satellite area, or a single fallback segment
  // for the whole polygon coastline when none exist.
  useEffect(() => {
    if (!selectedMunicipality) {
      setShorelineSegments([]);
      setSelectedSegmentId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      let segments;
      if (satelliteAreas.length > 0) {
        segments = buildAreaSegments(satelliteAreas, municipalityStats?.averageErosionRate);
      } else {
        const fallbackShoreline = yearlyShorelineData[yearlyShorelineData.length - 1]?.shoreline;
        if (fallbackShoreline && fallbackShoreline.length >= 2) {
          // Fallback: whole polygon coastline as one area. Use the real LRR
          // regression (not just the latest erosion_rate) when enough years exist.
          const hasSufficientData = yearlyShorelineData.length >= 2;
          let lrrRate = null;
          let lrrConfidence = null;
          if (hasSufficientData) {
            try {
              const lrrRes = await fetch(
                `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(selectedMunicipality)}/epr`
              );
              if (lrrRes.ok) {
                const lrrData = await lrrRes.json();
                lrrRate = lrrData.epr_rate;
                lrrConfidence = lrrData.confidence;
              }
            } catch (err) {
              console.warn("Could not fetch LRR for fallback coastline:", err.message);
            }
          }

          segments = buildAreaSegments(
            [{
              specificArea: "Main Coastline",
              coastlinePoints: fallbackShoreline,
              sourceType: "Polygon Boundary",
              hasSufficientData,
              lrrRate,
              lrrConfidence,
              yearsAvailable: yearlyShorelineData.map((y) => y.year),
              year: yearlyShorelineData[yearlyShorelineData.length - 1]?.year,
            }],
            municipalityStats?.averageErosionRate
          );
        } else {
          segments = [];
        }
      }

      if (!cancelled) {
        setShorelineSegments(segments);
        setSelectedSegmentId(null); // reset selection whenever the underlying areas change
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMunicipality, satelliteAreas, yearlyShorelineData, municipalityStats]);

  // Handle municipality click
  const handleMunicipalityClick = (feature) => {
    const municipalityName = feature.properties?.MUNICIPALI;
    setSelectedMunicipality(municipalityName);
  };

  // Handle back to overview
  const handleBackToOverview = () => {
    setSelectedMunicipality(null);
    setCoastlinePoints([]);
    setYearlyShorelineData([]);
    setMunicipalityStats(null);
    setPredictedYear(null);
    setPredictedShoreline(null);
    setPredictionResult(null);
    setComparedYear(null);
    setComparedShoreline(null);
    setComparedIsEstimated([]);
    setSelectedYearComparison(null);
    setSelectedYearShoreline(null);
    setSelectedYearIsEstimated([]);
    setComparedSegmentErosionRate([]);
    setSatelliteAreas([]);
    setSatelliteBounds(null);
    setShorelineSegments([]);
    setSelectedSegmentId(null);
  };

  // Handle end simulation - revert to default state
  const handleEndSimulation = () => {
    setPredictedYear(null);
    setPredictedShoreline(null);
    setPredictionResult(null);
  };

  // Handle end comparison - revert to default state
  const handleEndComparison = () => {
    setComparedYear(null);
    setComparedShoreline(null);
    setComparedIsEstimated([]);
    setSelectedYearComparison(null);
    setSelectedYearShoreline(null);
    setSelectedYearIsEstimated([]);
    setComparedSegmentErosionRate([]);
  };

  // Real uploaded geometry for an exact year, when it exists, so Compare can
  // show measured data instead of an EPR-offset guess.
  const fetchRealAreaGeometryForYear = async (year) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/shoreline/satellite-coastline/${encodeURIComponent(selectedMunicipality)}?year=${year}`
      );
      if (!res.ok) return {};
      const data = await res.json();
      const byArea = {};
      (data.areas || []).forEach((area) => {
        byArea[area.specificArea || "Main Coastline"] = area.coastlinePoints;
      });
      return byArea;
    } catch (err) {
      console.warn(`Could not fetch real geometry for year ${year}:`, err.message);
      return {};
    }
  };

  // Same /shoreline-estimate endpoint as Predict, walking backward instead
  // of forward; used as fallback when no real geometry exists for the year.
  const fetchYearEstimates = async (targetYear, selectedSegment, baseYear) => {
    try {
      const areaParam = selectedSegment ? `&area=${encodeURIComponent(selectedSegment.name)}` : "";
      const res = await fetch(
        `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(selectedMunicipality)}/shoreline-estimate?baseYear=${baseYear}&targetYear=${targetYear}${areaParam}`
      );
      if (!res.ok) return {};
      const data = await res.json();
      const byArea = {};
      (data.segments || []).forEach((s) => {
        byArea[s.area] = s;
      });
      return byArea;
    } catch (err) {
      console.warn(`Could not fetch shoreline estimate for ${targetYear}:`, err.message);
      return {};
    }
  };

  // Compares the selected segment, or all sufficient-data segments if none
  // selected. Prefers real uploaded geometry for the exact year, falling
  // back to the EPR-offset estimate.
  const handleCompare = async (pastYear, selectedYear) => {
    const selectedSegment = shorelineSegments.find((s) => s.id === selectedSegmentId);

    if (selectedSegment && !selectedSegment.hasSufficientData) {
      console.warn(`${selectedSegment.name} doesn't have enough data yet to compare`);
      return;
    }

    const targetSegments = selectedSegment
      ? [selectedSegment]
      : shorelineSegments.filter((s) => s.hasSufficientData);

    if (targetSegments.length === 0) {
      return;
    }

    const currentYear = new Date().getFullYear();

    const [pastRealByArea, selectedRealByArea, pastEstimateByArea, selectedEstimateByArea] = await Promise.all([
      fetchRealAreaGeometryForYear(pastYear),
      fetchRealAreaGeometryForYear(selectedYear),
      fetchYearEstimates(pastYear, selectedSegment, currentYear),
      fetchYearEstimates(selectedYear, selectedSegment, currentYear),
    ]);

    const pastShoreline = [];
    const pastEstimated = [];
    const comparisonShoreline = [];
    const comparisonEstimated = [];
    const segmentErosionRates = [];

    targetSegments.forEach((seg) => {
      segmentErosionRates.push(seg.erosionRate);
      const realPast = pastRealByArea[seg.name];
      if (realPast && realPast.length > 0) {
        pastShoreline.push(realPast);
        pastEstimated.push(false);
      } else {
        // Past year should be MORE seaward (more land), so use POSITIVE offset
        const rate = pastEstimateByArea[seg.name]?.erosionRate ?? seg.erosionRate;
        pastShoreline.push(offsetCoastlineForPrediction(seg.shoreline, rate * (currentYear - pastYear)));
        pastEstimated.push(true);
      }

      const realSelected = selectedRealByArea[seg.name];
      if (realSelected && realSelected.length > 0) {
        comparisonShoreline.push(realSelected);
        comparisonEstimated.push(false);
      } else {
        const rate = selectedEstimateByArea[seg.name]?.erosionRate ?? seg.erosionRate;
        comparisonShoreline.push(offsetCoastlineForPrediction(seg.shoreline, rate * (currentYear - selectedYear)));
        comparisonEstimated.push(true);
      }
    });

    setComparedYear(pastYear);
    setComparedShoreline(pastShoreline);
    setComparedIsEstimated(pastEstimated);
    setSelectedYearComparison(selectedYear);
    setSelectedYearShoreline(comparisonShoreline);
    setSelectedYearIsEstimated(comparisonEstimated);
    setComparedSegmentErosionRate(segmentErosionRates);
  };

  // Predicts the selected segment, or all sufficient-data segments if none
  // selected. EPR/retreat numbers come from the /shoreline-estimate endpoint;
  // only the line-offset geometry is computed client-side.
  const handlePredictSimulate = async (baseYear, predictionYear) => {
    setIsSimulating(true);

    const selectedSegment = shorelineSegments.find((s) => s.id === selectedSegmentId);

    if (selectedSegment && !selectedSegment.hasSufficientData) {
      console.warn(`${selectedSegment.name} doesn't have enough data yet to predict`);
      setIsSimulating(false);
      return;
    }

    const targetSegments = selectedSegment
      ? [selectedSegment]
      : shorelineSegments.filter((s) => s.hasSufficientData);

    if (targetSegments.length === 0) {
      console.warn("No shoreline data available to simulate from");
      setIsSimulating(false);
      return;
    }

    // Base year: the selected segment's own year, or (with nothing selected)
    // the most recent year among all target areas.
    const baseCoastlineYear = selectedSegment
      ? (selectedSegment.year || new Date().getFullYear())
      : Math.max(...targetSegments.map((s) => s.year || new Date().getFullYear()));

    const areaParam = selectedSegment ? `&area=${encodeURIComponent(selectedSegment.name)}` : "";
    let estimate;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(selectedMunicipality)}/shoreline-estimate?baseYear=${baseCoastlineYear}&targetYear=${predictionYear}${areaParam}`
      );
      if (!res.ok) throw new Error(`Estimate request failed (HTTP ${res.status})`);
      estimate = await res.json();
    } catch (err) {
      console.error("Could not fetch shoreline estimate:", err.message);
      setIsSimulating(false);
      return;
    }

    // Match each target segment to its persisted retreat/rate by area name.
    const byArea = {};
    estimate.segments.forEach((s) => {
      byArea[s.area] = s;
    });

    // Offsets each segment by its own EPR rate (not a municipality-wide
    // number); negative offset = inland = erosion.
    const predictedCoastline = targetSegments.map((seg) => {
      const segEstimate = byArea[seg.name];
      const erosionRate = segEstimate ? segEstimate.erosionRate : seg.erosionRate;
      const retreat = segEstimate
        ? segEstimate.retreat
        : Math.abs(seg.erosionRate * (predictionYear - baseCoastlineYear));
      return {
        id: seg.id,
        name: seg.name,
        shoreline: offsetCoastlineForPrediction(seg.shoreline, -erosionRate * (predictionYear - baseCoastlineYear)),
        erosionRate,
        retreat,
      };
    });

    setPredictionResult({
      predictedYear: estimate.predictedYear,
      estimatedRetreat: estimate.estimatedRetreat,
      estimatedRetreatUnit: estimate.estimatedRetreatUnit,
      projectedLRR: estimate.projectedLRR,
      projectedLRRUnit: estimate.projectedLRRUnit,
    });

    setPredictedYear(predictionYear);
    setPredictedShoreline(predictedCoastline);
    setIsSimulating(false);
  };

  // Helper function to offset coastline for prediction
  /**
   * Detect if coastline is clockwise or counterclockwise using signed area
   * Returns 1 for counterclockwise, -1 for clockwise
   */
  const detectCoastlineOrientation = (coastlinePoints) => {
    if (!coastlinePoints || coastlinePoints.length < 3) return 1;

    // Calculate signed area (shoelace formula) 
    // In geographic coords [lat, lon]: area = sum((lon_i * lat_j - lon_j * lat_i))
    let signedArea = 0;
    for (let i = 0; i < coastlinePoints.length; i++) {
      const j = (i + 1) % coastlinePoints.length;
      const [lat1, lon1] = coastlinePoints[i];
      const [lat2, lon2] = coastlinePoints[j];
      signedArea += (lon1 * lat2 - lon2 * lat1);
    }

    const orientation = signedArea >= 0 ? 1 : -1;
    return orientation;
  };

  /**
   * Offset coastline with correct direction detection
   * Positive offsetMeters = seaward (more land / outward)
   * Negative offsetMeters = inland (erosion / inward)
   */
  const offsetCoastlineForPrediction = (coastlinePoints, offsetMeters) => {
    if (!coastlinePoints || coastlinePoints.length < 2) return [];

    const offsetDegrees = offsetMeters / 111000; // Convert meters to degrees

    // Detect coastline orientation to ensure consistent normal direction
    const orientation = detectCoastlineOrientation(coastlinePoints);

    const offsetPoints = coastlinePoints.map((point, index) => {
      let tangent = [0, 0];

      // Calculate tangent vector (direction of coastline travel)
      if (index === 0) {
        tangent = [
          coastlinePoints[1][0] - point[0],
          coastlinePoints[1][1] - point[1]
        ];
      } else if (index === coastlinePoints.length - 1) {
        tangent = [
          point[0] - coastlinePoints[index - 1][0],
          point[1] - coastlinePoints[index - 1][1]
        ];
      } else {
        const prevDir = [
          point[0] - coastlinePoints[index - 1][0],
          point[1] - coastlinePoints[index - 1][1]
        ];
        const nextDir = [
          coastlinePoints[index + 1][0] - point[0],
          coastlinePoints[index + 1][1] - point[1]
        ];
        tangent = [
          (prevDir[0] + nextDir[0]) / 2,
          (prevDir[1] + nextDir[1]) / 2
        ];
      }

      // Normalize tangent
      const tangentLength = Math.sqrt(tangent[0] * tangent[0] + tangent[1] * tangent[1]);
      if (tangentLength === 0) return point;

      tangent[0] /= tangentLength;
      tangent[1] /= tangentLength;

      // Calculate perpendicular (normal) vector based on orientation
      // Both CCW and CW use left perpendicular to point seaward (outward)
      const normal = [-tangent[1], tangent[0]];

      // Apply offset in the normal direction
      const newPoint = [
        point[0] + normal[0] * offsetDegrees,
        point[1] + normal[1] * offsetDegrees,
      ];
      
      return newPoint;
    });

    return offsetPoints;
  };

  // Places markers at a configurable fraction along the line (not the
  // midpoint) so overlapping year lines don't stack badges on top of each other.
  const pointAtFraction = (line, fraction) => {
    if (!line || line.length === 0) return null;
    const idx = Math.min(line.length - 1, Math.floor(line.length * fraction));
    return line[idx];
  };

  const centerPoint = bataanBounds
    ? bataanBounds.getCenter()
    : [14.657, 120.500];

  // Compare/Predict need 2+ years of data on the selected segment, or on at
  // least one segment if none is selected.
  const effectiveSelectedSegment = shorelineSegments.find((s) => s.id === selectedSegmentId);
  const canAnalyze = effectiveSelectedSegment
    ? effectiveSelectedSegment.hasSufficientData
    : shorelineSegments.some((s) => s.hasSufficientData);
  const analyzeDisabledReason = !selectedMunicipality
    ? null
    : effectiveSelectedSegment && !effectiveSelectedSegment.hasSufficientData
      ? `${effectiveSelectedSegment.name} only has ${effectiveSelectedSegment.yearsAvailable.length} year(s) of data — upload another year for this area to enable Compare/Predict.`
      : !canAnalyze
        ? "No analyzed area in this municipality has 2+ years of data yet — upload another year to enable Compare/Predict."
        : null;

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <ErosionLegend />
      <ErosionAnalysisCards
        selectedMunicipality={selectedMunicipality}
        municipalityStats={municipalityStats}
        yearlyShorelineData={yearlyShorelineData}
        predictedYear={predictedYear}
        shorelineSegments={shorelineSegments}
        selectedSegmentId={selectedSegmentId}
      />
      <AnalysisToolsCards
        selectedMunicipality={selectedMunicipality}
        onSimulate={handlePredictSimulate}
        onEndSimulation={handleEndSimulation}
        onCompare={handleCompare}
        onEndComparison={handleEndComparison}
        canAnalyze={canAnalyze}
        disabledReason={analyzeDisabledReason}
        predictionResult={predictionResult}
      />
      <SatelliteToggle isSatellite={isSatellite} onToggle={() => setIsSatellite(!isSatellite)} />

      <div style={{ padding: "20px", position: "relative" }}>
        <MapContainer 
          center={centerPoint} 
          zoom={selectedMunicipality ? 14 : 11} 
          scrollWheelZoom={true} 
          zoomControl={false} 
          style={{ height: "100vh", width: "100%" }} 
          minZoom={1} 
          maxZoom={18}
        >
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
                    fillColor: LOCKED_SEGMENT_COLOR,
                    fillOpacity: 0.25,
                    cursor: "not-allowed",
                  };
                }

                const isSelected = name === selectedMunicipality?.toUpperCase();
                const isHovered = name === hoveredMunicipality?.toUpperCase();

                return {
                  color: isSelected ? "#0096FF" : isHovered ? "#3b82f6" : "	#89CFF0",
                  weight: isSelected ? 2 : isHovered ? 2.5 : 2,
                  opacity: isSelected ? 0.5 : isHovered ? 0.95 : 0.3,
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

                layer.on("click", (e) => {
                  // Stop propagation so clicking a municipality polygon (selected
                  // or not) never reaches the map's outside-click deselect handler.
                  L.DomEvent.stopPropagation(e);
                  if (isLocked) return;
                  if (!selectedMunicipality) {
                    handleMunicipalityClick(feature);
                  }
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

          {/* Current shoreline, one segment per analyzed area. Hidden during
              compare — the compare tool draws its own line in the same red. */}
          {selectedMunicipality && !comparedYear && shorelineSegments.map((segment) => {
            const isSelected = segment.id === selectedSegmentId;
            const segmentColor = segment.hasSufficientData ? CURRENT_SHORELINE_COLOR : LOCKED_SEGMENT_COLOR;

            return (
              <Polyline
                key={`segment-${segment.id}`}
                positions={segment.shoreline}
                color={segmentColor}
                weight={isSelected ? 6 : 3}
                opacity={isSelected ? 1 : 0.85}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    setSelectedSegmentId(isSelected ? null : segment.id);
                  },
                }}
              />
            );
          })}

          {/* Segment markers. Locked (insufficient-data) segments render muted
              but still selectable. Hidden during compare, like the shoreline above. */}
          {selectedMunicipality && !comparedYear && shorelineSegments.map((segment) => {
            const isSelected = segment.id === selectedSegmentId;
            const segmentColor = segment.hasSufficientData ? CURRENT_SHORELINE_COLOR : LOCKED_SEGMENT_COLOR;

            return (
              <Marker
                key={`segment-marker-${segment.id}`}
                position={segment.markerPosition}
                icon={L.divIcon({
                  className: `segment-marker`,
                  html: `<div class="segment-marker-icon" style="background:${segmentColor}; width:${isSelected ? 38 : 32}px; height:${isSelected ? 38 : 32}px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid ${isSelected ? '#fff' : 'white'};">!</div>`,
                  iconSize: [isSelected ? 38 : 32, isSelected ? 38 : 32],
                  iconAnchor: [isSelected ? 19 : 16, isSelected ? 19 : 16],
                })}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    setSelectedSegmentId(isSelected ? null : segment.id);
                  },
                }}
              >
                <Popup className="ea-segment-popup">
                  {(() => {
                    const riskKey = classifyErosionRisk(segment.erosionRate);
                    const riskColor = getRiskColor(riskKey);
                    const years = segment.yearsAvailable;
                    const footerText = !segment.hasSufficientData
                      ? 'Locked — not enough data yet'
                      : isSelected
                        ? 'Selected — Compare/Predict use this segment only'
                        : 'Click to select this segment';

                    return (
                      <>
                        <div className="ea-popup-header">
                          <span className="ea-popup-title">{segment.name}</span>
                          {segment.hasSufficientData && (
                            <span
                              className="ea-popup-risk-pill"
                              style={{ background: `${riskColor}22`, color: riskColor }}
                            >
                              {SEGMENT_RISK_LEVELS[riskKey] || riskKey} Risk
                            </span>
                          )}
                        </div>

                        {segment.hasSufficientData ? (
                          <>
                            <div className="ea-popup-rate">
                              LRR: {segment.erosionRate?.toFixed(2)} {segment.unit}
                              {segment.lrrConfidence != null && (
                                <span className="ea-popup-confidence"> (confidence {(segment.lrrConfidence * 100).toFixed(0)}%)</span>
                              )}
                            </div>
                            <div className="ea-popup-years">
                              <svg className="ea-popup-calendar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                                <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                              {Math.min(...years)}–{Math.max(...years)} • {years.length} dataset{years.length === 1 ? '' : 's'}
                            </div>
                          </>
                        ) : (
                          <div className="ea-popup-locked">
                            Only {years.length} year{years.length === 1 ? '' : 's'} on record
                            {years.length > 0 ? ` (${years.join(', ')})` : ''} — upload
                            another year for this area to enable Compare/Predict.
                          </div>
                        )}

                        <div className="ea-popup-divider" />

                        <div className="ea-popup-footer">
                          <span className={`ea-popup-footer-icon ${isSelected ? 'is-selected' : ''}`}>
                            {isSelected ? '✓' : '○'}
                          </span>
                          {footerText}
                        </div>
                      </>
                    );
                  })()}
                </Popup>
              </Marker>
            );
          })}

          {/* Render current shoreline and predicted shoreline when municipality is selected */}
          {selectedMunicipality && yearlyShorelineData.length > 0 && (
            <>
              {/* Shaded change-area ribbon between compared/selected shorelines,
                  colored by erosion vs accretion. Renders first, below both lines. */}
              {comparedShoreline && comparedYear && selectedYearShoreline && selectedYearComparison &&
                comparedShoreline.map((compLine, i) => {
                  const currLine = selectedYearShoreline[i];
                  if (!compLine || !currLine || compLine.length < 2 || currLine.length < 2) return null;
                  const ribbon = [...currLine, ...[...compLine].reverse()];
                  const rate = comparedSegmentErosionRate[i];
                  const ribbonColor = rate > 0 ? ACCRETION_AREA_COLOR : EROSION_AREA_COLOR;
                  return (
                    <Polygon
                      key={`change-area-${i}`}
                      positions={ribbon}
                      pathOptions={{
                        color: ribbonColor,
                        weight: 0,
                        fillColor: ribbonColor,
                        fillOpacity: 0.35,
                      }}
                      interactive={false}
                    />
                  );
                })}

              {/* Past-year compared shoreline(s), yellow. Renders second (underneath). */}
              {comparedShoreline && comparedYear && comparedShoreline.map((line, i) => (
                <Polyline
                  key={`compared-${i}`}
                  positions={line}
                  color="#FFEA00"
                  weight={3}
                  opacity={0.8}
                />
              ))}

              {/* Selected-year compared shoreline(s), red. Renders third (on top). */}
              {selectedYearShoreline && selectedYearComparison && selectedYearShoreline.map((line, i) => (
                <Polyline
                  key={`selected-year-${i}`}
                  positions={line}
                  color="#FF3131"
                  weight={3}
                  opacity={1}
                />
              ))}

              {/* Year markers on the compare lines; the base segment marker is
                  hidden during compare since it doesn't update per-year. */}
              {comparedShoreline && comparedYear && comparedShoreline.map((line, i) => {
                const pos = pointAtFraction(line, 0.3);
                if (!pos) return null;
                return (
                  <Marker
                    key={`compared-marker-${i}`}
                    position={pos}
                    icon={L.divIcon({
                      className: 'segment-marker',
                      html: `<div style="background:#FFEA00; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#333; font-weight:bold; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;">${comparedYear}</div>`,
                      iconSize: [26, 26],
                      iconAnchor: [13, 13],
                    })}
                    eventHandlers={{ click: (e) => L.DomEvent.stopPropagation(e) }}
                  >
                    <Popup>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Year {comparedYear}</div>
                      <div style={{ fontSize: 12 }}>
                        {comparedIsEstimated[i] ? 'Estimated (EPR offset — no upload for this exact year)' : 'Measured (real upload for this year)'}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {selectedYearShoreline && selectedYearComparison && selectedYearShoreline.map((line, i) => {
                const pos = pointAtFraction(line, 0.7);
                if (!pos) return null;
                return (
                  <Marker
                    key={`selected-year-marker-${i}`}
                    position={pos}
                    icon={L.divIcon({
                      className: 'segment-marker',
                      html: `<div style="background:${CURRENT_SHORELINE_COLOR}; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;">${selectedYearComparison}</div>`,
                      iconSize: [30, 30],
                      iconAnchor: [15, 15],
                    })}
                    eventHandlers={{ click: (e) => L.DomEvent.stopPropagation(e) }}
                  >
                    <Popup>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Year {selectedYearComparison}</div>
                      <div style={{ fontSize: 12 }}>
                        {selectedYearIsEstimated[i] ? 'Estimated (EPR offset — no upload for this exact year)' : 'Measured (real upload for this year)'}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Shaded change-area ribbon between the current and predicted shoreline,
                  colored by erosion vs accretion — same construction as the compare
                  ribbon above. Renders first, below the predicted line/marker. */}
              {predictedShoreline && predictedYear && predictedShoreline.map((seg) => {
                const currLine = shorelineSegments.find((s) => s.id === seg.id)?.shoreline;
                const predLine = seg.shoreline;
                if (!currLine || !predLine || currLine.length < 2 || predLine.length < 2) return null;
                const ribbon = [...currLine, ...[...predLine].reverse()];
                const ribbonColor = seg.erosionRate > 0 ? ACCRETION_AREA_COLOR : EROSION_AREA_COLOR;
                return (
                  <Polygon
                    key={`predicted-change-area-${seg.id}`}
                    positions={ribbon}
                    pathOptions={{
                      color: ribbonColor,
                      weight: 0,
                      fillColor: ribbonColor,
                      fillOpacity: 0.35,
                    }}
                    interactive={false}
                  />
                );
              })}

              {/* Predicted shoreline(s), green, one per target segment. Renders last (on top). */}
              {predictedShoreline && predictedYear && predictedShoreline.map((seg) => (
                <Polyline
                  key={`predicted-${seg.id}`}
                  positions={seg.shoreline}
                  color="#7CFC00"
                  weight={3}
                  opacity={0.9}
                />
              ))}

              {predictedShoreline && predictedYear && predictedShoreline.map((seg) => {
                const pos = pointAtFraction(seg.shoreline, 0.4);
                if (!pos) return null;
                return (
                  <Marker
                    key={`predicted-marker-${seg.id}`}
                    position={pos}
                    icon={L.divIcon({
                      className: 'segment-marker',
                      html: `<div style="background:#7CFC00; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#333; font-weight:bold; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;">${predictedYear}</div>`,
                      iconSize: [26, 26],
                      iconAnchor: [13, 13],
                    })}
                    eventHandlers={{ click: (e) => L.DomEvent.stopPropagation(e) }}
                  >
                    <Popup>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{seg.name}</div>
                      <div style={{ fontSize: 12 }}>Predicted year {predictedYear}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        Estimated retreat: {seg.retreat.toFixed(1)} m
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </>
          )}

          <MapController
            geoJsonData={geoJsonData}
            bataanBounds={bataanBounds}
            selectedMunicipality={selectedMunicipality}
            municipalityBounds={municipalityBounds}
            satelliteBounds={satelliteBounds}
          />
          {selectedMunicipality && (
            <MapClickOutsideHandler onOutsideClick={handleBackToOverview} />
          )}
        </MapContainer>
      </div>
    </Layout>
  )
}
