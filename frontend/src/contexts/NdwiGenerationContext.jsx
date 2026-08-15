import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config/api";

const TERMINAL_STATUSES = ["complete", "complete_with_errors", "failed", "cancelled"];
const STORAGE_KEY = "ndwiBatchJobId";
const POLL_INTERVAL_MS = 3000;

const NdwiGenerationContext = createContext(null);

/**
 * Tracks in-flight NDWI generation app-wide (mounted in App.jsx above the
 * router) so progress survives page navigation. Batch job state lives
 * in-memory on the backend; the active job id is mirrored to localStorage
 * so polling resumes after a hard refresh. Single-year generation is a
 * direct request/response with no server-side job, tracked separately
 * (singleYear) and doesn't survive a refresh.
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
        // job not found or no longer authorized — stop quietly
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
      // network hiccup — next tick retries
    }
  }, [clearPolling]);

  const beginPolling = useCallback((id) => {
    clearPolling();
    pollOnce(id);
    intervalRef.current = setInterval(() => pollOnce(id), POLL_INTERVAL_MS);
  }, [clearPolling, pollOnce]);

  // resume tracking a job still running when the page was last closed
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

  // fetch lives here (not in DataUpload.jsx) so it keeps running and updating shared state regardless of active page
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

  // best-effort; doesn't flip local state, the next poll tick reflects the real server state.
  // can only pre-empt the next year, not one already mid-processing
  const cancelBatch = useCallback(async () => {
    if (!jobId) return;
    const token = localStorage.getItem("token");
    try {
      await fetch(`${API_BASE_URL}/api/generate-ndwi-batch/${jobId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // network hiccup — next poll tick shows the real state
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
