import AdminLayout from "../../components/AdminLayout";
import StatusToggle from "../../components/StatusToggle";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../index-organized.css";
import "../styles/data-management.css";
import { showSuccess, showError, confirmAction, showLoading } from "../../utils/sweetAlertUtils";

import { API_BASE_URL } from "../../config/api";
const API_BASE = API_BASE_URL;
const PAGE_SIZE = 8;

const formatUploadDate = (isoString) => {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
};

const formatRole = (role) => {
  if (!role) return "—";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

/**
 * Backend writes a grayscale PNG preview for the GeoTIFF upload; URL is
 * derived from file_name (not stored), so pre-existing rows have no preview.
 */
const thumbnailUrl = (fileName) => {
  if (!fileName) return null;
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${API_BASE}/uploads/satellite-images/thumbnails/${encodeURIComponent(base)}.png`;
};

export default function DataManagement() {
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  // Thumbnail URLs that 404'd (legacy rows with missing source files),
  // tracked via <img> onError so the View button can be disabled for them.
  const [brokenThumbs, setBrokenThumbs] = useState(() => new Set());
  // Separate from busyId since this is a plain read with no confirm dialog.
  const [loadingImageryId, setLoadingImageryId] = useState(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ municipality: "", year: "", status: "" });
  const [page, setPage] = useState(1);

  const isSuperadmin = localStorage.getItem("roles") === "superadmin";

  // Data Management is admin/superadmin only — everyone else is redirected.
  useEffect(() => {
    const userRole = localStorage.getItem("roles");
    if (userRole !== "admin" && userRole !== "superadmin") {
      navigate("/coastalmonitoring", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      // Fetched whole (not paginated) so search/filters apply across all data.
      const response = await fetch(`${API_BASE}/api/admin/uploads?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load datasets");
      setDatasets(Array.isArray(data.uploads) ? data.uploads : []);
    } catch (err) {
      console.error("Error fetching datasets:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const municipalities = useMemo(
    () => [...new Set(datasets.map((d) => d.municipality).filter(Boolean))].sort(),
    [datasets]
  );

  const years = useMemo(
    () => [...new Set(datasets.map((d) => d.year).filter(Boolean))].sort((a, b) => b - a),
    [datasets]
  );

  const filtered = useMemo(() => {
    let list = datasets;

    if (filters.municipality) {
      list = list.filter((d) => d.municipality === filters.municipality);
    }
    if (filters.year) {
      list = list.filter((d) => String(d.year) === filters.year);
    }
    if (filters.status) {
      const wantActive = filters.status === "active";
      list = list.filter((d) => d.active === wantActive);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          (d.file_name || "").toLowerCase().includes(q) ||
          (d.municipality || "").toLowerCase().includes(q) ||
          (d.uploaded_by || "").toLowerCase().includes(q) ||
          String(d.year || "").includes(q)
      );
    }

    return list;
  }, [datasets, filters, search]);

  // Stat cards describe the whole library, not the filtered view — otherwise
  // the totals would shift every time someone typed in the search box.
  const stats = useMemo(() => {
    const active = datasets.filter((d) => d.active).length;
    const uploaders = new Set(datasets.map((d) => d.uploaded_by).filter(Boolean));
    return {
      total: datasets.length,
      active,
      inactive: datasets.length - active,
      uploaders: uploaders.size,
    };
  }, [datasets]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters({ municipality: "", year: "", status: "" });
    setSearch("");
    setPage(1);
  };

  // First fetch per area/year is a live multi-second Earth Engine query;
  // loading state is scoped to this row's button so the table stays usable.
  const handleViewSatelliteImagery = async (dataset) => {
    setLoadingImageryId(dataset.id);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE}/api/admin/uploads/${dataset.id}/satellite-imagery`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch satellite imagery");

      window.open(`${API_BASE}${data.url}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      await showError(err.message);
      console.error("Error fetching satellite imagery:", err);
    } finally {
      setLoadingImageryId(null);
    }
  };

  const handleToggleActive = async (dataset) => {
    const turningOff = dataset.active;
    const confirmed = await confirmAction(
      turningOff
        ? `Deactivate <strong>${dataset.municipality} ${dataset.year}</strong>?<br/><small>Its shoreline data will be excluded from all erosion calculations, and the affected area's figures will be recalculated.</small>`
        : `Reactivate <strong>${dataset.municipality} ${dataset.year}</strong>?<br/><small>Its shoreline data will be included in erosion calculations again.</small>`
    );
    if (!confirmed) return;

    setBusyId(dataset.id);
    await showLoading(turningOff ? "Deactivating dataset..." : "Reactivating dataset...", 1200);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/admin/uploads/${dataset.id}/active`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !dataset.active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update dataset");

      await showSuccess(data.message);
      await fetchDatasets();
    } catch (err) {
      await showError(err.message);
      console.error("Error toggling dataset:", err);
    } finally {
      setBusyId(null);
    }
  };

  // Only offered for superseded uploads with no live data left; just clears
  // the orphaned audit row and its file.
  const handleDelete = async (dataset) => {
    const confirmed = await confirmAction(
      `Delete <strong>${dataset.municipality} ${dataset.year}</strong>?<br/><small>This upload was superseded and has no live data left — only its audit record and file will be removed. This can't be undone.</small>`
    );
    if (!confirmed) return;

    setBusyId(dataset.id);
    await showLoading("Deleting upload...", 1200);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/admin/uploads/${dataset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete upload");

      await showSuccess(data.message);
      await fetchDatasets();
    } catch (err) {
      await showError(err.message);
      console.error("Error deleting upload:", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="data-management-container">
        <div className="data-management-header">
          <div>
            <h1>Data Management</h1>
            <p>View and manage all uploaded historical coastal datasets.</p>
          </div>
        </div>

        {error && <div className="user-management-error">{error}</div>}

        {/* Summary cards */}
        <div className="dm-stats">
          <div className="dm-stat-card">
            <div className="dm-stat-icon-badge blue"><span className="dm-stat-icon" /></div>
            <div className="dm-stat-text">
              <div className="dm-stat-label">Total Datasets</div>
              <div className="dm-stat-value">{loading ? "..." : stats.total}</div>
              <div className="dm-stat-info">All time uploaded</div>
            </div>
          </div>
          <div className="dm-stat-card">
            <div className="dm-stat-icon-badge green"><span className="dm-stat-icon" /></div>
            <div className="dm-stat-text">
              <div className="dm-stat-label">Active Datasets</div>
              <div className="dm-stat-value">{loading ? "..." : stats.active}</div>
              <div className="dm-stat-info">Counted in analysis</div>
            </div>
          </div>
          <div className="dm-stat-card">
            <div className="dm-stat-icon-badge orange"><span className="dm-stat-icon" /></div>
            <div className="dm-stat-text">
              <div className="dm-stat-label">Inactive Datasets</div>
              <div className="dm-stat-value">{loading ? "..." : stats.inactive}</div>
              <div className="dm-stat-info">Excluded from analysis</div>
            </div>
          </div>
          <div className="dm-stat-card">
            <div className="dm-stat-icon-badge purple"><span className="dm-stat-icon" /></div>
            <div className="dm-stat-text">
              <div className="dm-stat-label">Total Uploaded By</div>
              <div className="dm-stat-value">{loading ? "..." : stats.uploaders}</div>
              <div className="dm-stat-info">Registered users</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="dm-filter-bar">
          <div className="dm-search-box">
            <img src="/search-bar.png" alt="" className="dm-search-icon" onError={(e) => (e.target.style.display = "none")} />
            <input
              type="text"
              placeholder="Search dataset..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="dm-select-wrapper">
            <img src="/allMunicipalities.png" alt="" className="dm-select-icon" />
            <select
              className="dm-filter-select"
              value={filters.municipality}
              onChange={(e) => handleFilterChange("municipality", e.target.value)}
              aria-label="Filter by municipality"
            >
              <option value="">All Municipalities</option>
              {municipalities.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="dm-select-wrapper">
            <img src="/allyears.png" alt="" className="dm-select-icon" />
            <select
              className="dm-filter-select"
              value={filters.year}
              onChange={(e) => handleFilterChange("year", e.target.value)}
              aria-label="Filter by year"
            >
              <option value="">All Years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>

          <div className="dm-select-wrapper">
            <img src="/allStatus.png" alt="" className="dm-select-icon" />
            <select
              className="dm-filter-select"
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <button className="dm-reset-btn" onClick={handleResetFilters}>
            <img src="/resetFilter.png" alt="" className="dm-reset-icon" />
            Reset Filters
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p className="user-management-loading">Loading datasets...</p>
        ) : (
          <div className="dm-table-container">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Satellite Image</th>
                  <th>Municipality</th>
                  <th>Year</th>
                  <th>Uploaded By</th>
                  <th>Upload Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr className="dm-empty-row">
                    <td colSpan={7}>
                      {datasets.length === 0
                        ? "No datasets have been uploaded yet."
                        : "No datasets match the selected filters."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((d) => {
                    const uploaded = formatUploadDate(d.created_at);
                    const thumb = thumbnailUrl(d.file_name);
                    return (
                      <tr key={d.id} className={`dm-row ${!d.active ? "inactive" : ""}`}>
                        <td>
                          {thumb && !brokenThumbs.has(thumb) ? (
                            <img
                              src={thumb}
                              alt=""
                              className="dm-thumb"
                              onError={(e) => {
                                e.target.style.display = "none";
                                if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                                setBrokenThumbs((prev) => new Set(prev).add(thumb));
                              }}
                            />
                          ) : null}
                          <span
                            className="dm-thumb-fallback"
                            style={{ display: thumb && !brokenThumbs.has(thumb) ? "none" : "flex" }}
                          >
                            No preview
                          </span>
                        </td>
                        <td>{d.municipality}</td>
                        <td>{d.year}</td>
                        <td>
                          <div className="dm-uploader">{d.uploaded_by || "—"}</div>
                          <div className="dm-uploader-sub">{formatRole(d.uploaded_by_role)}</div>
                        </td>
                        <td>
                          <div>{uploaded.date}</div>
                          <div className="dm-time">{uploaded.time}</div>
                        </td>
                        <td>
                          <span className={`dm-status-badge ${d.active ? "active" : "inactive"}`}>
                            {d.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="action-icons">
                            <button
                              type="button"
                              className="dm-view-btn"
                              onClick={() => window.open(thumb, "_blank", "noopener,noreferrer")}
                              disabled={!thumb || brokenThumbs.has(thumb)}
                              title="View NDWI preview"
                            >
                              <img src="/view.png" alt="" className="dm-view-icon" />
                              View
                            </button>
                            <button
                              type="button"
                              className="dm-satellite-btn"
                              onClick={() => handleViewSatelliteImagery(d)}
                              disabled={!d.has_bounds || loadingImageryId !== null}
                              title={
                                d.has_bounds
                                  ? "Fetch a true-color satellite photo for this area/year (first view queries Earth Engine live, may take a few seconds)"
                                  : "No location data available for this dataset — satellite imagery can't be fetched"
                              }
                            >
                              {loadingImageryId === d.id ? "Loading..." : "Satellite Imagery"}
                            </button>
                            {isSuperadmin && (
                              d.can_deactivate ? (
                                <StatusToggle
                                  active={d.active}
                                  onToggle={() => handleToggleActive(d)}
                                  disabled={busyId !== null}
                                  deactivateLabel="Deactivate dataset"
                                  activateLabel="Reactivate dataset"
                                />
                              ) : d.upload_type === "Satellite_Image" && !d.area_id ? (
                                <button
                                  type="button"
                                  className="dm-delete-btn"
                                  onClick={() => handleDelete(d)}
                                  disabled={busyId !== null}
                                  title="Superseded upload — no live data remains. Delete its audit record and file."
                                >
                                  <img src="/bin.png" alt="Delete" className="dm-delete-icon" />
                                </button>
                              ) : (
                                <span
                                  className="dm-toggle-disabled"
                                  title="This upload was superseded by a later upload for the same area and year, so it no longer contributes to any analysis."
                                >
                                  —
                                </span>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="dm-pagination">
                <span className="dm-pagination-info">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} entries
                </span>
                <div className="dm-pagination-controls">
                  <button
                    className="dm-page-btn"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      className={`dm-page-btn ${n === currentPage ? "active" : ""}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    className="dm-page-btn"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
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
