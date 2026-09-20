import { useEffect, useState } from "react";

// One fetch for the whole session. The promise is cached at module level rather than
// per-component so StrictMode's double-mount in dev can't fire a second request, and a
// second consumer on the same page reuses the first one's result.
let bataanPromise = null;

function loadBataan() {
  if (!bataanPromise) {
    bataanPromise = fetch("/data/BATAAN.geojson").then((res) => {
      if (!res.ok) throw new Error(`Boundary file failed to load (HTTP ${res.status})`);
      return res.json();
    });
    // A failed load shouldn't poison every later attempt.
    bataanPromise.catch(() => {
      bataanPromise = null;
    });
  }
  return bataanPromise;
}

/** Bataan's municipality polygons, as `{ data, error }`. */
export default function useBataanGeoJson() {
  const [state, setState] = useState({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadBataan()
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
