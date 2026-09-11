import { useState, useEffect } from "react";

// Matches the app's existing 768px mobile/tablet breakpoint, combined with a touch-primary check so a narrow desktop window isn't mistaken for a phone or tablet.
const MOBILE_QUERY = "(max-width: 768px) and (pointer: coarse)";

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
