import { ABOUT_DAGATSCAN_INTRO, TUTORIAL_COMPLETE_WITH_THANKS } from "../sharedCopy";

export const coastalMonitoringSteps = [
  {
    target: "body",
    placement: "center",
    title: "About DagatScan",
    content: ABOUT_DAGATSCAN_INTRO,
  },
  {
    target: "body",
    placement: "center",
    title: "Welcome to Coastal Monitoring",
    content:
      "The Coastal Monitoring page allows you to explore coastal erosion information across different municipalities in Bataan through an interactive map.",
  },
  {
    target: ".satellite-toggle",
    placement: "left",
    title: "Satellite and Street View Button",
    content: "Switch between Satellite View and Street View to view coastal areas from different map perspectives.",
  },
  {
    target: ".map-legend",
    placement: "right",
    title: "Legend",
    content:
      "The legend explains the coastal risk levels displayed on the map. Risk levels are based on the calculated shoreline erosion or accretion rate of each municipality. Very High – Erosion greater than 5 m/year. High – Erosion greater than 1 m/year and less than 5 m/year. Moderate – Minimal or no significant shoreline change. Low – Accretion less than 5 m/year. Very Low – Accretion greater than 5 m/year.",
  },
  {
    target: ".summary-card",
    placement: "right",
    title: "Coastal Summary",
    content:
      "The Coastal Summary provides a quick overview of the selected municipality. It displays the High-Risk Zones and the calculated Erosion Rate (m/year) based on the oldest and most recent shoreline records available in the system.",
  },
  {
    target: "body",
    placement: "center",
    title: "Municipality",
    content:
      "Select a municipality on the map to display its coastline. The shoreline is shown using a color-coded line based on its coastal risk level. Click the Information (!) icon to view the municipality's coastal risk level, erosion rate (m/year), and number of years of shoreline data. The same information is also available in the Coastal Summary card at the bottom-right of the page.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_WITH_THANKS,
  },
];
