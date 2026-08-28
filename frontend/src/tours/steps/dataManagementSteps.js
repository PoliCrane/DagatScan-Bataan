import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";
import { scrollTargetIntoView } from "../scrollTargetIntoView";
import { scrollTargetIntoViewNearest } from "../scrollTargetIntoViewNearest";

// polls the DOM until an element renders (e.g. after the uploads fetch resolves), then scrolls it into view
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

export const dataManagementSteps = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Data Management",
    content:
      "The Data Management page allows administrators to view and manage all uploaded historical coastal datasets. You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the information (i) icon available on the page.",
  },
  {
    target: ".dm-stats",
    placement: "bottom",
    title: "Dataset Summary",
    before: scrollTargetIntoViewNearest(".dm-stats"),
    content:
      "The summary cards show a quick overview of the dataset library: Total Datasets, Active Datasets, Inactive Datasets, and Total Uploaded By, based on all uploads recorded in the system.",
  },
  {
    target: ".dm-filter-bar",
    placement: "bottom",
    title: "Search and Filters",
    before: scrollTargetIntoView(".dm-filter-bar"),
    content:
      "Use the Search box to find a dataset by file name, municipality, uploader, or year. The Municipality, Year, and Status filters narrow the list further, and Reset Filters clears everything back to the full list.",
  },
  {
    target: ".dm-table-container",
    placement: "top",
    title: "Dataset List",
    before: scrollTargetIntoView(".dm-table-container"),
    content:
      "The Dataset List shows every uploaded dataset with its satellite image preview, municipality, year, uploader, upload date, and status.",
  },
  {
    target: ".dm-view-btn",
    placement: "top",
    title: "Dataset Actions",
    before: waitForElement(".dm-view-btn"),
    content:
      "Each row's actions let you View the NDWI preview, fetch true-color Satellite Imagery for that area and year, and (for Superadmins) activate or deactivate the dataset. Datasets that were superseded by a later upload show a delete option instead, since their data no longer contributes to any analysis.",
  },
  {
    target: ".dm-pagination",
    placement: "top",
    title: "Pagination",
    before: waitForElement(".dm-pagination"),
    content: "Use the pagination controls to browse through the full dataset list, page by page.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
