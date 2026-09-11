// Shared `before`-hook helper: scrolls a step's target into view synchronously before Joyride measures/spotlights it,
// so there's no race with Joyride's own scroll-then-measure timing. For steps that also need to wait on a fetch, see reportsSteps.js's waitForElement.
export const scrollTargetIntoView = (selector) => () =>
  new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "instant" });
        requestAnimationFrame(resolve);
      })
    );
  });
