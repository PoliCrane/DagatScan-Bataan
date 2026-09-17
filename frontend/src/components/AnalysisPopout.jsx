import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "../pages/styles/analysisPopout.css";

/**
 * Map-side stand-in for a result card that has scrolled out of the analysis panel.
 *
 * It is deliberately a compact read-only echo of the sidebar card rather than a second
 * home for the result: as soon as the real card is back on screen the parent stops
 * rendering this, so the result reads as having popped out temporarily.
 */
function AnalysisPopout({ cards }) {
  const visible = cards.filter((card) => card.show);

  return (
    <div className="analysis-popout-stack" aria-live="polite">
      <AnimatePresence>
        {visible.map((card) => (
          <motion.section
            key={card.key}
            className="analysis-popout"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <header className="analysis-popout-head">
              <i className={`${card.icon} analysis-popout-icon`} aria-hidden="true" />
              <h3 className="analysis-popout-title">{card.title}</h3>
              <button
                type="button"
                className="analysis-popout-jump"
                onClick={card.onReturn}
                title="Show this in the analysis panel"
                aria-label={`Show ${card.title} in the analysis panel`}
              >
                <i className="pi pi-arrow-up-right" aria-hidden="true" />
              </button>
            </header>

            {card.note ? (
              <p className="analysis-popout-note">{card.note}</p>
            ) : (
              <dl className="analysis-popout-items">
                {card.items.map((item) => (
                  <div
                    className={`analysis-popout-item${item.stacked ? " is-stacked" : ""}`}
                    key={item.label}
                  >
                    <dt>{item.label}</dt>
                    <dd style={item.color ? { color: item.color } : undefined}>
                      {item.value}
                      {item.unit && <span className="analysis-popout-unit"> {item.unit}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default memo(AnalysisPopout);
