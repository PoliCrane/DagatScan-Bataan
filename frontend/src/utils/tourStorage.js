// Tracks which guided tours an account has seen, per page. Plain localStorage
// since "seen" only needs to persist per browser, not follow the account across devices.
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

// QA-only: forces a page's tour to auto-play again. Not called in production flows.
export function resetTourSeen(pageId) {
  localStorage.removeItem(buildKey(pageId));
}
