import { useEffect, useRef } from "react";
import "../pages/styles/predictionResultCard.css";

export default function PredictionResultCard({
  isActive = false,
  predictionData = null,
  onClear = null
}) {
  const cardRef = useRef(null);

  // position below the erosion analysis card dynamically since its height varies;
  // depends on isActive/predictionData since there's no DOM node to measure until then
  useEffect(() => {
    if (!isActive || !predictionData) return;

    const positionCard = () => {
      const analysisCards = document.querySelector(".analysis-cards-container");
      const card = cardRef.current;
      if (!analysisCards || !card) return;

      const analysisRect = analysisCards.getBoundingClientRect();
      const spacingBelow = 15;
      const newTop = analysisRect.top + analysisRect.height + spacingBelow + window.scrollY;
      card.style.top = `${newTop}px`;
    };

    const timeoutId = setTimeout(positionCard, 100);
    window.addEventListener("resize", positionCard);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", positionCard);
    };
  }, [isActive, predictionData]);

  if (!isActive || !predictionData) return null;

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="prediction-result-card" ref={cardRef}>
      <div className="card-header">
        <img src="/prediction.png" alt="Prediction" className="card-icon" />
        <h3 className="card-title">Prediction Result</h3>
      </div>

      <div className="card-content">
        <div className="card-item">
          <span className="card-label">Predicted Year</span>
          <span className="card-value">{predictionData.predictedYear}</span>
        </div>

        <div className="card-item">
          <span className="card-label">Estimated Retreat</span>
          <span className="card-value">
            {predictionData.estimatedRetreat}
            {predictionData.validationMae != null && (
              <span className="card-unit"> ± {predictionData.validationMae}</span>
            )}{" "}
            <span className="card-unit">{predictionData.estimatedRetreatUnit}</span>
          </span>
        </div>

        <div className="card-item">
          <span className="card-label">Projected Erosion Rate</span>
          <span className="card-value">
            {predictionData.projectedLRR} <span className="card-unit">{predictionData.projectedLRRUnit}</span>
          </span>
        </div>

        {predictionData.modelFit != null && (
          <div className="card-item">
            <span className="card-label">Model Fit (r²)</span>
            <span className="card-value">{predictionData.modelFit.toFixed(2)}</span>
          </div>
        )}

        {predictionData.validationAccuracyPct != null && (
          <div className="card-item">
            <span className="card-label">Hindcast Accuracy</span>
            <span className="card-value">
              {predictionData.validationAccuracyPct}%
              <span className="card-unit">
                {" "}
                ({predictionData.validationAreas} areas validated)
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
