import { forwardRef, useImperativeHandle, useState } from "react";
import "../pages/styles/map-workspace.css";

const MapWorkspace = forwardRef(function MapWorkspace(
  { title, subject, subjectHint, emptyHint, children, footer },
  ref
) {
  const [open, setOpen] = useState(true);

  // Lets a page force the panel open before a guided-tour step that targets
  // something inside it — closing it only translates it off-screen, so a
  // tour step can otherwise end up pointing at an invisible target.
  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }));

  return (
    <>
      <button
        type="button"
        className={`map-workspace-handle ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="map-workspace-panel"
        aria-label={open ? "Hide analysis panel" : "Show analysis panel"}
      >
        <i className={open ? "pi pi-angle-right" : "pi pi-angle-left"} aria-hidden="true" />
      </button>

      <aside
        id="map-workspace-panel"
        className={`map-workspace ${open ? "is-open" : "is-closed"}`}
        aria-label={title}
      >
        <header className="map-workspace-head">
          <p className="map-workspace-kicker">{title}</p>
          {subject ? (
            <>
              <h2 className="map-workspace-subject">{subject}</h2>
              {subjectHint && <p className="map-workspace-hint">{subjectHint}</p>}
            </>
          ) : (
            <p className="map-workspace-empty">
              <i className="pi pi-map-marker" aria-hidden="true" />
              {emptyHint}
            </p>
          )}
        </header>

        <div className="map-workspace-body">{children}</div>

        {footer && <div className="map-workspace-foot">{footer}</div>}
      </aside>
    </>
  );
});

export default MapWorkspace;
