import { useEffect, useRef } from "react";
import { TOUR_OPTIONS } from "./joyrideTheme";
import "./TourSpotlight.css";

const PADDING = TOUR_OPTIONS.spotlightPadding ?? 8;

// Replaces react-joyride's own overlay/cutout (TOUR_OPTIONS sets hideOverlay: true) so step-to-step movement can actually glide.
// Joyride's overlay is a single SVG path fully cleared between steps, so a CSS transition on it has nothing to interpolate and just snaps.
// A plain box's top/left/width/height has no such constraint, so this one genuinely animates between targets.
export default function TourSpotlight({ active, step, onBackdropClick }) {
  const scrimRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const measure = () => {
      const box = boxRef.current;
      const scrim = scrimRef.current;
      const selector = step?.placement !== "center" ? step?.target : null;
      const target = typeof selector === "string" ? document.querySelector(selector) : null;
      if (box && scrim) {
        if (target) {
          // Dimming comes entirely from the cutout box's own box-shadow spread, so the scrim must stay transparent or it'd paint over the "hole".
          scrim.style.background = "transparent";
          const rect = target.getBoundingClientRect();
          box.style.opacity = "1";
          box.style.top = `${rect.top - PADDING}px`;
          box.style.left = `${rect.left - PADDING}px`;
          box.style.width = `${rect.width + PADDING * 2}px`;
          box.style.height = `${rect.height + PADDING * 2}px`;
        } else {
          // No real target (a "center" step, or not yet resolved) — scrim provides a plain even dim, cutout box hidden.
          scrim.style.background = TOUR_OPTIONS.overlayColor;
          box.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [active, step]);

  if (!active) return null;

  return (
    <div
      ref={scrimRef}
      className="tour-spotlight-scrim"
      style={{ zIndex: TOUR_OPTIONS.zIndex }}
      onClick={onBackdropClick}
      aria-hidden="true"
    >
      <div
        ref={boxRef}
        className="tour-spotlight-cutout"
        style={{ boxShadow: `0 0 0 9999px ${TOUR_OPTIONS.overlayColor}` }}
      />
    </div>
  );
}
