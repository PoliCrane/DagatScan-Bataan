import { motion } from "framer-motion";
import "./TourInfoButton.css";

export default function TourInfoButton({ onClick, label = "Show page tour" }) {
  return (
    <motion.button
      className="tour-info-btn"
      onClick={onClick}
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
