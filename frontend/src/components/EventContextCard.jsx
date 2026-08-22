import { memo, useEffect, useState } from "react";
import { api } from "../api/client";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function EventContextCard({ year }) {
  const [context, setContext] = useState(null);

  useEffect(() => {
    setContext(null);
    if (!year) return;
    let cancelled = false;
    api(`/api/shoreline/context/${year}`)
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (!year || !context) return null;
  const hasAnything = context.enso || context.waves || (context.typhoons || []).length > 0;
  if (!hasAnything) return null;

  return (
    <div className="tools-card">
      <div className="card-header">
        <i className="pi pi-exclamation-triangle card-icon" aria-hidden="true" />
        <h3 className="card-title">What Happened in {year}</h3>
      </div>
      <div className="ds-event-body">
        {context.enso && (
          <div className="flex items-center justify-between gap-2">
            <span>ENSO state</span>
            <span className="ds-event-value">{context.enso.state}</span>
          </div>
        )}
        {context.waves && (
          <div className="flex items-center justify-between gap-2">
            <span>Max wave height</span>
            <span className="ds-event-value">{context.waves.maxWaveM} m</span>
          </div>
        )}
        {(context.typhoons || []).length > 0 && (
          <div>
            <span className="mb-1 block">Typhoons near Bataan:</span>
            <ul className="m-0 list-disc pl-5">
              {context.typhoons.map((t) => (
                <li key={t.name + t.month} className="ds-event-value">
                  <span className="font-semibold">{t.name}</span>
                  {t.month ? ` (${MONTHS[t.month]})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="ds-event-sources">
          Sources: NOAA IBTrACS, CPC ONI, Open-Meteo Marine
        </p>
      </div>
    </div>
  );
}

export default memo(EventContextCard);
