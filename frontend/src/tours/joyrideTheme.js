// Shared react-joyride config reused by every page's tour so they all look
// and behave identically. Colors mirror frontend/src/pages/styles/variables.css.
export const TOUR_LOCALE = {
  back: "Back",
  close: "Close",
  last: "Finish",
  next: "Next",
  skip: "Skip",
};

export const TOUR_OPTIONS = {
  buttons: ["back", "skip", "close", "primary"],
  // X mirrors Skip (both mark the tour seen via tour:end in useGuidedTour.js); the library's default 'close' would let the tour reopen next visit
  closeButtonAction: "skip",
  primaryColor: "#0077B6",
  overlayColor: "rgba(6, 11, 55, 0.6)",
  showProgress: true,
  spotlightPadding: 8,
  skipBeacon: true,
  targetWaitTimeout: 2000,
  // navbar.css puts .profile-dropdown at z-index 1001 — Joyride's own
  // default (100) would render the overlay/tooltip underneath it.
  zIndex: 10000,
  // ~55% wider than Joyride's default 380px tooltip.
  width: 590,
};

// .layout-main (layout.css) has overflow-y:auto, so react-joyride's Floater treats it as the scroll parent and
// confines tooltip positioning to that box (excluding the sidebar) instead of the full viewport.
// Forcing the boundary to <body> restores full-viewport positioning without touching other shift/flip behavior.
export const TOUR_FLOATING_OPTIONS = {
  shiftOptions: {
    boundary: typeof document !== "undefined" ? document.body : undefined,
  },
};

export const TOUR_STYLES = {
  tooltip: { borderRadius: 10, padding: 24 },
  tooltipContent: { paddingTop: 16, paddingBottom: 20 },
  tooltipTitle: { color: "#1A1A1A", fontWeight: 700, fontSize: 22 },
  buttonClose: { top: 16, right: 16, height: 16, width: 16, color: "#555555" },
  // Pill-shaped throughout: filled for the primary action, outlined/
  // transparent for Skip and Back so they read as secondary.
  buttonPrimary: {
    backgroundColor: "#0077B6",
    borderRadius: 999,
    padding: "8px 22px",
    fontWeight: 600,
  },
  buttonSkip: {
    color: "#0077B6",
    border: "1.5px solid #0077B6",
    borderRadius: 999,
    padding: "8px 20px",
    fontWeight: 600,
  },
  buttonBack: {
    color: "#0077B6",
    border: "1.5px solid #0077B6",
    borderRadius: 999,
    padding: "8px 20px",
    fontWeight: 600,
  },
};
