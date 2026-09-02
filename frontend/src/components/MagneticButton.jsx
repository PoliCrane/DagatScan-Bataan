import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

const MAX_PULL = 12;

// Shifts toward the cursor within its own bounds and springs back on leave —
// a self-contained micro-interaction, not tied to any page-level pointer tracking.
export default function MagneticButton({ className, onClick, children, ...rest }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 300, damping: 20, mass: 0.5 });

  const handleMouseMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - (rect.left + rect.width / 2);
    const offsetY = e.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-MAX_PULL, Math.min(MAX_PULL, offsetX * 0.4)));
    y.set(Math.max(-MAX_PULL, Math.min(MAX_PULL, offsetY * 0.4)));
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      className={className}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
