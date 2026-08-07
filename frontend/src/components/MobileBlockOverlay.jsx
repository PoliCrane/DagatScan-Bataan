import useIsMobile from "../hooks/useIsMobile";
import "./MobileBlockOverlay.css";

// Sits outside <BrowserRouter> in App.jsx so it covers every route, public
// and admin alike, with no dependency on routing state. No dismiss action —
// this is a firm block, not a warning banner: the map/table-heavy admin
// tooling this system wraps isn't usable on a phone-sized screen.
export default function MobileBlockOverlay() {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <div className="mobile-block-overlay">
      <div className="mobile-block-card">
        <svg
          className="mobile-block-icon"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="4" width="20" height="13" rx="1.5" stroke="#0077B6" strokeWidth="1.6" />
          <path d="M8 21h8M12 17v4" stroke="#0077B6" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <h2>Desktop Only</h2>
        <p>
          DagatScan Bataan is optimized for desktop use and isn't available on mobile devices.
          Please visit this site from a desktop or laptop computer.
        </p>
      </div>
    </div>
  );
}
