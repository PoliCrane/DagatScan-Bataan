// Same shape as scrollTargetIntoView.js, but scrolls the minimum distance
// needed (block: "nearest") instead of always centering. For a target that
// sits right at the top of a page (e.g. immediately after a short header),
// centering it overshoots — it scrolls far enough to push the header (and
// anything else above the target) out of view, since "center" pulls the
// target to the vertical middle of the viewport regardless of how close to
// the top it already was. "nearest" does nothing if the target is already
// visible, which it is here right after useGuidedTour's resetScroll().
export const scrollTargetIntoViewNearest = (selector) => () =>
  new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.querySelector(selector)?.scrollIntoView({ block: "nearest", behavior: "instant" });
        requestAnimationFrame(resolve);
      })
    );
  });
