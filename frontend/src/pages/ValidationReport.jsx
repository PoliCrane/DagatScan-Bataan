import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import AsyncSection from "../components/AsyncSection";
import { api } from "../api/client";

const pct = (v) => (v == null ? "—" : `${v}%`);
const num = (v, unit = "") => (v == null ? "—" : `${v}${unit}`);

export default function ValidationReport() {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/shoreline/validation/latest", { auth: true })
      .then(setRun)
      .catch((err) => setError(err.status === 404 ? "No validation run has been recorded yet. Run scripts/runHindcastValidation.js on the server to generate one." : err.message))
      .finally(() => setLoading(false));
  }, []);

  const s = run?.summary;

  return (
    <Layout>
      <div className="validation-container">
        <div className="validation-header">
        <h1>Accuracy &amp; Validation</h1>
        <p>
          Hindcast validation: the trend model is fitted on all but the last {run?.holdoutYears ?? 2} years of
          each area's satellite record, predicts those held-out years, and is scored against what was actually observed.
          The system refits the trend as each new year of imagery arrives — projections are early-warning
          estimates under a continuing-trend assumption, not fixed forecasts.
        </p>
        </div>

        <AsyncSection loading={loading} error={error} empty={!loading && !error && !run}>
          {s && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12, margin: "20px 0" }}>
                {[
                  ["Status Accuracy", pct(s.statusAccuracyPct), `vs ${pct(s.baseline?.statusAccuracyPct)} no-change baseline`],
                  ["Risk Tier Accuracy", pct(s.riskTierAccuracyPct), `${pct(s.riskTierAdjacentPct)} within one tier`],
                  ["Position MAE", num(s.positionMaeMeters, " m"), `RMSE ${num(s.positionRmseMeters, " m")}`],
                  ["Areas Validated", num(s.areasEvaluated), `${num(s.areasSkipped)} skipped (<5 years of data)`],
                  ["Mean Model Fit (r²)", num(s.meanR2), "1.0 = perfect linear trend"],
                  ["Leave-One-Out MAE", num(s.leaveOneOutMaeMeters, " m"), "every year held out in turn"],
                ].map(([label, value, note]) => (
                  <div key={label} className="validation-stat">
                    <div style={{ fontSize: 13, color: "#555" }}>{label}</div>
                    <div className="validation-stat-value">{value}</div>
                    <div style={{ fontSize: 12, color: "#777" }}>{note}</div>
                  </div>
                ))}
              </div>

              {s.leadTimes && s.leadTimes.length > 0 && (
                <>
                  <h3 className="validation-section-title">Accuracy by Lead Time</h3>
                  <p style={{ color: "#555", marginTop: 0, fontSize: 13 }}>
                    How far ahead the model can still classify correctly — walk-forward evaluation
                    over every training window in the record.
                  </p>
                  <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr className="validation-thead-row">
                          {["Years ahead", "Status accuracy", "MAE (m)", "Samples"].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.leadTimes.map((lt) => (
                          <tr key={lt.leadYears} style={{ borderBottom: "1px solid #e0e0e0" }}>
                            <td style={{ padding: "8px 12px" }}>{lt.leadYears}</td>
                            <td style={{ padding: "8px 12px", fontWeight: 600 }}>{lt.statusAccuracyPct}%</td>
                            <td style={{ padding: "8px 12px" }}>{lt.maeMeters}</td>
                            <td style={{ padding: "8px 12px" }}>{lt.samples}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <p style={{ fontSize: 13, color: "#777" }}>
                Run #{run.runId} · {new Date(run.runAt).toLocaleString()} · scope: {run.scope}
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr className="validation-thead-row">
                      {["Municipality", "Area", "Predicted", "Observed", "Match", "r²", "LOO MAE (m)"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(run.details || []).map((a) => (
                      <tr key={a.areaId} style={{ borderBottom: "1px solid #e0e0e0" }}>
                        <td style={{ padding: "8px 10px" }}>{a.municipality}</td>
                        <td style={{ padding: "8px 10px" }}>{a.areaName}</td>
                        <td style={{ padding: "8px 10px" }}>{a.predictedStatus} ({a.predictedRate} m/yr)</td>
                        <td style={{ padding: "8px 10px" }}>{a.observedStatus} ({a.observedRate} m/yr)</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: a.statusMatch ? "#27ae60" : "#c0392b" }}>
                          {a.statusMatch ? "MATCH" : "MISS"}
                        </td>
                        <td style={{ padding: "8px 10px" }}>{a.r2}</td>
                        <td style={{ padding: "8px 10px" }}>{a.looMae ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </AsyncSection>
      </div>
    </Layout>
  );
}
