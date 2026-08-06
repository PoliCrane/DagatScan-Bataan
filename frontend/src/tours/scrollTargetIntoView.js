// Shared `before`-hook helper: scrolls a step's own target into view
// synchronously before Joyride measures/spotlights it. Steps with no other
// setup (no fetch to wait out — see reportsSteps.js's waitForElement for
// that variant) still benefit from this when the target sits far enough
// down the page that reaching it depends on Joyride's own scroll-then-
// measure timing; doing the scroll ourselves means there's none of that
// left for it to race.
export const scrollTargetIntoView = (selector) => () =>
  new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "instant" });
        requestAnimationFrame(resolve);
      })
    );
  });
