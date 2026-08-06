// Tracks which guided tours an account has already seen, per page. Plain
// localStorage (matches this app's existing token/username/roles pattern —
// no central storage abstraction exists) rather than a DB column, since
// "seen" only needs to persist per browser, not follow the account across
// devices.
const KEY_PREFIX = "dagatscan_tour_seen";

function buildKey(pageId) {
  const username = localStorage.getItem("username") || "anon";
  return `${KEY_PREFIX}:${pageId}:${username}`;
}

export function hasSeenTour(pageId) {
  return localStorage.getItem(buildKey(pageId)) === "true";
}

export function markTourSeen(pageId) {
  localStorage.setItem(buildKey(pageId), "true");
}

// QA-only: lets a tester force a page's tour to auto-play again without
// switching accounts. Not called anywhere in production flows.
export function resetTourSeen(pageId) {
  localStorage.removeItem(buildKey(pageId));
}
