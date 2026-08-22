import { useEffect, useRef, useState } from "react";
import "../pages/styles/satelliteToggle.css";

export default function SatelliteToggle({ isSatellite, onToggle }) {
  const toggleRef = useRef(null);
  const [isVisible, setIsVisible] = useState(true);
  let lastScrollY = 0;

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down
        setIsVisible(false);
      } else {
        // Scrolling up
        setIsVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div 
      className={`satellite-toggle ${isVisible ? "visible" : "hidden"}`} 
      ref={toggleRef}
    >
      <div className="toggle-content">
        <button 
          className="toggle-button"
          onClick={onToggle}
          title={isSatellite ? "Switch to Street Map" : "Switch to Satellite"}
        >
          <i
            className={`${isSatellite ? "pi pi-globe" : "pi pi-map"} toggle-icon`}
            aria-hidden="true"
          />
        </button>
        <span className="toggle-label">{isSatellite ? "Satellite" : "Street"}</span>
      </div>
    </div>
  );
}
