import { createContext, useCallback, useContext, useState } from "react";
import { API_BASE_URL } from "../config/api";

const NdwiGenerationContext = createContext(null);

/**
 * Tracks an in-flight single-year NDWI generation app-wide (mounted in
 * App.jsx, above the router), so its progress survives navigating away
 * from Data Upload and a second click from another page can't start a
 * duplicate request on top of one still running. Doesn't survive a hard
 * refresh — a real reload genuinely aborts any in-flight fetch, and
 * there's no server-side job to resume polling (this is one direct
 * request/response, not a background job).
 */
export function NdwiGenerationProvider({ children }) {
  const [minimized, setMinimized] = useState(false);
  const [singleYear, setSingleYear] = useState({ generating: false, year: null, result: null, error: null });

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

  const toggleMinimized = useCallback(() => setMinimized((m) => !m), []);

  return (
    <NdwiGenerationContext.Provider value={{ minimized, toggleMinimized, singleYear, startSingleYear }}>
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
