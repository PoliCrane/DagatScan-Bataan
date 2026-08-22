import { useEffect, useRef, useState } from "react";
import "../pages/styles/analysisToolsCards.css";
import PredictionResultCard from "./PredictionResultCard";
import EventContextCard from "./EventContextCard";
import { showInfo } from "../utils/sweetAlertUtils";

export default function AnalysisToolsCards({ contextYear = null, onPlayTimeline = null, isPlayingTimeline = false, dataYearSpan = null,
  selectedMunicipality,
  onSimulate,
  onEndSimulation,
  onCompare,
  onEndComparison,
  canAnalyze = true,
  disabledReason = null,
  predictionResult = null,
}) {
  const cardsRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  let lastScrollY = 0;

  const BASE_YEAR = new Date().getFullYear();

  // 2015 (Sentinel-2/Earth Engine's earliest available year) through current year
  const historicalYears = Array.from({ length: BASE_YEAR - 2015 + 1 }, (_, i) => {
    const year = 2015 + i;
    return { value: year.toString(), label: year === BASE_YEAR ? `${year} (Current)` : year.toString() };
  });

  // horizons are capped at ~half the observed data span — extrapolating further than the
  // record supports is not defensible; defaults to 5 years when the span is unknown
  const maxHorizon = dataYearSpan ? Math.max(1, Math.floor(dataYearSpan / 2)) : 5;
  const futureYears = [1, 2, 3, 5, 10, 15]
    .filter((offset) => offset <= maxHorizon)
    .map((offset) => {
      const year = BASE_YEAR + offset;
      return { value: year.toString(), label: year.toString() };
    });

  const [comparePastYear, setComparePastYear] = useState((BASE_YEAR - 11).toString());
  const [compareSelectedYear, setCompareSelectedYear] = useState(BASE_YEAR.toString());
  const [predictYear, setPredictYear] = useState((BASE_YEAR + Math.min(3, dataYearSpan ? Math.max(1, Math.floor(dataYearSpan / 2)) : 3)).toString());

  // Validate Selected Year when Past Year changes
  const handleComparePastYearChange = (e) => {
    const pastYear = parseInt(e.target.value);
    setComparePastYear(e.target.value);
    
    // If Selected Year is lower or equal to Past Year, update it
    const selectedYearNum = parseInt(compareSelectedYear);
    if (selectedYearNum <= pastYear) {
      // Find next available year after past year
      const availableYears = historicalYears
        .map(y => parseInt(y.value))
        .filter(y => y > pastYear)
        .sort((a, b) => a - b);
      
      if (availableYears.length > 0) {
        setCompareSelectedYear(availableYears[0].toString());
      }
    }
  };

  // Filter Available Selected Years based on Past Year
  const getAvailableSelectedYears = () => {
    const pastYearNum = parseInt(comparePastYear);
    return historicalYears.filter(year => parseInt(year.value) > pastYearNum);
  };

  const handleCompareAnalyze = async () => {
    if (!selectedMunicipality) {
      await showInfo("Please select a municipality first");
      return;
    }

    if (!canAnalyze) {
      await showInfo(disabledReason || "Not enough data yet to compare this area.");
      return;
    }

    const pastYearNum = parseInt(comparePastYear);
    const selectedYearNum = parseInt(compareSelectedYear);
    
    if (selectedYearNum <= pastYearNum) {
      await showInfo("Selected Year must be greater than Past Year");
      return;
    }

    if (onCompare) {
      onCompare(pastYearNum, selectedYearNum);
    }
    setIsComparing(true);
  };

  const handleEndComparison = () => {
    setIsComparing(false);
    if (onEndComparison) {
      onEndComparison();
    }
  };

  const handleSimulate = async () => {
    if (!selectedMunicipality) {
      await showInfo("Please select a municipality first");
      return;
    }

    if (!canAnalyze) {
      await showInfo(disabledReason || "Not enough data yet to predict this area.");
      return;
    }

    const predYear = parseInt(predictYear);

    if (onSimulate) {
      onSimulate(BASE_YEAR, predYear);
    }
    setIsSimulating(true);
  };

  const handleEndSimulation = () => {
    setIsSimulating(false);
    if (onEndSimulation) {
      onEndSimulation();
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down
        setIsVisible(false);
      } else {
        // Scrolling up
        setIsVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // position below the satellite toggle dynamically instead of assuming a fixed height
  useEffect(() => {
    const positionCards = () => {
      const satelliteToggle = document.querySelector(".satellite-toggle");
      const cards = cardsRef.current;
      if (!satelliteToggle || !cards) return;

      const toggleRect = satelliteToggle.getBoundingClientRect();
      const spacingBelow = 20;
      const newTop = toggleRect.top + toggleRect.height + spacingBelow + window.scrollY;
      cards.style.top = `${newTop}px`;
    };

    const timeoutId = setTimeout(positionCards, 100);
    window.addEventListener("resize", positionCards);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", positionCards);
    };
  }, []);

  return (
    <>
      <div className={`analysis-tools-container ${isVisible ? "visible" : "hidden"}`} ref={cardsRef}>
        <EventContextCard year={contextYear} />
        {onPlayTimeline && (
          <button
            type="button"
            onClick={onPlayTimeline}
            disabled={!canAnalyze}
            className="ds-timeline-btn"
          >
            <i className={isPlayingTimeline ? "pi pi-stop-circle" : "pi pi-play-circle"} aria-hidden="true" />
            {isPlayingTimeline ? "Stop Timeline" : "Play Shoreline Timeline"}
          </button>
        )}
        {/* Compare Shoreline Card */}
        <div className="tools-card compare-card">
          <div className="card-header">
            <i className="pi pi-sync card-icon" aria-hidden="true" />
            <h3 className="card-title">Compare Shoreline</h3>
          </div>

          <div className="card-content">
            <div className="form-group">
              <label className="form-label">Past Year</label>
              <select 
                className="form-select"
                value={comparePastYear}
                onChange={handleComparePastYearChange}
              >
                {historicalYears.map((year) => (
                  <option key={year.value} value={year.value}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Selected Year</label>
              <select 
                className="form-select"
                value={compareSelectedYear}
                onChange={(e) => setCompareSelectedYear(e.target.value)}
              >
                {getAvailableSelectedYears().map((year) => (
                  <option key={year.value} value={year.value}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className={`action-btn ${isComparing ? "end-comparison-btn" : "analyze-btn"}`}
              onClick={isComparing ? handleEndComparison : handleCompareAnalyze}
              disabled={!selectedMunicipality || (!isComparing && !canAnalyze)}
              title={!isComparing && !canAnalyze ? disabledReason : undefined}
            >
              {isComparing ? "End Comparison" : "Analyze"}
            </button>
            {!isComparing && selectedMunicipality && !canAnalyze && (
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>{disabledReason}</div>
            )}
          </div>
        </div>

        {/* Prediction Card */}
        <div className="tools-card prediction-tools-card">
          <div className="card-header">
            <i className="pi pi-bolt card-icon" aria-hidden="true" />
            <h3 className="card-title">Prediction</h3>
          </div>

          <div className="card-content">
            <div className="form-group">
              <label className="form-label">Base Year</label>
              <div className="form-value">
                {BASE_YEAR} <span style={{ fontSize: "0.85em", color: "#666" }}>(Current)</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Predict Year</label>
              <select 
                className="form-select"
                value={predictYear}
                onChange={(e) => setPredictYear(e.target.value)}
                disabled={!selectedMunicipality}
              >
                {futureYears.map((year) => (
                  <option key={year.value} value={year.value}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className={`action-btn ${isSimulating ? "end-simulation-btn" : "simulate-btn"}`}
              onClick={isSimulating ? handleEndSimulation : handleSimulate}
              disabled={!selectedMunicipality || (!isSimulating && !canAnalyze)}
              title={!isSimulating && !canAnalyze ? disabledReason : undefined}
            >
              {isSimulating ? "End Simulation" : "Simulate"}
            </button>
            {!isSimulating && selectedMunicipality && !canAnalyze && (
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>{disabledReason}</div>
            )}
          </div>
        </div>
      </div>

      {/* Prediction Result Card - Positioned on Left */}
      <PredictionResultCard
        isActive={!!predictionResult}
        predictionData={predictionResult}
        onClear={handleEndSimulation}
      />
    </>
  );
}
