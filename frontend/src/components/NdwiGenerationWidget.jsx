import { useNavigate, useLocation } from "react-router-dom";
import { useNdwiGeneration } from "../contexts/NdwiGenerationContext";
import "../pages/styles/ndwi-generation-widget.css";

const TERMINAL_LABELS = {
  complete: { title: "Batch complete", icon: "✓" },
  complete_with_errors: { title: "Batch complete (with skips)", icon: "!" },
  failed: { title: "Batch failed", icon: "✕" },
  cancelled: { title: "Batch cancelled", icon: "⊘" },
};

const DATA_UPLOAD_PATH = "/admin/data-upload";

// Floating progress card for NDWI generation (batch + single-year). Rendered
// once app-wide so it stays visible across page navigation.
export default function NdwiGenerationWidget() {
  const { status, running, minimized, dismiss, toggleMinimized, cancelBatch, singleYear } = useNdwiGeneration();
  const navigate = useNavigate();
  const location = useLocation();

  const showBatch = !!status;
  // single-year widget only shows while in flight; once done, DataUpload's own result card takes over
  const showSingleYear = !showBatch && singleYear.generating;

  if (!showBatch && !showSingleYear) return null;

  const isOnDataUploadPage = location.pathname === DATA_UPLOAD_PATH;
  // stay minimized on the upload page since the inline panel already shows progress there
  const effectiveMinimized = minimized || isOnDataUploadPage;

  const handleViewDetails = () => {
    if (!isOnDataUploadPage) navigate(DATA_UPLOAD_PATH);
  };

  if (showSingleYear) {
    if (effectiveMinimized) {
      return (
        <button
          type="button"
          className="ndwi-widget-pill"
          onClick={toggleMinimized}
          disabled={isOnDataUploadPage}
          title="NDWI generation progress"
        >
          <img src="/NDWI.png" alt="" className="ndwi-widget-pill-icon" />
          <span>…</span>
        </button>
      );
    }

    return (
      <div className="ndwi-widget-card">
        <div className="ndwi-widget-header">
          <div className="ndwi-widget-header-title">
            <img src="/NDWI.png" alt="" className="ndwi-widget-header-icon" />
            <span>NDWI generation</span>
          </div>
          {/* no server-side job to cancel for single-year — X only minimizes */}
          <button type="button" className="ndwi-widget-close" onClick={toggleMinimized} aria-label="Minimize">
            –
          </button>
        </div>

        <div className="ndwi-widget-body">
          <p className="ndwi-widget-status-line">Generating year {singleYear.year}…</p>
          <div className="ndwi-widget-progress-track">
            <div className="ndwi-widget-progress-fill ndwi-widget-progress-indeterminate" />
          </div>
        </div>

        <div className="ndwi-widget-actions">
          <button type="button" className="ndwi-widget-btn-outline" onClick={toggleMinimized}>
            Minimize
          </button>
          <button type="button" className="ndwi-widget-btn-solid" onClick={handleViewDetails} disabled={isOnDataUploadPage}>
            View details
          </button>
        </div>
      </div>
    );
  }

  const totalYears = status.totalYears || 1;
  const doneCount = (status.completedYears?.length || 0) + (status.failedYears?.length || 0);
  const percent = Math.round((doneCount / totalYears) * 100);
  const terminal = TERMINAL_LABELS[status.status];

  if (effectiveMinimized) {
    return (
      <button
        type="button"
        className="ndwi-widget-pill"
        onClick={toggleMinimized}
        disabled={isOnDataUploadPage}
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
        {/* while running, X minimizes; once finished, X dismisses */}
        <button
          type="button"
          className="ndwi-widget-close"
          onClick={running ? toggleMinimized : dismiss}
          aria-label={running ? "Minimize" : "Dismiss"}
        >
          {running ? "–" : "×"}
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
        {running ? (
          <button type="button" className="ndwi-widget-btn-outline ndwi-widget-btn-cancel" onClick={cancelBatch}>
            Cancel
          </button>
        ) : (
          <button type="button" className="ndwi-widget-btn-outline" onClick={toggleMinimized}>
            Minimize
          </button>
        )}
        <button type="button" className="ndwi-widget-btn-solid" onClick={handleViewDetails} disabled={isOnDataUploadPage}>
          View details
        </button>
      </div>
    </div>
  );
}
