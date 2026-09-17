import Layout from "../components/Layout";
import ErosionLegend from "../components/ErosionLegend";
import ErosionAnalysisCards from "../components/ErosionAnalysisCards";
import AnalysisToolsCards from "../components/AnalysisToolsCards";
import SatelliteToggle from "../components/SatelliteToggle";
import { MapContainer, Marker, Popup, TileLayer, GeoJSON, useMap, useMapEvents, Polyline, Polygon } from 'react-leaflet'
import { useCallback, useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./index-organized.css";
import "./styles/erosionSegmentPopup.css";
import { extractCoastline, smoothCoastline, getCoastlineLength } from "../utils/coastlineUtils";
import { getShorelineData } from "../api/shorelineData";
import { offsetCoastlineSeaward } from "../utils/geometry";
import { buildAreaSegments } from "../utils/areaSegments";
import { classifyErosionRisk, getRiskColor, SEGMENT_RISK_LEVELS } from "../utils/segmentData";
import { showInfo } from "../utils/sweetAlertUtils";
import useGuidedTour from "../hooks/useGuidedTour";
import useMunicipalityDataStatus from "../hooks/useMunicipalityDataStatus";
import TourInfoButton from "../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../tours/pageIds";
import { erosionAnalysisSteps } from "../tours/steps/erosionAnalysisSteps";
import { API_BASE_URL } from "../config/api";
import MapWorkspace from "../components/MapWorkspace";
import AnalysisPopout from "../components/AnalysisPopout";
import useOffScreen from "../hooks/useOffScreen";
import useEventContext, { formatTyphoons } from "../hooks/useEventContext";
// Colors match ErosionLegend's meaning-based palette (current/previous/predicted).
const CURRENT_SHORELINE_COLOR = "#FF10F0";
// Matches the "Erosion Area" legend swatch and the PDF report map's shaded ribbon.
const EROSION_AREA_COLOR = "#fc4c00";
// Shown instead of EROSION_AREA_COLOR for accretion (positive erosion rate)
const ACCRETION_AREA_COLOR = "#66CDAA";
// Muted color for segments without 2+ years of data — visible but not interactive
const LOCKED_SEGMENT_COLOR = "#9CA3AF";

function MapController({ geoJsonData, bataanBounds, selectedMunicipality, municipalityBounds, satelliteBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // The docked analysis panel covers the right edge, so the visible center
    // isn't the container's center — offset fitBounds padding to compensate
    const panel = document.querySelector(".map-workspace.is-open");
    const rightInset = panel ? Math.round(panel.getBoundingClientRect().width) : 0;

    if (selectedMunicipality && municipalityBounds) {
      map.fitBounds(municipalityBounds, {
        paddingTopLeft: [50, 50],
        paddingBottomRight: [50 + rightInset, 50],
      });
    }
    else if (geoJsonData && bataanBounds) {
      map.fitBounds(bataanBounds, {
        paddingTopLeft: [30, 30],
        paddingBottomRight: [30 + rightInset, 30],
      });
    }

  }, [selectedMunicipality, municipalityBounds, geoJsonData, bataanBounds, map]);

  // Zoom to satellite detected area when it loads (it may be much smaller than municipality)
  useEffect(() => {
    if (!map || !satelliteBounds) return;
    map.fitBounds(satelliteBounds, { padding: [80, 80], maxZoom: 16 });
  }, [satelliteBounds, map]);

  return null;
}

