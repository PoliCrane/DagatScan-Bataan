import { useEffect, useMemo, useRef, useState } from "react";
import "../pages/styles/analysisToolsCards.css";
import PredictionResultCard from "./PredictionResultCard";
import EventContextCard from "./EventContextCard";
import { showInfo } from "../utils/sweetAlertUtils";
import { Dropdown } from "primereact/dropdown";
import { Button } from "primereact/button";

export default function AnalysisToolsCards({ contextYear = null, onPlayTimeline = null, isPlayingTimeline = false, isTimelinePaused = false, dataYearSpan = null,
  availableYears = null,
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

  // years without data are shown but disabled rather than silently comparable against nothing; null/omitted means unknown, so none are disabled.
  // Memoized on the array itself (not recreated every render) so the effects below that depend
  // on it don't reschedule their debounce on every unrelated re-render.
  const availableYearSet = useMemo(
    () => (availableYears ? new Set(availableYears.map((y) => y.toString())) : null),
    [availableYears]
  );

  // 2015 is Sentinel-2/Earth Engine's earliest available year
  const historicalYears = Array.from({ length: BASE_YEAR - 2015 + 1 }, (_, i) => {
    const year = 2015 + i;
    const value = year.toString();
    return {
      value,
      label: year === BASE_YEAR ? `${year} (Current)` : value,
      disabled: availableYearSet ? !availableYearSet.has(value) : false,
    };
  });

  // capped at ~half the observed data span since extrapolating further isn't defensible; defaults to 5 years when span is unknown
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

  // last year-pair/year actually sent to onCompare/onSimulate, so the auto-update effects below don't double-fire the instant isComparing/isSimulating flips true from the button's own click
  const lastComparedRef = useRef(null);
  const lastPredictedRef = useRef(null);

  // A stale selection can otherwise survive a segment switch — disabling a dropdown option
  // only blocks a fresh click on it, it doesn't clear an already-held value. Re-validate
  // whenever the available-years set changes and correct to a valid pair for the new segment.
  useEffect(() => {
    if (!availableYearSet) return;
    const validYears = historicalYears
      .filter((y) => !y.disabled)
      .map((y) => parseInt(y.value))
      .sort((a, b) => a - b);
    if (validYears.length === 0) return;

    const newPastYear = availableYearSet.has(comparePastYear) ? parseInt(comparePastYear) : validYears[0];
    if (newPastYear.toString() !== comparePastYear) setComparePastYear(newPastYear.toString());

    if (!availableYearSet.has(compareSelectedYear) || parseInt(compareSelectedYear) <= newPastYear) {
      const candidates = validYears.filter((y) => y > newPastYear);
      const newSelectedYear = candidates.length > 0 ? candidates[candidates.length - 1] : newPastYear;
      if (newSelectedYear.toString() !== compareSelectedYear) setCompareSelectedYear(newSelectedYear.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-validate when the available set itself changes
  }, [availableYearSet]);

  // Validate Selected Year when Past Year changes
  const handleComparePastYearChange = (e) => {
    const pastYear = parseInt(e.target.value);
    setComparePastYear(e.target.value);

    const selectedYearNum = parseInt(compareSelectedYear);
    if (selectedYearNum <= pastYear) {
      const availableYears = historicalYears
        .map(y => parseInt(y.value))
        .filter(y => y > pastYear)
        .sort((a, b) => a - b);
      
      if (availableYears.length > 0) {
        setCompareSelectedYear(availableYears[0].toString());
      }
    }
  };

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

    // A disabled dropdown option only blocks a fresh click on it — it doesn't clear an
    // already-selected value (e.g. carried over from switching segments). Re-check here so
    // Analyze can't run on a year that's deactivated or flagged untrustworthy for this area.
    if (availableYearSet && (!availableYearSet.has(comparePastYear) || !availableYearSet.has(compareSelectedYear))) {
      await showInfo("One of the selected years isn't available for this area (deactivated, or its trace couldn't be verified). Pick a different year.");
      return;
    }

    if (onCompare) {
      onCompare(pastYearNum, selectedYearNum);
    }
    lastComparedRef.current = `${pastYearNum}-${selectedYearNum}`;
    setIsComparing(true);
  };

  const handleEndComparison = () => {
    setIsComparing(false);
    if (onEndComparison) {
      onEndComparison();
    }
  };

  // re-runs the comparison as the year dropdowns change instead of requiring End Comparison + Analyze again; debounced since a closed PrimeReact Dropdown fires onChange per arrow-key press, deduped against lastComparedRef to avoid double-firing handleCompareAnalyze's own click
  useEffect(() => {
    if (!isComparing) return undefined;
    const pastYearNum = parseInt(comparePastYear);
    const selectedYearNum = parseInt(compareSelectedYear);
    if (selectedYearNum <= pastYearNum) return undefined;
    // Same availability re-check as handleCompareAnalyze — a segment switch while already
    // comparing must not silently re-run against a year that's no longer available.
    if (availableYearSet && (!availableYearSet.has(comparePastYear) || !availableYearSet.has(compareSelectedYear))) {
      return undefined;
    }

    const key = `${pastYearNum}-${selectedYearNum}`;
    if (key === lastComparedRef.current) return undefined;

    const timeoutId = setTimeout(() => {
      if (onCompare) onCompare(pastYearNum, selectedYearNum);
      lastComparedRef.current = key;
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [comparePastYear, compareSelectedYear, isComparing, availableYearSet]);

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
    lastPredictedRef.current = predYear.toString();
    setIsSimulating(true);
  };

  const handleEndSimulation = () => {
    setIsSimulating(false);
    if (onEndSimulation) {
      onEndSimulation();
    }
  };

  // same auto-update treatment as the comparison effect above, for the prediction year dropdown
  useEffect(() => {
    if (!isSimulating) return undefined;
    const predYearNum = parseInt(predictYear);
    const key = predYearNum.toString();
    if (key === lastPredictedRef.current) return undefined;

    const timeoutId = setTimeout(() => {
      if (onSimulate) onSimulate(BASE_YEAR, predYearNum);
      lastPredictedRef.current = key;
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [predictYear, isSimulating]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
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
            <i className={isPlayingTimeline ? "pi pi-pause-circle" : "pi pi-play-circle"} aria-hidden="true" />
            {isPlayingTimeline ? "Pause Timeline" : isTimelinePaused ? "Resume Timeline" : "Play Shoreline Timeline"}
          </button>
        )}
        <div className="tools-card compare-card">
          <div className="card-header">
            <i className="pi pi-sync card-icon" aria-hidden="true" />
            <h3 className="card-title">Compare Shoreline</h3>
          </div>

          <div className="card-content">
            <div className="form-group">
              <label className="form-label">Past Year</label>
              <Dropdown
                className="form-select"
                value={comparePastYear}
                onChange={(e) => handleComparePastYearChange({ target: { value: e.value } })}
                options={historicalYears}
                optionLabel="label"
                optionValue="value"
                optionDisabled="disabled"
                aria-label="Past year"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Selected Year</label>
              <Dropdown
                className="form-select"
                value={compareSelectedYear}
                onChange={(e) => setCompareSelectedYear(e.value)}
                options={getAvailableSelectedYears()}
                optionLabel="label"
                optionValue="value"
                optionDisabled="disabled"
                aria-label="Selected year"
              />
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

        <div className="tools-card prediction-tools-card">
          <div className="card-header">
            <i className="pi pi-bolt card-icon" aria-hidden="true" />
            <h3 className="card-title">Prediction</h3>
          </div>

          <div className="card-content">
            <div className="form-readout">
              <span className="form-readout-label">Base year</span>
              <span className="form-readout-value">{BASE_YEAR}</span>
            </div>

            <div className="form-group">
              <label className="form-label">Predict Year</label>
              <Dropdown
                className="form-select"
                value={predictYear}
                onChange={(e) => setPredictYear(e.value)}
                options={futureYears}
                optionLabel="label"
                optionValue="value"
                disabled={!selectedMunicipality}
                aria-label="Predict year"
              />
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

      {/* positioned left via CSS */}
      <PredictionResultCard
        isActive={!!predictionResult}
        predictionData={predictionResult}
        onClear={handleEndSimulation}
      />
    </>
  );
}
