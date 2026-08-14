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

/**
 * Floating progress card for NDWI generation — both the "Generate All
 * Years" batch job and single-year "Generate This Year". Rendered once,
 * app-wide (see App.jsx), so it stays visible across page navigation — both
 * are tracked by NdwiGenerationContext, which also resumes the batch (but
 * not single-year, which has no server-side job to resume) after a hard
 * refresh.
 */
export default function NdwiGenerationWidget() {
  const { status, running, minimized, dismiss, toggleMinimized, cancelBatch, singleYear } = useNdwiGeneration();
  const navigate = useNavigate();
  const location = useLocation();

  const showBatch = !!status;
  // Single-year only gets its own widget while nothing has a fuller batch
  // card to show, and only while actually in flight — once it finishes,
  // DataUpload.jsx's own result card is the record of what happened.
  const showSingleYear = !showBatch && singleYear.generating;

  if (!showBatch && !showSingleYear) return null;

  const isOnDataUploadPage = location.pathname === DATA_UPLOAD_PATH;
  // The inline panel on Data Upload itself already shows full progress —
  // the floating widget would be redundant clutter there, so it's always
  // shown minimized (as the small pill) on that page specifically,
  // regardless of the manual minimize toggle. Full card everywhere else.
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
          {/* No server-side job to cancel for single-year — X only minimizes. */}
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
        {/* While running: X minimizes (the batch keeps going in the
            background). Once finished: nothing left to cancel, so X goes
            back to dismissing the card entirely. */}
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
