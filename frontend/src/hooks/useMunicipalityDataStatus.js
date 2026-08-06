import { useEffect, useState } from "react";

import { API_BASE_URL } from "../config/api";
/**
 * Municipalities with analyzable shoreline data (uppercased names), or null
 * while loading. Shared by coastalmonitoring.jsx and erosionanalysis.jsx.
 */
export default function useMunicipalityDataStatus() {
  const [dataStatus, setDataStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/api/shoreline/municipalities`)
      .then((res) => res.json())
      .then((rows) => {
        if (cancelled) return;
        setDataStatus(
          new Set(rows.filter((r) => r.hasData).map((r) => r.name.toUpperCase()))
        );
      })
      .catch((err) => {
        console.error("Could not load municipality data status:", err.message);
        // Fail safe as "nothing has data" rather than leaving callers stuck
        // waiting on null forever.
        if (!cancelled) setDataStatus(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return dataStatus;
}
