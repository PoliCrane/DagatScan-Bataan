import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import "./TourInfoButton.css";

// Long enough that the hint reads as an occasional nudge rather than a constant
// animation, but short enough that someone who never notices the button still
// gets a second chance within a normal page visit.
const FIRST_HINT_MS = 12000;
const HINT_GAP_MS = 60000;
// Must match the ring/glow keyframes' duration x iteration-count in TourInfoButton.css.
const HINT_DURATION_MS = 4500;

export default function TourInfoButton({ onClick, label = "Show page tour" }) {
  const [hinting, setHinting] = useState(false);
  // Once they've opened the tour they know the button is there — stop nudging.
  const [found, setFound] = useState(false);

  useEffect(() => {
    if (found) return undefined;

    let settleTimer;
    let nextTimer;

    const pulse = () => {
      setHinting(true);
      settleTimer = setTimeout(() => {
        setHinting(false);
        nextTimer = setTimeout(pulse, HINT_GAP_MS);
      }, HINT_DURATION_MS);
    };

    nextTimer = setTimeout(pulse, FIRST_HINT_MS);

    return () => {
      clearTimeout(settleTimer);
      clearTimeout(nextTimer);
    };
  }, [found]);

  const handleClick = (event) => {
    setHinting(false);
    setFound(true);
    onClick?.(event);
  };

  return (
    <motion.button
      className={`tour-info-btn${hinting ? " is-hinting" : ""}`}
      onClick={handleClick}
      title={label}
      aria-label={label}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
    >
      <i className="pi pi-info-circle tour-info-icon" aria-hidden="true" />
    </motion.button>
  );
}
