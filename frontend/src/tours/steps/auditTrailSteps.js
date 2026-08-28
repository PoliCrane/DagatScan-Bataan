import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";
import { scrollTargetIntoView } from "../scrollTargetIntoView";
import { scrollTargetIntoViewNearest } from "../scrollTargetIntoViewNearest";

// polls the DOM until an element renders (e.g. after the audit-logs fetch resolves), then scrolls it into view
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

export const auditTrailSteps = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to the Audit Trail",
    content:
      "The Audit Trail page gives Superadmins a record of every admin action taken across the system — who did what, to what, and when. You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the information (i) icon available on the page.",
  },
  {
    target: ".at-stats",
    placement: "bottom",
    title: "Activity Summary",
    before: scrollTargetIntoViewNearest(".at-stats"),
    content:
      "The summary cards show Total Activities logged, Critical Actions (deletions, deactivations, and role escalations), Data Activities (uploads and dataset changes), and User Activities (account and role changes).",
  },
  {
    target: ".at-filter-bar",
    placement: "bottom",
    title: "Search and Filters",
    before: scrollTargetIntoView(".at-filter-bar"),
    content:
      "Use the Search box to find an entry by actor, action, or target. The Category and Severity filters narrow the log further, and Reset Filters clears everything back to the full list.",
  },
  {
    // targets the table header, not the container — the container can grow to 25 rows and push the tooltip off-screen
    target: ".at-table thead",
    placement: "bottom",
    title: "Activity Log",
    before: waitForElement(".at-table thead"),
    content:
      "The Activity Log lists every recorded action with its timestamp, the account that performed it (Actor), what happened (Action), what it affected (Target), and additional context (Details).",
  },
  {
    target: ".at-severity-badge",
    placement: "left",
    title: "Severity",
    before: waitForElement(".at-severity-badge"),
    content:
      "Each entry is marked Critical or Normal. Critical covers destructive or high-privilege actions — deletions, deactivations, and role changes to Admin or Superadmin — so they stand out from routine activity.",
  },
  {
    target: ".at-pagination",
    placement: "top",
    title: "Pagination",
    before: waitForElement(".at-pagination"),
    content: "Use the pagination controls to browse through the full activity log, page by page.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
