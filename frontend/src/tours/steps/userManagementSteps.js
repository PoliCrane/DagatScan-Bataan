import { TUTORIAL_COMPLETE_STANDARD } from "../sharedCopy";
import { scrollTargetIntoViewNearest } from "../scrollTargetIntoViewNearest";

// .icon-edit-btn/.status-toggle-btn only render once the accounts/requests
// fetch in UserManagement.jsx resolves and at least one row exists — same
// reasoning as reportsSteps.js's waitForElement.
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

export const userManagementSteps = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to User Management",
    content:
      "The User Management page is where Superadmins manage every account in the system — pending account requests, Superadmin accounts, Admin accounts, and Municipal accounts. You can continue this guide by clicking the 'Next' button or close it at any time. To reopen the guide, simply click the information (i) icon available on the page.",
  },
  {
    target: ".add-admin-btn",
    placement: "bottom",
    title: "Add Account",
    before: scrollTargetIntoViewNearest(".add-admin-btn"),
    content: "Click Add Account to create a new account directly, without going through the request process.",
  },
  {
    target: ".search-bar-wrapper",
    placement: "bottom",
    title: "Search",
    before: scrollTargetIntoViewNearest(".search-bar-wrapper"),
    content: "Use the Search bar to quickly find an account by its username or email address.",
  },
  {
    target: ".user-section",
    placement: "top",
    title: "Account Sections",
    before: waitForElement(".user-section"),
    content:
      "Accounts are grouped into sections: Pending Account Requests, Superadmin Accounts, Admin Accounts, and Municipal Accounts, so you always know which accounts still need review.",
  },
  {
    target: ".icon-edit-btn",
    placement: "top",
    title: "Edit Account",
    before: waitForElement(".icon-edit-btn"),
    content:
      "Click Edit to update an account's details, including its role — for example, changing a Municipal account to Admin or back.",
  },
  {
    target: ".status-toggle-btn",
    placement: "top",
    title: "Activate or Deactivate",
    before: waitForElement(".status-toggle-btn"),
    content:
      "Use this toggle to activate or deactivate an account. A deactivated account can't log in until it's reactivated.",
  },
  {
    target: "body",
    placement: "center",
    title: "Tutorial Complete!",
    content: TUTORIAL_COMPLETE_STANDARD,
  },
];
