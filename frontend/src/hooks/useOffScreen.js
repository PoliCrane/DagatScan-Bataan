import { useEffect, useState } from "react";

// A card peeking a few pixels past the panel's edge shouldn't count as readable, so the
// observation box is inset from the viewport rather than matching it exactly.
const VIEWPORT_INSET = "-72px 0px -48px 0px";

/**
 * True when `active` is set but the referenced node isn't actually readable on screen.
 *
 * Observed against the viewport rather than the sidebar's scroll container, because that
 * covers both ways the analysis panel hides a card: scrolled out of its own overflow area,
 * and the whole panel collapsed off the right edge with a transform.
 */
export default function useOffScreen(nodeRef, active) {
  const [offScreen, setOffScreen] = useState(false);

  useEffect(() => {
    if (!active) return undefined;

    const node = nodeRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setOffScreen(!entry.isIntersecting),
      { rootMargin: VIEWPORT_INSET }
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [nodeRef, active]);

  // Derived rather than reset inside the effect, so a watcher that has just been
  // switched off can't leave a stale "hidden" reading behind for a frame.
  return active && offScreen;
}
