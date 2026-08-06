import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";

export const erosionAnalysisSteps = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Erosion Analysis",
    content:
      "The Erosion Analysis page helps you compare past and present coastlines and estimate possible future shoreline changes. The results are displayed on the map along with coastal erosion information for the selected municipality. You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the information (i) icon available on each page.",
  },
  {
    target: ".erosion-legend",
    placement: "right",
    title: "Legend",
    content:
      "The legend explains the shoreline layers and coastal change areas displayed on the map during shoreline comparison and prediction. Previous Shoreline – Coastline from the selected past year. Current Shoreline – Coastline from the selected current year. Predicted Shoreline – Estimated future coastline. Erosion Area – Area where the shoreline has moved inland. Accretion Area – Area where the shoreline has moved seaward.",
  },
  {
    target: ".tools-card.compare-card",
    placement: "left",
    title: "Compare Shoreline",
    content:
      "The Compare Shoreline tool allows you to compare coastline changes between two selected years. Select a Past Year and a Current Year, then click the Analyze button to display the previous shoreline, current shoreline, and erosion or accretion areas on the map.",
  },
  {
    target: "body",
    placement: "center",
    title: "Erosion Analysis Result",
    content:
      "The Erosion Analysis card displays the results of the shoreline comparison for the selected municipality. The card includes the Municipality, Coastline Length, Erosion or Accretion Rate (m/year), and Coastal Risk Level.",
  },
  {
    target: ".tools-card.prediction-tools-card",
    placement: "left",
    title: "Coastline Prediction",
    content:
      "The Coastline Prediction tool estimates possible future coastline changes based on historical shoreline data. Select a Base Year and a Prediction Year, then click the Simulate button to display the Predicted Shoreline on the map. The Prediction Result card will appear below the Erosion Analysis card, showing the Predicted Year, Estimated Retreat, and Projected Erosion Rate (m/year).",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
