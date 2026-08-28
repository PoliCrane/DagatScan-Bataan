import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";

export const coastalAwarenessSteps = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to the Coastal Awareness",
    content:
      "The Coastal Awareness page provides educational resources about coastal erosion in Bataan. It helps users understand what coastal erosion is, its causes and effects, and the different coastal protection strategies that can reduce shoreline degradation. The information presented on this page is based on publicly available educational materials from the Department of Environment and Natural Resources (DENR) and the Mines and Geosciences Bureau (MGB). You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the information (i) icon available on each page.",
  },
  {
    target: ".awareness-topic-cards",
    placement: "bottom",
    title: "Information Cards",
    content:
      "The Topic Navigation allows users to switch between the available educational sections, including What is Coastal Erosion, Causes, Effects, and Coastal Protection. Select any topic card to view its corresponding content.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
