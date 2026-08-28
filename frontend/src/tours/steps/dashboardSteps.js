import { ABOUT_DAGATSCAN_INTRO, TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";
import { scrollTargetIntoView } from "../scrollTargetIntoView";

export const dashboardSteps = [
  {
    target: "body",
    placement: "center",
    title: "About DagatScan",
    content: ABOUT_DAGATSCAN_INTRO,
  },
  {
    target: ".dashboard-stats",
    placement: "bottom",
    title: "Monitoring Statistics",
    before: scrollTargetIntoView(".dashboard-stats"),
    content:
      "The Monitoring Statistics cards provide a summary of the latest coastal monitoring information, including the number of Active Monitoring Sites, Latest Erosion Rate, Data Records, and Very High Risk Areas.",
  },
  {
    target: ".map-container",
    placement: "top",
    title: "Coastal Erosion Map",
    before: scrollTargetIntoView(".map-container"),
    content:
      "The Coastal Erosion Map provides an overview of monitored coastal areas in Bataan. Select View Full Map to open the Coastal Monitoring page.",
  },
  {
    target: ".info-box.system-status",
    placement: "left",
    title: "System Status",
    before: scrollTargetIntoView(".info-box.system-status"),
    content: "The System Status panel displays the current operational status of the system.",
  },
  {
    target: ".risk-legend-card",
    placement: "left",
    title: "Erosion Risk Level",
    before: scrollTargetIntoView(".risk-legend-card"),
    content:
      "The Erosion Risk Level panel explains the coastal risk categories used in the system based on the calculated shoreline erosion or accretion rate, from Very High to Very Low, to help users interpret the coastal conditions displayed throughout the system.",
  },
  {
    target: ".profile-btn",
    placement: "bottom",
    title: "User Account",
    before: scrollTargetIntoView(".profile-btn"),
    content:
      "Click the User Account menu in the upper-right corner to access account options, including Change Password and Logout.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
