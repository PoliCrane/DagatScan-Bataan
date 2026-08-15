import { useState } from "react";
import "./FaqAccordion.css";

// each item expands/collapses independently. item shape: { question, answer? } or { question, bullets?, note? }
export default function FaqAccordion({ items }) {
  const [openIndices, setOpenIndices] = useState(() => new Set());

  const toggle = (idx) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  return (
    <div className="faq-accordion">
      {items.map((item, idx) => {
        const isOpen = openIndices.has(idx);
        return (
          <div className={`faq-item ${isOpen ? "open" : ""}`} key={idx}>
            <button
              className="faq-item-header"
              onClick={() => toggle(idx)}
              aria-expanded={isOpen}
            >
              <img src="/question.png" alt="" className="faq-item-icon" />
              <span className="faq-item-question">{item.question}</span>
              <span className="faq-item-chevron" aria-hidden="true" />
            </button>
            <div className="faq-item-body-wrapper">
              <div className="faq-item-body">
                {item.answer && <p>{item.answer}</p>}
                {item.bullets && (
                  <ul>
                    {item.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {item.note && <p className="faq-item-note">{item.note}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
