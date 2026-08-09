import AdminLayout from "../../components/AdminLayout";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/audit-trail.css";
import useGuidedTour from "../../hooks/useGuidedTour";
import TourInfoButton from "../../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../../tours/pageIds";
import { auditTrailSteps } from "../../tours/steps/auditTrailSteps";

import { API_BASE_URL } from "../../config/api";
const API_BASE = API_BASE_URL;
const PAGE_SIZE = 25;

const formatTimestamp = (isoString) => {
  if (!isoString) return { date: "—", time: "" };
  const d = new Date(isoString);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
};

const formatRole = (role) => {
  if (!role) return "—";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

// "role_changed" -> "Role Changed"
const formatAction = (action) => {
  if (!action) return "—";
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

// Used only when an action doesn't have a dedicated case below (or its
// expected details fields are missing), so nothing renders blank.
const rawFallbackDetail = (details) => {
  if (!details || typeof details !== "object") return "—";
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ") || "—";
};

const rawFallbackTarget = (log) => (log.target_type ? `${log.target_type} #${log.target_id}` : "—");

// Turns the raw details JSON + target_type/target_id into a plain-language
// "what was affected" / "what happened" pair, per action — the raw
// key:value dump this replaced was unreadable to a non-technical viewer.
const describeLog = (log) => {
  const d = log.details || {};
  switch (log.action) {
    case "role_changed":
      return {
        target: d.username || rawFallbackTarget(log),
        detail:
          d.from_role && d.to_role
            ? `${formatRole(d.from_role)} → ${formatRole(d.to_role)}`
            : rawFallbackDetail(d),
      };
    case "user_deactivated":
      return { target: d.username || rawFallbackTarget(log), detail: "Account deactivated" };
    case "user_reactivated":
      return { target: d.username || rawFallbackTarget(log), detail: "Account reactivated" };
    case "user_created":
      return {
        target: d.username || rawFallbackTarget(log),
        detail: d.role
          ? `${formatRole(d.role)} account created${d.email ? ` (${d.email})` : ""}`
          : rawFallbackDetail(d),
      };
    case "user_edited":
      return {
        target: d.new_username || d.old_username || rawFallbackTarget(log),
        detail:
          d.old_username && d.new_username && d.old_username !== d.new_username
            ? `Renamed to "${d.new_username}"`
            : "Username unchanged",
      };
    case "account_request_approved":
      return {
        target: d.username || rawFallbackTarget(log),
        detail: d.municipality ? `Approved — assigned to ${d.municipality}` : "Approved",
      };
    case "account_request_rejected":
      return {
        target: d.username || rawFallbackTarget(log),
        detail: d.reason ? `Rejected — ${d.reason}` : "Rejected (no reason given)",
      };
    case "upload_created":
      return {
        target: d.municipality
          ? `${d.municipality}${d.specific_area ? ` — ${d.specific_area}` : ""}`
          : rawFallbackTarget(log),
        detail: d.year ? `Year ${d.year}` : rawFallbackDetail(d),
      };
    case "upload_active_toggled":
      return {
        target: d.municipality
          ? `${d.municipality}${d.specific_area ? ` — ${d.specific_area}` : ""}`
          : d.filename || rawFallbackTarget(log),
        detail: `${d.year ? `Year ${d.year} — ` : ""}${d.active ? "Marked active" : "Marked inactive"}`,
      };
    case "upload_deleted":
      return {
        target: d.municipality
          ? `${d.municipality}${d.specific_area ? ` — ${d.specific_area}` : ""}`
          : d.filename || rawFallbackTarget(log),
        detail: [d.upload_type, d.year ? `Year ${d.year}` : null].filter(Boolean).join(", ") || rawFallbackDetail(d),
      };
    case "shoreline_zones_bulk_deleted":
      return {
        target: d.municipality || rawFallbackTarget(log),
        detail:
          d.deleted !== undefined ? `${d.deleted} zone record${d.deleted === 1 ? "" : "s"} removed` : rawFallbackDetail(d),
      };
    case "login_success":
      return { target: "-", detail: "Logged in successfully" };
    case "login_denied_deactivated":
      return { target: "-", detail: "Blocked — account is deactivated" };
    case "login_failed_unknown_email":
      return { target: log.actor_username || "Unknown", detail: "Login failed — no account with this email" };
    case "login_failed_wrong_password":
      return { target: "-", detail: "Login failed — incorrect password" };
    case "password_changed":
      return { target: "-", detail: "Password changed" };
    case "password_reset_requested":
      return { target: "-", detail: "Password reset requested" };
    case "password_reset_completed":
      return { target: "-", detail: "Password reset completed" };
    case "shoreline_year_data_saved":
      return {
        target: d.municipality || rawFallbackTarget(log),
        detail: [d.dbAction === "updated" ? "Updated" : "Added", d.year ? `Year ${d.year}` : null, d.specific_area]
          .filter(Boolean)
          .join(" — "),
      };
    case "sample_data_seeded":
      return {
        target: d.municipality || rawFallbackTarget(log),
        detail:
          d.startYear && d.endYear
            ? `Seeded ${d.recordCount ?? "?"} years (${d.startYear}-${d.endYear})`
            : rawFallbackDetail(d),
      };
    default:
      return { target: rawFallbackTarget(log), detail: rawFallbackDetail(d) };
  }
};

export default function AuditTrail() {
  const navigate = useNavigate();
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.AUDIT_TRAIL, auditTrailSteps);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stats, setStats] = useState({ total: 0, critical: 0, data: 0, user: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Audit Trail is superadmin only — everyone else is redirected.
  useEffect(() => {
    const userRole = localStorage.getItem("roles");
    if (userRole !== "superadmin") {
      navigate("/coastalmonitoring", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_BASE}/api/admin/audit-logs/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) setStats(data);
      } catch (err) {
        console.error("Error fetching audit log stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (category) params.set("category", category);
      if (severity) params.set("severity", severity);
      if (search.trim()) params.set("search", search.trim());

      const response = await fetch(`${API_BASE}/api/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load audit logs");

      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [category, severity, search, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch("");
    setCategory("");
    setSeverity("");
    setPage(1);
  };

  return (
    <AdminLayout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="audit-trail-container">
        <div className="audit-trail-header">
          <div>
            <h1>Audit Trail</h1>
            <p>A record of every admin action taken across the system.</p>
          </div>
        </div>

        {error && <div className="user-management-error">{error}</div>}

        {/* Summary cards */}
        <div className="at-stats">
          <div className="at-stat-card">
            <div className="at-stat-icon-badge blue"><span className="at-stat-icon" /></div>
            <div className="at-stat-text">
              <div className="at-stat-label">Total Activities</div>
              <div className="at-stat-value">{statsLoading ? "..." : stats.total}</div>
              <div className="at-stat-info">All time logged</div>
            </div>
          </div>
          <div className="at-stat-card">
            <div className="at-stat-icon-badge red"><span className="at-stat-icon" /></div>
            <div className="at-stat-text">
              <div className="at-stat-label">Critical Actions</div>
              <div className="at-stat-value">{statsLoading ? "..." : stats.critical}</div>
              <div className="at-stat-info">Deletions, deactivations, role escalations</div>
            </div>
          </div>
          <div className="at-stat-card">
            <div className="at-stat-icon-badge orange"><span className="at-stat-icon" /></div>
            <div className="at-stat-text">
              <div className="at-stat-label">Data Activities</div>
              <div className="at-stat-value">{statsLoading ? "..." : stats.data}</div>
              <div className="at-stat-info">Uploads and dataset changes</div>
            </div>
          </div>
          <div className="at-stat-card">
            <div className="at-stat-icon-badge purple"><span className="at-stat-icon" /></div>
            <div className="at-stat-text">
              <div className="at-stat-label">User Activities</div>
              <div className="at-stat-value">{statsLoading ? "..." : stats.user}</div>
              <div className="at-stat-info">Account and role changes</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="at-filter-bar">
          <div className="at-search-box">
            <img src="/search-bar.png" alt="" className="at-search-icon" onError={(e) => (e.target.style.display = "none")} />
            <input
              type="text"
              placeholder="Search by actor, action, or target..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
            />
          </div>

          <select
            className="at-filter-select"
            value={category}
            onChange={(e) => handleFilterChange(setCategory, e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            <option value="user">User</option>
            <option value="data">Data</option>
            <option value="auth">Auth</option>
          </select>

          <select
            className="at-filter-select"
            value={severity}
            onChange={(e) => handleFilterChange(setSeverity, e.target.value)}
            aria-label="Filter by severity"
          >
            <option value="">All Severities</option>
            <option value="normal">Normal</option>
            <option value="critical">Critical</option>
          </select>

          <button className="at-reset-btn" onClick={handleResetFilters}>
            <img src="/resetFilter.png" alt="" className="at-reset-icon" />
            Reset Filters
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p className="user-management-loading">Loading audit logs...</p>
        ) : (
          <div className="at-table-container">
            <table className="at-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr className="at-empty-row">
                    <td colSpan={6}>
                      {total === 0 && !category && !severity && !search
                        ? "No admin actions have been logged yet."
                        : "No log entries match the selected filters."}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const ts = formatTimestamp(log.created_at);
                    const { target, detail } = describeLog(log);
                    return (
                      <tr key={log.id} className="at-row">
                        <td>
                          <div>{ts.date}</div>
                          <div className="at-time">{ts.time}</div>
                        </td>
                        <td>
                          <div className="at-actor">{log.actor_username}</div>
                          <div className="at-actor-sub">{formatRole(log.actor_role)}</div>
                        </td>
                        <td>{formatAction(log.action)}</td>
                        <td>{target}</td>
                        <td className="at-details">{detail}</td>
                        <td>
                          <span className={`at-severity-badge ${log.severity}`}>
                            {log.severity === "critical" ? "Critical" : "Normal"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {total > 0 && (
              <div className="at-pagination">
                <span className="at-pagination-info">
                  Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(page * PAGE_SIZE, total)} of {total} entries
                </span>
                <div className="at-pagination-controls">
                  <button
                    className="at-page-btn"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      className={`at-page-btn ${n === page ? "active" : ""}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    className="at-page-btn"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
