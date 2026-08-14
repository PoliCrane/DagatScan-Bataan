import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config/api";

const TERMINAL_STATUSES = ["complete", "complete_with_errors", "failed", "cancelled"];
const STORAGE_KEY = "ndwiBatchJobId";
const POLL_INTERVAL_MS = 3000;

const NdwiGenerationContext = createContext(null);

/**
 * Tracks in-flight NDWI generation app-wide (mounted in App.jsx, above the
 * router) — both single-year ("Generate This Year") and the multi-year
 * "Generate All Years" batch — so progress survives navigating away from
 * Data Upload, and a second click from another page can't start a
 * duplicate request on top of one still running.
 *
 * The batch job's server-side state lives in-memory on the backend (see
 * ndwiBatchWorker.js), not a DB table — this context mirrors the active job
 * id to localStorage so polling can resume after a hard refresh, same as
 * before, but a server restart loses the job's progress-tracking wrapper
 * (the actual processed years are already safely saved regardless).
 *
 * Single-year generation has no server-side job to poll — it's one direct
 * request/response — so it's tracked separately below (singleYear) and
 * doesn't survive a hard refresh, unlike the batch.
 */
export function NdwiGenerationProvider({ children }) {
  const [jobId, setJobId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(() => !!localStorage.getItem(STORAGE_KEY));
  const [minimized, setMinimized] = useState(false);
  const intervalRef = useRef(null);

  const [singleYear, setSingleYear] = useState({ generating: false, year: null, result: null, error: null });

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async (id) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/generate-ndwi-batch/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        // Job not found (server restarted, or a stale id from a previous
        // session) or no longer authorized — nothing useful to track, stop
        // quietly.
        clearPolling();
        localStorage.removeItem(STORAGE_KEY);
        setJobId(null);
        setRunning(false);
        return;
      }
      const data = await response.json();
      setStatus(data);
      if (TERMINAL_STATUSES.includes(data.status)) {
        clearPolling();
        localStorage.removeItem(STORAGE_KEY);
        setRunning(false);
      }
    } catch {
      // Transient network hiccup — keep polling, next tick retries.
    }
  }, [clearPolling]);

  const beginPolling = useCallback((id) => {
    clearPolling();
    pollOnce(id);
    intervalRef.current = setInterval(() => pollOnce(id), POLL_INTERVAL_MS);
  }, [clearPolling, pollOnce]);

  // Resume tracking a job that was still running when the page was last
  // closed/refreshed.
  useEffect(() => {
    if (jobId) beginPolling(jobId);
    return clearPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startBatch = useCallback(async (payload) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_BASE_URL}/api/generate-ndwi-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to start batch generation");
    }

    localStorage.setItem(STORAGE_KEY, String(data.jobId));
    setJobId(data.jobId);
    setStatus({ status: "pending", totalYears: data.totalYears, completedYears: [], failedYears: [], currentYear: null });
    setRunning(true);
    setMinimized(false);
    beginPolling(data.jobId);

    return data;
  }, [beginPolling]);

  // Runs the actual fetch here (not in DataUpload.jsx) so it lives in this
  // provider's closure — mounted once in App.jsx, above the router, so the
  // request keeps running and updating shared state no matter which page
  // is active when it resolves.
  const startSingleYear = useCallback(async (payload) => {
    setSingleYear({ generating: true, year: payload.year, result: null, error: null });
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/generate-ndwi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error || data.message || "NDWI generation failed";
        setSingleYear({ generating: false, year: payload.year, result: null, error: errorMessage });
        return { success: false, error: errorMessage };
      }

      setSingleYear({ generating: false, year: payload.year, result: data, error: null });
      return data;
    } catch (err) {
      const errorMessage = err.message || "Network error while generating NDWI";
      setSingleYear({ generating: false, year: payload.year, result: null, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, []);

  // Best-effort — doesn't optimistically flip local state, the next poll
  // tick (already running every 3s) reflects whatever the server actually
  // did. Can only pre-empt the *next* year the worker was about to start,
  // not one already mid-processing.
  const cancelBatch = useCallback(async () => {
    if (!jobId) return;
    const token = localStorage.getItem("token");
    try {
      await fetch(`${API_BASE_URL}/api/generate-ndwi-batch/${jobId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Transient network hiccup — the next poll tick will show the real state regardless.
    }
  }, [jobId]);

  const dismiss = useCallback(() => {
    clearPolling();
    localStorage.removeItem(STORAGE_KEY);
    setJobId(null);
    setStatus(null);
    setRunning(false);
    setMinimized(false);
  }, [clearPolling]);

  const toggleMinimized = useCallback(() => setMinimized((m) => !m), []);

  return (
    <NdwiGenerationContext.Provider
      value={{ jobId, status, running, minimized, startBatch, dismiss, toggleMinimized, cancelBatch, singleYear, startSingleYear }}
    >
      {children}
    </NdwiGenerationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong in one file
export function useNdwiGeneration() {
  const ctx = useContext(NdwiGenerationContext);
  if (!ctx) throw new Error("useNdwiGeneration must be used within an NdwiGenerationProvider");
  return ctx;
}
