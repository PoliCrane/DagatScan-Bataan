import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";

// polls the DOM until an element renders, then scrolls it into view ourselves before resolving
// (leaving the scroll to Joyride risks the spotlight landing before the page actually scrolls there)
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
