import { useNavigate, useLocation } from "react-router-dom";
import { useNdwiGeneration } from "../contexts/NdwiGenerationContext";
import "../pages/styles/ndwi-generation-widget.css";

const DATA_UPLOAD_PATH = "/admin/data-upload";

/**
 * Floating progress card for single-year NDWI generation ("Generate This
 * Year"). Rendered once, app-wide (see App.jsx), so it stays visible across
 * page navigation while a generation is in flight.
 */
export default function NdwiGenerationWidget() {
  const { minimized, toggleMinimized, singleYear } = useNdwiGeneration();
  const navigate = useNavigate();
  const location = useLocation();

  // Only shown while actually in flight — once it finishes, DataUpload.jsx's
  // own result card/SWAL is the record of what happened.
  if (!singleYear.generating) return null;

  const isOnDataUploadPage = location.pathname === DATA_UPLOAD_PATH;
  // The inline panel on Data Upload itself already shows full progress —
  // the floating widget would be redundant clutter there, so it's always
  // shown minimized (as the small pill) on that page specifically,
  // regardless of the manual minimize toggle. Full card everywhere else.
  const effectiveMinimized = minimized || isOnDataUploadPage;

  const handleViewDetails = () => {
    if (!isOnDataUploadPage) navigate(DATA_UPLOAD_PATH);
  };

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
