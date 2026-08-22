import AdminLayout from "../../components/AdminLayout";
import StatusToggle from "../../components/StatusToggle";
import { useState, useEffect, useMemo } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import "../index-organized.css";
import "../styles/data-management.css";
import { showSuccess, showError, confirmAction, showLoading } from "../../utils/sweetAlertUtils";
import useGuidedTour from "../../hooks/useGuidedTour";
import TourInfoButton from "../../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../../tours/pageIds";
import { dataManagementSteps } from "../../tours/steps/dataManagementSteps";

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

// thumbnail_url is either a durable, already-absolute Supabase Storage URL,
// or (fallback, local dev / not-yet-synced) a root-relative local path that
// needs the backend's own origin prefixed.
const resolveThumbUrl = (thumbnailUrl) => {
  if (!thumbnailUrl) return null;
  return thumbnailUrl.startsWith("http") ? thumbnailUrl : `${API_BASE}${thumbnailUrl}`;
};

export default function DataManagement() {
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.DATA_MANAGEMENT, dataManagementSteps);

  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  // Thumbnail URLs that 404'd (legacy rows with missing source files),
  // tracked via <img> onError so the View button can be disabled for them.
  const [brokenThumbs, setBrokenThumbs] = useState(() => new Set());
  // Separate from busyId since this is a plain read with no confirm dialog.
  const [loadingImageryId, setLoadingImageryId] = useState(null);
  const [reuploadingId, setReuploadingId] = useState(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ municipality: "", year: "", status: "" });
  const [page, setPage] = useState(1);

  const isSuperadmin = localStorage.getItem("roles") === "superadmin";

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
  // Backend now times out its own Earth Engine init after 25s — this is
  // defense-in-depth so the button never hangs forever even if something
  // else in the chain gets stuck.
  const handleViewSatelliteImagery = async (dataset) => {
    setLoadingImageryId(dataset.id);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE}/api/admin/uploads/${dataset.id}/satellite-imagery`,
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch satellite imagery");

      window.open(`${API_BASE}${data.url}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      await showError(err.name === "AbortError" ? "Request timed out — please try again." : err.message);
      console.error("Error fetching satellite imagery:", err);
    } finally {
      clearTimeout(timeoutId);
      setLoadingImageryId(null);
    }
  };

  // Re-runs NDWI generation for this exact area/year using its stored bounds
  // (satellite_imagery.bounds, joined in by GET /api/admin/uploads) — no need
  // to retype coordinates. Safe to repeat: satellite_imagery upserts on
  // (area_id, year) and shoreline_zones replaces rather than duplicates.
  const handleReupload = async (dataset) => {
    if (!dataset.bounds) return;

    const confirmed = await confirmAction(
      `Reupload <strong>${dataset.municipality} ${dataset.year}</strong>?<br/><small>This regenerates NDWI imagery for this area/year from Earth Engine and replaces the existing analysis. This can take a little while.</small>`
    );
    if (!confirmed) return;

    setReuploadingId(dataset.id);
    try {
      const token = localStorage.getItem("token");
      const b = dataset.bounds;
      const response = await fetch(`${API_BASE}/api/generate-ndwi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lonMin: b.west,
          latMin: b.south,
          lonMax: b.east,
          latMax: b.north,
          year: dataset.year,
          coastlineName: dataset.coastal_area,
          municipality: dataset.municipality,
          specificArea: dataset.coastal_area,
          isReupload: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "Reupload failed");
      }

      await showSuccess(data.message || "Reupload complete.");
      await fetchDatasets();
    } catch (err) {
      await showError(err.message);
      console.error("Error reuploading dataset:", err);
    } finally {
      setReuploadingId(null);
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
      {Tour}
      <TourInfoButton onClick={replay} />
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
            <DataTable
              value={filtered}
              dataKey="id"
              className="dm-table"
              stripedRows
              removableSort
              paginator
              rows={PAGE_SIZE}
              first={(currentPage - 1) * PAGE_SIZE}
              onPage={(e) => setPage(e.page + 1)}
              paginatorClassName="dm-pagination"
              currentPageReportTemplate="Showing {first} to {last} of {totalRecords} entries"
              paginatorTemplate="CurrentPageReport FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
              emptyMessage={
                datasets.length === 0
                  ? "No datasets have been uploaded yet."
                  : "No datasets match the selected filters."
              }
              rowClassName={(d) => `dm-row ${!d.active ? "inactive" : ""}`}
              size="small"
            >
              <Column
                header="Satellite Image"
                style={{ width: "9rem" }}
                body={(d) => {
                  const thumb = resolveThumbUrl(d.thumbnail_url);
                  return thumb && !brokenThumbs.has(thumb) ? (
                    <img
                      src={thumb}
                      alt=""
                      className="dm-thumb"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        setBrokenThumbs((prev) => new Set(prev).add(thumb));
                      }}
                    />
                  ) : (
                    <span className="dm-thumb-fallback">No preview</span>
                  );
                }}
              />
              <Column field="municipality" header="Municipality" sortable />
              <Column field="year" header="Year" sortable />
              <Column
                field="uploaded_by"
                header="Uploaded By"
                sortable
                body={(d) => (
                  <>
                    <div className="dm-uploader">{d.uploaded_by || "\u2014"}</div>
                    <div className="dm-uploader-sub">{formatRole(d.uploaded_by_role)}</div>
                  </>
                )}
              />
              <Column
                field="created_at"
                header="Upload Date"
                sortable
                body={(d) => {
                  const uploaded = formatUploadDate(d.created_at);
                  return (
                    <>
                      <div>{uploaded.date}</div>
                      <div className="dm-time">{uploaded.time}</div>
                    </>
                  );
                }}
              />
              <Column
                field="active"
                header="Status"
                sortable
                body={(d) => (
                  <Tag severity={d.active ? "success" : "secondary"} value={d.active ? "Active" : "Inactive"} />
                )}
              />
              <Column
                field="confidence"
                header="Confidence"
                sortable
                body={(d) =>
                  d.confidence != null ? (
                    <Tag
                      severity={parseFloat(d.confidence) < 0.5 ? "warning" : "info"}
                      value={`${Math.round(parseFloat(d.confidence) * 100)}%`}
                    />
                  ) : (
                    <span className="dm-confidence-badge">—</span>
                  )
                }
              />
              <Column
                header="Actions"
                style={{ minWidth: "16rem" }}
                body={(d) => {
                  const thumb = resolveThumbUrl(d.thumbnail_url);
                  return (
                    <div className="action-icons flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        label="View"
                        icon="pi pi-eye"
                        size="small"
                        outlined
                        className="dm-view-btn"
                        onClick={() => window.open(thumb, "_blank", "noopener,noreferrer")}
                        disabled={!thumb || brokenThumbs.has(thumb)}
                        tooltip="View NDWI preview"
                        tooltipOptions={{ position: "top" }}
                      />
                      <Button
                        type="button"
                        label={loadingImageryId === d.id ? "Loading..." : "Satellite"}
                        icon="pi pi-globe"
                        size="small"
                        outlined
                        severity="secondary"
                        className="dm-satellite-btn"
                        onClick={() => handleViewSatelliteImagery(d)}
                        disabled={!d.has_bounds || loadingImageryId !== null}
                        tooltip={
                          d.has_bounds
                            ? "Fetch a true-color satellite photo for this area/year"
                            : "No location data available for this dataset"
                        }
                        tooltipOptions={{ position: "top" }}
                      />
                      {d.upload_type === "Satellite_Image" && (
                        <Button
                          type="button"
                          label={reuploadingId === d.id ? "Reuploading..." : "Reupload"}
                          icon="pi pi-refresh"
                          size="small"
                          outlined
                          severity="secondary"
                          className="dm-reupload-btn"
                          onClick={() => handleReupload(d)}
                          disabled={!d.bounds || reuploadingId !== null}
                          tooltip={
                            d.bounds
                              ? "Regenerate NDWI imagery for this area/year"
                              : "No stored bounds for this dataset"
                          }
                          tooltipOptions={{ position: "top" }}
                        />
                      )}
                      {isSuperadmin &&
                        (d.can_deactivate ? (
                          <StatusToggle
                            active={d.active}
                            onToggle={() => handleToggleActive(d)}
                            disabled={busyId !== null}
                            deactivateLabel="Deactivate dataset"
                            activateLabel="Reactivate dataset"
                          />
                        ) : d.upload_type === "Satellite_Image" && !d.area_id ? (
                          <Button
                            type="button"
                            icon="pi pi-trash"
                            rounded
                            text
                            severity="danger"
                            className="dm-delete-btn"
                            onClick={() => handleDelete(d)}
                            disabled={busyId !== null}
                            tooltip="Superseded upload \u2014 delete its audit record and file."
                            tooltipOptions={{ position: "top" }}
                            aria-label="Delete dataset"
                          />
                        ) : (
                          <span
                            className="dm-toggle-disabled"
                            title="This upload was superseded by a later upload for the same area and year."
                          >
                            —
                          </span>
                        ))}
                    </div>
                  );
                }}
              />
            </DataTable>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