// Municipality/segment clicks stop propagation, so a click reaching here is outside everything
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
  // Derived from the same per-segment EPR data used to draw the predicted shoreline
  const [predictionResult, setPredictionResult] = useState(null);

  const mapWorkspaceRef = useRef(null);
  // Watched so a result that has scrolled out of the analysis panel can be echoed
  // over the map instead of making the user hunt for it.
  const erosionCardRef = useRef(null);
  const predictionCardRef = useRef(null);
  // Compare/Predict auto-rerun on every dropdown change (see AnalysisToolsCards.jsx);
  // these ids guard against a stale in-flight response overwriting a newer one's state.
  const compareRequestIdRef = useRef(0);
  const predictRequestIdRef = useRef(0);
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.EROSION_ANALYSIS, erosionAnalysisSteps, {
    onBeforeStart: () => mapWorkspaceRef.current?.open(),
  });

  // *IsEstimated arrays flag whether a shoreline is real uploaded geometry or an EPR-offset approximation
  const [comparedYear, setComparedYear] = useState(null);
  const [comparedShoreline, setComparedShoreline] = useState(null);
  const [comparedIsEstimated, setComparedIsEstimated] = useState([]);
  const [selectedYearComparison, setSelectedYearComparison] = useState(null);
  const [selectedYearShoreline, setSelectedYearShoreline] = useState(null);
  const [selectedYearIsEstimated, setSelectedYearIsEstimated] = useState([]);
  // Per-segment erosion rate for the compared pair, used only for the change-area ribbon color
  const [comparedSegmentErosionRate, setComparedSegmentErosionRate] = useState([]);

  // Lets the user restrict compare/predict to one stretch of coast instead of the whole shoreline
  const [shorelineSegments, setShorelineSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);

  // Longest observed year span across segments; caps how far ahead prediction is offered
  const dataYearSpan =
    shorelineSegments.reduce((max, seg) => {
      const ys = seg.yearsAvailable || [];
      if (ys.length < 2) return max;
      return Math.max(max, Math.max(...ys) - Math.min(...ys));
    }, 0) || null;

  useEffect(() => {
    const loadGeoJson = async () => {
      try {
        const response = await fetch("/data/BATAAN.geojson");
        const data = await response.json();
        setGeoJsonData(data);

        const geoJsonLayer = L.geoJSON(data);
        const bounds = geoJsonLayer.getBounds();
        setBataanBounds(bounds);
      } catch (error) {
        console.error("Error loading GeoJSON:", error);
      }
    };

    loadGeoJson();
  }, []);

  // One entry per distinct analyzed area (specific_area), separate from the polygon-based simulation
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
      // Handles multiple polygons/islands per municipality
      const municipalityFeatures = geoJsonData.features.filter(
        (feature) => feature.properties?.MUNICIPALI?.toUpperCase() === selectedMunicipality.toUpperCase()
      );

      if (municipalityFeatures.length === 0) {
        console.warn(`Municipality ${selectedMunicipality} not found`);
        return;
      }

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

      const muniGeoJsonLayer = L.geoJSON(mainFeature);
      const muniBounds = muniGeoJsonLayer.getBounds();
      setMunicipalityBounds(muniBounds);

      // Polygon coastline is the fallback baseline; satellite coastline loads separately below
      const rawCoastline = extractCoastline(geoJsonData, selectedMunicipality);
      const smoothedCoastline = rawCoastline.length > 0 ? smoothCoastline(rawCoastline, 1) : [];

      (async () => {
        if (smoothedCoastline.length === 0) {
          console.warn(`No polygon coastline found for ${selectedMunicipality}`);
          setCoastlinePoints([]);
          setYearlyShorelineData([]);
          setMunicipalityStats(null);
          setSatelliteAreas([]);
          return;
        }

        setCoastlinePoints(smoothedCoastline);

        // 404 with a valid body means "no satellite data" — branch on hasSatelliteCoastline, not res.ok
        try {
          const satRes = await fetch(`${API_BASE_URL}/api/shoreline/satellite-coastline/${encodeURIComponent(selectedMunicipality)}`);
          const satData = await satRes.json();
          if (satData.hasSatelliteCoastline && satData.areas?.length > 0) {
            setSatelliteAreas(satData.areas);
            // Bounds across all analyzed areas, for MapController to zoom to
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

        const yearly = await getShorelineData(selectedMunicipality, smoothedCoastline, {
          startYear: 2015,
          endYear: new Date().getFullYear(),
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

  // One segment per analyzed satellite area, or a fallback segment for the whole polygon coastline
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
          // Fallback: whole polygon coastline as one area, using the LRR regression when 3+ years exist
          const hasSufficientData = yearlyShorelineData.length >= 3;
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
        setSelectedSegmentId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMunicipality, satelliteAreas, yearlyShorelineData, municipalityStats]);

  const handleMunicipalityClick = (feature) => {
    const municipalityName = feature.properties?.MUNICIPALI;
    setSelectedMunicipality(municipalityName);
  };

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

  const handleEndSimulation = () => {
    setPredictedYear(null);
    setPredictedShoreline(null);
    setPredictionResult(null);
  };

  const timelineRef = useRef(null);
  // Survives across pause/resume — a plain closure variable would lose the
  // in-progress index the moment the interval is cleared to pause.
  const timelineStateRef = useRef(null);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [isTimelinePaused, setIsTimelinePaused] = useState(false);
  const TIMELINE_STEP_MS = 3000;

  const stopTimelineInterval = () => {
    if (timelineRef.current) {
      clearInterval(timelineRef.current);
      timelineRef.current = null;
    }
  };

  // Full reset — used when ending comparison entirely, changing municipality, or unmounting.
  const stopTimeline = () => {
    stopTimelineInterval();
    timelineStateRef.current = null;
    setIsPlayingTimeline(false);
    setIsTimelinePaused(false);
  };

  const advanceTimeline = () => {
    const state = timelineStateRef.current;
    if (!state) return;
    state.idx += 1;
    if (state.idx >= state.steps.length) {
      stopTimeline();
      return;
    }
    handleCompare(state.steps[state.idx], state.latest);
  };

  const handlePlayTimeline = () => {
    if (isPlayingTimeline) {
      // Pause in place — keep the current position, just stop advancing.
      stopTimelineInterval();
      setIsPlayingTimeline(false);
      setIsTimelinePaused(true);
      return;
    }

    if (isTimelinePaused && timelineStateRef.current) {
      // Resume from wherever it was paused, not from the beginning.
      setIsPlayingTimeline(true);
      setIsTimelinePaused(false);
      timelineRef.current = setInterval(advanceTimeline, TIMELINE_STEP_MS);
      return;
    }

    const years = [...new Set(shorelineSegments.flatMap((s) => s.yearsAvailable || []))].sort();
    if (years.length < 2) return;
    const latest = years[years.length - 1];
    const steps = years.slice(0, -1);
    timelineStateRef.current = { steps, latest, idx: 0 };
    setIsPlayingTimeline(true);
    setIsTimelinePaused(false);
    handleCompare(steps[0], latest);
    timelineRef.current = setInterval(advanceTimeline, TIMELINE_STEP_MS);
  };

  useEffect(() => () => stopTimeline(), []);

  const handleEndComparison = () => {
    stopTimeline();
    setComparedYear(null);
    setComparedShoreline(null);
    setComparedIsEstimated([]);
    setSelectedYearComparison(null);
    setSelectedYearShoreline(null);
    setSelectedYearIsEstimated([]);
    setComparedSegmentErosionRate([]);
  };

  // Real uploaded geometry for an exact year, so Compare can show measured data instead of an EPR-offset guess
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

  // Same /shoreline-estimate endpoint as Predict, walking backward; fallback when no real geometry exists
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

  // Compares the selected segment, or all sufficient-data segments; prefers real geometry over EPR-offset estimate
  const handleCompare = async (pastYear, selectedYear) => {
    const requestId = ++compareRequestIdRef.current;
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

    // A newer handleCompare call may have already resolved while this one was
    // in flight — ignore this stale response.
    if (requestId !== compareRequestIdRef.current) return;

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
        // Past year is more seaward (more land) when eroding — negated rate gives a positive offset
        const rate = pastEstimateByArea[seg.name]?.erosionRate ?? seg.erosionRate;
        pastShoreline.push(offsetCoastlineForPrediction(seg.shoreline, -rate * (currentYear - pastYear)));
        pastEstimated.push(true);
      }

      const realSelected = selectedRealByArea[seg.name];
      if (realSelected && realSelected.length > 0) {
        comparisonShoreline.push(realSelected);
        comparisonEstimated.push(false);
      } else {
        const rate = selectedEstimateByArea[seg.name]?.erosionRate ?? seg.erosionRate;
        comparisonShoreline.push(offsetCoastlineForPrediction(seg.shoreline, -rate * (currentYear - selectedYear)));
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

  // EPR/retreat numbers come from the /shoreline-estimate endpoint; only the line-offset geometry is client-side
  const handlePredictSimulate = async (baseYear, predictionYear) => {
    const requestId = ++predictRequestIdRef.current;
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

    // Base year: the selected segment's own year, or the most recent year among all target areas
    const baseCoastlineYear = selectedSegment
      ? (selectedSegment.year || new Date().getFullYear())
      : Math.max(...targetSegments.map((s) => s.year || new Date().getFullYear()));

    const areaParam = selectedSegment ? `&area=${encodeURIComponent(selectedSegment.name)}` : "";
    let estimate;
    let validation = null;
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

    try {
      const valRes = await fetch(
        `${API_BASE_URL}/api/shoreline/validation/latest?municipality=${encodeURIComponent(selectedMunicipality)}`
      );
      if (valRes.ok) {
        validation = await valRes.json();
      }
    } catch (err) {
      console.warn("No validation results available:", err.message);
    }

    const byArea = {};
    estimate.segments.forEach((s) => {
      byArea[s.area] = s;
    });

    // Offsets each segment by its own EPR rate; negative offset = inland = erosion
    const predictedCoastline = targetSegments.map((seg) => {
      const segEstimate = byArea[seg.name];
      const erosionRate = segEstimate ? segEstimate.erosionRate : seg.erosionRate;
      const retreat = segEstimate
        ? segEstimate.retreat
        : Math.abs(seg.erosionRate * (predictionYear - baseCoastlineYear));
      const dt = predictionYear - baseCoastlineYear;
      const ci = segEstimate?.ci95 ?? null;
      return {
        id: seg.id,
        name: seg.name,
        shoreline: offsetCoastlineForPrediction(seg.shoreline, erosionRate * dt),
        shorelineLandwardBound: ci != null ? offsetCoastlineForPrediction(seg.shoreline, (erosionRate - ci) * dt) : null,
        shorelineSeawardBound: ci != null ? offsetCoastlineForPrediction(seg.shoreline, (erosionRate + ci) * dt) : null,
        erosionRate,
        retreat,
      };
    });

    // A newer handlePredictSimulate call may already be running — ignore this
    // stale response instead of overwriting its state.
    if (requestId !== predictRequestIdRef.current) return;

    setPredictionResult({
      predictedYear: estimate.predictedYear,
      estimatedRetreat: estimate.estimatedRetreat,
      estimatedRetreatUnit: estimate.estimatedRetreatUnit,
      projectedLRR: estimate.projectedLRR,
      projectedLRRUnit: estimate.projectedLRRUnit,
      modelFit: estimate.modelFit,
      retreatCi: estimate.retreatCi ?? null,
      validationMae: validation?.summary?.positionMaeMeters ?? null,
      validationAccuracyPct: validation?.summary?.statusAccuracyPct ?? null,
      validationAreas: validation?.summary?.areasEvaluated ?? null,
      validationRunAt: validation?.runAt ?? null,
    });

    setPredictedYear(predictionYear);
    setPredictedShoreline(predictedCoastline);
    setIsSimulating(false);
  };

  /**
   * Positive offsetMeters = seaward (more land), negative = inland (erosion)
   */
  const offsetCoastlineForPrediction = (coastlinePoints, offsetMeters) =>
    offsetCoastlineSeaward(coastlinePoints, offsetMeters);

  // Marker position at a fraction along the line, not the midpoint, so overlapping year lines don't stack badges
  const pointAtFraction = (line, fraction) => {
    if (!line || line.length === 0) return null;
    const idx = Math.min(line.length - 1, Math.floor(line.length * fraction));
    return line[idx];
  };

  const centerPoint = bataanBounds
    ? bataanBounds.getCenter()
    : [14.657, 120.500];

  // Compare/Predict need 2+ years of data on the selected segment, or on at least one if none selected
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

  // --- Result pop-outs -------------------------------------------------------
  // Compare and Predict both write their answer into the analysis panel, but the
  // controls that trigger them sit further down that panel's scroll, so the result is
  // usually off-screen the moment it arrives. While that is true it gets echoed over
  // the map; once the real card scrolls back into view the echo disappears on its own.
  const [erosionSummary, setErosionSummary] = useState(null);
  const handleErosionSummary = useCallback((summary) => setErosionSummary(summary), []);

  const comparePoppedOut = useOffScreen(erosionCardRef, !!comparedYear);
  const predictionPoppedOut = useOffScreen(predictionCardRef, !!predictionResult);

  const revealInPanel = (ref) => {
    mapWorkspaceRef.current?.open();
    // The panel slides open over 0.3s; scrolling before it lands goes nowhere.
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 320);
  };

  // A newly generated prediction brings itself into view. Only the first one — later
  // re-runs happen because the user changed a year, and yanking them back down while
  // they are working in another section is exactly what this is meant to avoid.
  const predictionShownRef = useRef(false);
  useEffect(() => {
    if (!predictionResult) {
      predictionShownRef.current = false;
      return;
    }
    if (predictionShownRef.current) return;
    predictionShownRef.current = true;
    revealInPanel(predictionCardRef);
  }, [predictionResult]);

  // Same year the sidebar's "What Happened in {year}" card uses, so the two can never
  // show different storms for the same comparison.
  const comparedYearContext = useEventContext(comparedYear);
  const comparedTyphoons = formatTyphoons(comparedYearContext?.typhoons);

  const summaryData = erosionSummary?.erosionData;
  const popoutCards = [
    {
      key: "compare",
      icon: "pi pi-chart-line",
      title: "Erosion Analysis",
      show: comparePoppedOut && !!erosionSummary,
      onReturn: () => revealInPanel(erosionCardRef),
      note: erosionSummary?.error
        ? erosionSummary.error
        : erosionSummary?.insufficientDataMessage || null,
      items: summaryData
        ? [
            { label: "Compared", value: `${comparedYear} → ${selectedYearComparison}` },
            ...(erosionSummary.hasSegmentSelected
              ? [{ label: "Coastline Length", value: summaryData.coastlineLength, unit: "km" }]
              : []),
            { label: "Erosion Rate", value: summaryData.erosionRate, unit: "m/year" },
            {
              label: "Risk Level",
              value: SEGMENT_RISK_LEVELS[summaryData.riskLevel] || summaryData.riskLevel,
              color: getRiskColor(summaryData.riskLevel),
            },
            // Dropped entirely for a quiet year rather than shown as "None" — the
            // pop-out only has room for what actually happened.
            ...(comparedTyphoons
              ? [{ label: `Typhoons ${comparedYear}`, value: comparedTyphoons, stacked: true }]
              : []),
          ]
        : [],
    },
    {
      key: "predict",
      icon: "pi pi-sitemap",
      title: "Prediction Result",
      show: predictionPoppedOut && !!predictionResult,
      onReturn: () => revealInPanel(predictionCardRef),
      items: predictionResult
        ? [
            { label: "Predicted Year", value: predictionResult.predictedYear },
            {
              label: "Est. Retreat",
              value:
                predictionResult.retreatCi != null
                  ? `${predictionResult.estimatedRetreat} ± ${predictionResult.retreatCi}`
                  : predictionResult.estimatedRetreat,
              unit: predictionResult.estimatedRetreatUnit,
            },
            {
              label: "Projected Rate",
              value: predictionResult.projectedLRR,
              unit: predictionResult.projectedLRRUnit,
            },
          ]
        : [],
    },
  ];

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <AnalysisPopout cards={popoutCards} />
      <ErosionLegend />
      <SatelliteToggle isSatellite={isSatellite} onToggle={() => setIsSatellite(!isSatellite)} />

      <MapWorkspace
        ref={mapWorkspaceRef}
        title="Shoreline Analysis"
        subject={selectedMunicipality}
        subjectHint={
          selectedMunicipality
            ? dataYearSpan
              ? `${dataYearSpan}-year satellite record`
              : "Loading satellite record"
            : null
        }
        emptyHint="Click a highlighted municipality on the map to load its shoreline record, then compare two years or project a future shoreline."
      >
        <section className="map-workspace-section" ref={erosionCardRef}>
          <ErosionAnalysisCards
            selectedMunicipality={selectedMunicipality}
            municipalityStats={municipalityStats}
            yearlyShorelineData={yearlyShorelineData}
            predictedYear={predictedYear}
            shorelineSegments={shorelineSegments}
            selectedSegmentId={selectedSegmentId}
            onSummaryChange={handleErosionSummary}
          />
        </section>

        <section className="map-workspace-section">
          <AnalysisToolsCards
            onPlayTimeline={handlePlayTimeline}
            isPlayingTimeline={isPlayingTimeline}
            isTimelinePaused={isTimelinePaused}
            contextYear={comparedYear}
            dataYearSpan={dataYearSpan}
            // Scoped to the selected segment (deactivated years must not stay selectable
            // just because another area in the same municipality still has that year active) —
            // same fallback-to-union-when-nothing-selected pattern as canAnalyze above.
            availableYears={
              effectiveSelectedSegment
                ? effectiveSelectedSegment.yearsAvailable
                : [...new Set(shorelineSegments.flatMap((s) => s.yearsAvailable || []))]
            }
            selectedMunicipality={selectedMunicipality}
            onSimulate={handlePredictSimulate}
            onEndSimulation={handleEndSimulation}
            onCompare={handleCompare}
            onEndComparison={handleEndComparison}
            canAnalyze={canAnalyze}
            disabledReason={analyzeDisabledReason}
            predictionResult={predictionResult}
            resultRef={predictionCardRef}
          />
        </section>
      </MapWorkspace>

      <div className="map-stage">
        <MapContainer 
          center={centerPoint}
          zoom={selectedMunicipality ? 14 : 12}
          scrollWheelZoom={true} 
          zoomControl={false} 
          style={{ height: "100%", width: "100%" }} 
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
                  // Stops the click from reaching the map's outside-click deselect handler
                  L.DomEvent.stopPropagation(e);
                  if (isLocked) {
                    showInfo(
                      `${feature.properties?.MUNICIPALI} has no analyzed shoreline data yet. Upload satellite or GeoJSON data for it in the admin Data Upload page.`
                    );
                    return;
                  }
                  const name = feature.properties?.MUNICIPALI;
                  if (!selectedMunicipality) {
                    handleMunicipalityClick(feature);
                  } else if (name && name !== selectedMunicipality) {
                    handleEndComparison();
                    handleEndSimulation();
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

          {/* Current shoreline, one segment per analyzed area. Hidden during compare. */}
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

          {/* Segment markers. Locked segments render muted but still selectable. Hidden during compare. */}
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

          {selectedMunicipality && yearlyShorelineData.length > 0 && (
            <>
              {/* Change-area ribbon between compared/selected shorelines, colored by erosion vs accretion. Renders below both lines. */}
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

              {/* Past-year compared shoreline(s), yellow, underneath */}
              {comparedShoreline && comparedYear && comparedShoreline.map((line, i) => (
                <Polyline
                  key={`compared-${i}`}
                  positions={line}
                  color="#FFEA00"
                  weight={3}
                  opacity={0.8}
                />
              ))}

              {/* Selected-year compared shoreline(s), neon pink, on top */}
              {selectedYearShoreline && selectedYearComparison && selectedYearShoreline.map((line, i) => (
                <Polyline
                  key={`selected-year-${i}`}
                  positions={line}
                  color="#FF10F0"
                  weight={3}
                  opacity={1}
                />
              ))}

              {/* Year markers on the compare lines; base segment marker is hidden during compare */}
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

              {/* Change-area ribbon between current and predicted shoreline, below the predicted line/marker */}
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

              {/* 95% CI cone bounds: dashed lines either side of the predicted shoreline */}
              {predictedShoreline && predictedYear && predictedShoreline.map((seg) => (
                [seg.shorelineLandwardBound, seg.shorelineSeawardBound]
                  .filter((line) => line && line.length >= 2)
                  .map((line, i) => (
                    <Polyline
                      key={`predicted-ci-${seg.id}-${i}`}
                      positions={line}
                      color="#7CFC00"
                      weight={1.5}
                      opacity={0.6}
                      dashArray="6 6"
                      interactive={false}
                    />
                  ))
              ))}

              {/* Predicted shoreline(s), green, one per target segment, on top */}
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
