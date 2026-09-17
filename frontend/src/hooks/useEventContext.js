import { useEffect, useState } from "react";
import { api } from "../api/client";

// 1-indexed so a typhoon's `month` can index straight in.
export const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * ENSO state, wave height and typhoons recorded for one year, or null while loading /
 * when that year has no entry. The backend serves this from a file it caches in memory,
 * so several consumers asking for the same year costs nothing meaningful.
 *
 * A missing year is a normal outcome, not an error — callers just render nothing.
 */
export default function useEventContext(year) {
  const [entry, setEntry] = useState({ year: null, data: null });

  useEffect(() => {
    if (!year) return undefined;

    let cancelled = false;
    api(`/api/shoreline/context/${year}`)
      .then((data) => {
        if (!cancelled) setEntry({ year, data });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [year]);

  // Held against the year it was fetched for, so switching years reads as "nothing yet"
  // without clearing state from inside the effect — the previous year's storms can
  // never flash up beside the new year's label.
  return entry.year === year ? entry.data : null;
}

/** "NOCK-TEN (Dec), MELOR (Nov)" — compact enough for a one-line readout. */
export function formatTyphoons(typhoons) {
  return (typhoons || [])
    .map((t) => (t.month ? `${t.name} (${MONTHS[t.month]})` : t.name))
    .join(", ");
}
