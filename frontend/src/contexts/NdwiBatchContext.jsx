import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config/api";

const TERMINAL_STATUSES = ["complete", "complete_with_errors", "failed"];
const STORAGE_KEY = "ndwiBatchJobId";
const POLL_INTERVAL_MS = 3000;

const NdwiBatchContext = createContext(null);

/**
 * Tracks an in-flight NDWI "Generate All Years" batch job app-wide, so its
 * progress survives navigating away from Data Upload (App.jsx mounts this
 * above the router) and a hard refresh (the active job id is mirrored to
 * localStorage — the batch itself runs server-side regardless, this just
 * lets the UI find its way back to polling it).
 */
export function NdwiBatchProvider({ children }) {
  const [jobId, setJobId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(() => !!localStorage.getItem(STORAGE_KEY));
  const [minimized, setMinimized] = useState(false);
  const intervalRef = useRef(null);

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
        // Job not found (purged, or a stale id from a previous session) or
        // no longer authorized — nothing useful to track, stop quietly.
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
    <NdwiBatchContext.Provider
      value={{ jobId, status, running, minimized, startBatch, dismiss, toggleMinimized }}
    >
      {children}
    </NdwiBatchContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong in one file
export function useNdwiBatch() {
  const ctx = useContext(NdwiBatchContext);
  if (!ctx) throw new Error("useNdwiBatch must be used within an NdwiBatchProvider");
  return ctx;
}
