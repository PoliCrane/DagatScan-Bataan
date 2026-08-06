import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";

// .reports-table and .btn-print-report only render once the zones fetch in
// Reports.jsx resolves (and, for the print button, once at least one row
// survives the current filters) — unlike dataUploadSteps.js's switchTab
// hook, there's no state to flip here, just a fetch to wait out, so this
// polls the DOM directly instead of needing Reports.jsx to expose its
// loading state to this file.
//
// Once found, scroll it into view ourselves before resolving — same reason
// as dataUploadSteps.js's switchTab: leaving that scroll to Joyride risks
// the spotlight hole landing at the target's final coordinates before the
// page has actually scrolled there, showing blank space instead of the
// real table/button.
const waitForElement = (selector, timeout = 5000) => () =>
  new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el || Date.now() - start > timeout) {
        el?.scrollIntoView({ block: "center", behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(resolve));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });

export const reportsSteps = [
  {
    target: "body",
    placement: "center",
    title: "Coastal Erosion Assessment Report",
    content:
      "Welcome to the Coastal Erosion Assessment Report. The Report Module allows users to browse, preview, and access coastal erosion assessment reports generated for different municipalities in Bataan. You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the information (i) icon available on each page.",
  },
  {
    target: "#municipality-filter",
    placement: "bottom",
    title: "Municipality",
    content:
      "Use the Municipality filter to display reports for a specific municipality. Select All to view reports from all municipalities.",
  },
  {
    target: "#year-filter",
    placement: "bottom",
    title: "Year Filter",
    content:
      "Use the Year filter to display reports for a specific year. Select All to view reports from all available years.",
  },
  {
    target: ".reports-search-box",
    placement: "bottom",
    title: "Search",
    content: "Use the Search box to quickly find a report by entering its title or related keyword.",
  },
  {
    target: ".reports-table",
    placement: "top",
    title: "Report List",
    before: waitForElement(".reports-table"),
    content:
      "The Report List displays all available coastal erosion assessment reports. Each entry shows the report title, municipality, year, and available actions. Select View PDF to preview the selected report.",
  },
  {
    target: ".btn-print-report",
    placement: "left",
    title: "Print Report",
    before: waitForElement(".btn-print-report"),
    content: "Click the Print icon beside the View PDF to print a copy of the coastal erosion assessment report.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
