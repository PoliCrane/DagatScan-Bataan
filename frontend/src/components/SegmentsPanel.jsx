import { memo } from "react";
/**
 * Segments Panel Component
 * Displays detailed information about coastal segments for a selected municipality
 */

import "../pages/styles/segmentsPanel.css";
import { getRiskColor, SEGMENT_RISK_LEVELS } from '../utils/segmentData';

function SegmentsPanel({
  showPanel,
  selectedMunicipality,
  segments,
  selectedSegment,
  onClose,
  onSelectSegment,
}) {
  if (!showPanel || !selectedMunicipality || !segments || segments.length === 0) {
    return null;
  }

  return (
    <div className={`segments-panel ${!showPanel ? 'hidden' : ''}`}>
      <div className="segments-panel-header">
        <h3 className="segments-panel-title">
          <i className="pi pi-map" style={{ marginRight: '8px', color: 'var(--color-cyan, #38bdf8)' }} aria-hidden="true" />
          {selectedMunicipality} Municipality
        </h3>
        <p className="segments-panel-subtitle">
          {segments.length} coastal segments identified
        </p>
        <button 
          className="segments-panel-close"
          onClick={onClose}
          aria-label="Close segments panel"
        >
          ✕
        </button>
      </div>

      <div className="segments-panel-content">
        {segments.map((segment) => {
          const riskColor = getRiskColor(segment.risk);
          const isSelected = selectedSegment?.id === segment.id;

          return (
            <div
              key={segment.id}
              className={`segment-item ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onSelectSegment(isSelected ? null : segment)}
              style={{ borderLeftColor: riskColor }}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelectSegment(isSelected ? null : segment);
                }
              }}
            >
              <div className="segment-item-name">
                <span>
                  <i className="pi pi-map-marker" style={{ color: 'var(--color-cyan, #38bdf8)' }} aria-hidden="true" />
                </span>
                {segment.name}
              </div>

              <div
                className="segment-item-badge"
                style={{ background: `${riskColor}22`, color: riskColor }}
              >
                {SEGMENT_RISK_LEVELS[segment.risk] || segment.risk}
              </div>

              {segment.description && (
                <p className="segment-item-description">
                  {segment.description}
                </p>
              )}

              <div className="segment-item-rate">
                <span>Erosion Rate:</span>
                <span className="segment-item-rate-value">
                  {segment.erosionRate} {segment.unit}
                </span>
              </div>

              {segment.year != null && (
                <div className="segment-item-rate">
                  <span>Latest Data:</span>
                  <span className="segment-item-rate-value">
                    {segment.year} · {segment.source}
                  </span>
                </div>
              )}

              {segment.cumulativeErosion !== undefined && (
                <div className="segment-item-rate">
                  <span>Cumulative Change:</span>
                  <span className="segment-item-rate-value">
                    {Math.abs(segment.cumulativeErosion).toFixed(2)} m{" "}
                    {segment.cumulativeErosion < 0
                      ? "retreat"
                      : segment.cumulativeErosion > 0
                      ? "advance"
                      : ""}
                  </span>
                </div>
              )}

              {segment.dataQuality && (
                <div className="segment-item-rate">
                  <span>Data Quality:</span>
                  <span className="segment-item-rate-value">
                    {segment.dataQuality}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(SegmentsPanel);
