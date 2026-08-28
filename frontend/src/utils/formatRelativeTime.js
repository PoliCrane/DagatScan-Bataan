// Formats a timestamp as relative time ("3 months ago"). Returns "Never" for a null/undefined timestamp.
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "Never";

  const then = new Date(timestamp);
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);

  if (seconds < 0) return "Just now";
  if (seconds < 60) return "Just now";

  const units = [
    { limit: 60 * 60, value: 60, label: "minute" },
    { limit: 60 * 60 * 24, value: 60 * 60, label: "hour" },
    { limit: 60 * 60 * 24 * 30, value: 60 * 60 * 24, label: "day" },
    { limit: 60 * 60 * 24 * 365, value: 60 * 60 * 24 * 30, label: "month" },
    { limit: Infinity, value: 60 * 60 * 24 * 365, label: "year" },
  ];

  const unit = units.find((u) => seconds < u.limit);
  const count = Math.floor(seconds / unit.value);
  return `${count} ${unit.label}${count === 1 ? "" : "s"} ago`;
}
