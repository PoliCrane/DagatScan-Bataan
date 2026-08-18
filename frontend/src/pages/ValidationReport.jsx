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
    api("/api/shoreline/validation/latest")
      .then(setRun)
      .catch((err) => setError(err.status === 404 ? "No validation run has been recorded yet. Run scripts/runHindcastValidation.js on the server to generate one." : err.message))
      .finally(() => setLoading(false));
  }, []);

  const s = run?.summary;

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "90px auto 40px", padding: "0 20px", fontFamily: "inherit" }}>
        <h1 style={{ color: "#0077B6", marginBottom: 4 }}>Accuracy &amp; Validation</h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Hindcast validation: the trend model is fitted on all but the last {run?.holdoutYears ?? 2} years of
          each area's satellite record, predicts those held-out years, and is scored against what was actually observed.
        </p>

        <AsyncSection loading={loading} error={error} empty={!loading && !error && !run}>
          {s && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, margin: "20px 0" }}>
                {[
                  ["Status Accuracy", pct(s.statusAccuracyPct), `vs ${pct(s.baseline?.statusAccuracyPct)} no-change baseline`],
                  ["Risk Tier Accuracy", pct(s.riskTierAccuracyPct), `${pct(s.riskTierAdjacentPct)} within one tier`],
                  ["Position MAE", num(s.positionMaeMeters, " m"), `RMSE ${num(s.positionRmseMeters, " m")}`],
                  ["Areas Validated", num(s.areasEvaluated), `${num(s.areasSkipped)} skipped (<5 years of data)`],
                  ["Mean Model Fit (r²)", num(s.meanR2), "1.0 = perfect linear trend"],
                  ["Leave-One-Out MAE", num(s.leaveOneOutMaeMeters, " m"), "every year held out in turn"],
                ].map(([label, value, note]) => (
                  <div key={label} style={{ background: "#eaf4f8", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 13, color: "#555" }}>{label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#0077B6" }}>{value}</div>
                    <div style={{ fontSize: 12, color: "#777" }}>{note}</div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 13, color: "#777" }}>
                Run #{run.runId} · {new Date(run.runAt).toLocaleString()} · scope: {run.scope}
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "#0077B6", color: "white", textAlign: "left" }}>
                      {["Municipality", "Area", "Predicted", "Observed", "Match", "r²", "LOO MAE (m)"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px" }}>{h}</th>
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
