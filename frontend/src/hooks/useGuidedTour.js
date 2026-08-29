import { useEffect, useRef } from "react";
import { useJoyride } from "react-joyride";
import { hasSeenTour, markTourSeen } from "../utils/tourStorage";
import { TOUR_LOCALE, TOUR_OPTIONS, TOUR_STYLES, TOUR_FLOATING_OPTIONS } from "../tours/joyrideTheme";

// Reusable guided-tour state machine: auto-plays a page's tour once per
// account, and always allows a manual replay via the returned `replay()`.
// `onBeforeStart`, if given, runs right before the tour starts (auto-play or
// replay alike) — e.g. to force open a panel some steps target.
export default function useGuidedTour(pageId, steps, { onBeforeStart } = {}) {
  const { controls, on, Tour } = useJoyride({
    continuous: true,
    steps,
    locale: TOUR_LOCALE,
    options: TOUR_OPTIONS,
    styles: TOUR_STYLES,
    floatingOptions: TOUR_FLOATING_OPTIONS,
  });

  // "tour:end" fires for Finish, Skip, and the close button alike — any of
  // those should stop the tour from auto-playing again for this account.
  useEffect(() => on("tour:end", () => markTourSeen(pageId)), [on, pageId]);

  // Async data fetches resize .layout-main after the tour has already
  // measured its target; dispatch a synthetic resize so Joyride remeasures.
  useEffect(() => {
    const target = document.querySelector(".layout-main");
    if (!target || typeof ResizeObserver === "undefined") return;
    let raf = null;
    const observer = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Every page's real scroll container is .layout-main (layout.css,
  // overflow-y:auto), not the window — window.scrollTo alone leaves it
  // wherever the user last scrolled it, since the two are independent.
  const resetScroll = () => {
    window.scrollTo(0, 0);
    document.querySelector(".layout-main")?.scrollTo(0, 0);
  };

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (!hasSeenTour(pageId)) {
      // Reset scroll first: some targets hide themselves past 100px scroll.
      resetScroll();
      onBeforeStart?.();
      controls.start();
    }
  }, [controls, pageId]);

  const replay = () => {
    resetScroll();
    onBeforeStart?.();
    controls.reset(true);
  };

  return { Tour, replay };
}
