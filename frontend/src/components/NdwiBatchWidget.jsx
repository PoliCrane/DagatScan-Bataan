import { useNavigate, useLocation } from "react-router-dom";
import { useNdwiBatch } from "../contexts/NdwiBatchContext";
import "../pages/styles/ndwi-batch-widget.css";

const TERMINAL_LABELS = {
  complete: { title: "Batch complete", icon: "✓" },
  complete_with_errors: { title: "Batch complete (with skips)", icon: "!" },
  failed: { title: "Batch failed", icon: "✕" },
};

/**
 * Floating progress card for the "Generate All Years" NDWI batch job.
 * Rendered once, app-wide (see App.jsx), so it stays visible across page
 * navigation — the job itself is tracked by NdwiBatchContext, which also
 * resumes it after a hard refresh.
 */
export default function NdwiBatchWidget() {
  const { status, running, minimized, dismiss, toggleMinimized } = useNdwiBatch();
  const navigate = useNavigate();
  const location = useLocation();

  if (!status) return null;

  const totalYears = status.totalYears || 1;
  const doneCount = (status.completedYears?.length || 0) + (status.failedYears?.length || 0);
  const percent = Math.round((doneCount / totalYears) * 100);
  const terminal = TERMINAL_LABELS[status.status];

  const handleViewDetails = () => {
    if (location.pathname !== "/admin/data-upload") {
      navigate("/admin/data-upload");
    }
  };

  if (minimized) {
    return (
      <button
        type="button"
        className="ndwi-widget-pill"
        onClick={toggleMinimized}
        title="NDWI generation progress"
      >
        <img src="/NDWI.png" alt="" className="ndwi-widget-pill-icon" />
        <span>{percent}%</span>
      </button>
    );
  }

  return (
    <div className="ndwi-widget-card">
      <div className="ndwi-widget-header">
        <div className="ndwi-widget-header-title">
          <img src="/NDWI.png" alt="" className="ndwi-widget-header-icon" />
          <span>{terminal ? terminal.title : "NDWI generation"}</span>
        </div>
        <button type="button" className="ndwi-widget-close" onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>

      <div className="ndwi-widget-body">
        <span className={`ndwi-widget-percent-pill ${terminal ? `ndwi-widget-terminal-${status.status}` : ""}`}>
          {terminal ? terminal.icon : `${percent}%`}
          {terminal ? "" : " complete"}
        </span>

        <p className="ndwi-widget-status-line">
          {running
            ? `Processing ${status.currentYear ?? "…"} • ${doneCount} of ${totalYears} years`
            : `${status.completedYears?.length || 0} of ${totalYears} years succeeded${
                status.failedYears?.length ? `, ${status.failedYears.length} skipped` : ""
              }`}
        </p>

        <div className="ndwi-widget-progress-track">
          <div className="ndwi-widget-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="ndwi-widget-actions">
        <button type="button" className="ndwi-widget-btn-outline" onClick={toggleMinimized}>
          Minimize
        </button>
        <button type="button" className="ndwi-widget-btn-solid" onClick={handleViewDetails}>
          View details
        </button>
      </div>
    </div>
  );
}
