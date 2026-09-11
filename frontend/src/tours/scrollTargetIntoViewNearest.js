// Same shape as scrollTargetIntoView.js, but scrolls the minimum distance (block: "nearest") instead of always centering.
// Centering a target near the top of the page would overshoot and push the header out of view; "nearest" is a no-op if the target is already visible, as it is right after useGuidedTour's resetScroll().
export const scrollTargetIntoViewNearest = (selector) => () =>
  new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.querySelector(selector)?.scrollIntoView({ block: "nearest", behavior: "instant" });
        requestAnimationFrame(resolve);
      })
    );
  });
