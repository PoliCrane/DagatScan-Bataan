import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Layout from "../components/Layout";
import "./styles/reports.css";
import useGuidedTour from "../hooks/useGuidedTour";
import TourInfoButton from "../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../tours/pageIds";
import { reportsSteps } from "../tours/steps/reportsSteps";

import { API_BASE_URL } from "../config/api";
const API_BASE = API_BASE_URL;

export default function Reports() {
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.REPORTS, reportsSteps);
  const [filters, setFilters] = useState({ year: "", municipality: "" });
  const [search, setSearch] = useState("");
  // Which shoreline each report measures against; the backend resolves the actual year.
  const [comparisonMode, setComparisonMode] = useState("oldest");
  const [comparisonInfo, setComparisonInfo] = useState(null);

  const [allSegments, setAllSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected record for PDF preview (null = show Bataan map instead). Held as an id and
  // derived from `records`, so switching comparison mode re-points the preview at the new
  // URL instead of leaving a snapshot with the old mode baked in.
  const [selectedRecordId, setSelectedRecordId] = useState(null);

  const [geoJsonData, setGeoJsonData] = useState(null);
  const [bataanBounds, setBataanBounds] = useState(null);

  const bataanMunicipalities = [
    "Abucay",
    "Bagac",
    "Balanga",
    "Dinalupihan",
    "Hermosa",
    "Limay",
    "Mariveles",
    "Morong",
    "Orani",
    "Orion",
    "Pilar",
    "Samal",
  ];

  useEffect(() => {
    const loadGeoJson = async () => {
      try {
        const response = await fetch("/data/BATAAN.geojson");
        const data = await response.json();
        setGeoJsonData(data);
        const bounds = L.geoJSON(data).getBounds();
        setBataanBounds(bounds);
      } catch (err) {
        console.error("Error loading Bataan boundary:", err);
      }
    };
    loadGeoJson();
  }, []);

  useEffect(() => {
    const fetchAllSegments = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/shoreline/bataan/all-zones`);

        if (!response.ok) {
          throw new Error("Failed to fetch segments");
        }

        const data = await response.json();
        const zones = data.zones || [];

        console.log(`✓ Fetched ${zones.length} segments for Reports`);
        setAllSegments(zones);
        setError(null);
      } catch (err) {
        console.error("Error fetching segments:", err);
        setError(err.message);
        setAllSegments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSegments();
  }, []);

  // Build report records from segments, matching the same non-baseline
  // filtering the Dashboard uses so both pages stay in sync.
  const records = useMemo(() => {
    const withData = allSegments.filter((seg) => {
      if (seg.erosionRate === null || seg.erosionRate === undefined) return false;
      return Math.abs(seg.erosionRate) > 0.005;
    });

    return withData.map((seg, idx) => ({
      id: seg.id ?? idx,
      title: `Coastal Erosion Assessment in the Municipality of ${seg.municipality}`,
      specificArea: seg.specificArea || seg.name || "Main Coastline",
      municipality: seg.municipality,
      year: seg.year,
      erosionRate: seg.erosionRate,
      riskLevel: seg.riskLevel || "UNKNOWN",
      pdfUrl: `${API_BASE}/api/reports/${seg.id ?? idx}/pdf?compare=${comparisonMode}`,
      printUrl: `${API_BASE}/api/reports/${seg.id ?? idx}/pdf/print?compare=${comparisonMode}`,
    }));
  }, [allSegments, comparisonMode]);

  const years = useMemo(() => {
    const uniqueYears = [...new Set(records.map((r) => r.year))].sort((a, b) => b - a);
    return uniqueYears.map((year) => year.toString());
  }, [records]);

  const filteredRecords = useMemo(() => {
    let filtered = records;

    if (filters.year) {
      filtered = filtered.filter((r) => r.year.toString() === filters.year);
    }
    if (filters.municipality) {
      filtered = filtered.filter((r) => r.municipality === filters.municipality);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.municipality.toLowerCase().includes(q) ||
          r.specificArea.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [records, filters, search]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) ?? null,
    [records, selectedRecordId]
  );

  // The note under the segment name has to describe the document actually rendered, so the
  // comparison year comes from the same backend resolver the PDF uses rather than being
  // recomputed here from the segment list.
  useEffect(() => {
    if (!selectedRecordId) {
      setComparisonInfo(null);
      return undefined;
    }
    let cancelled = false;
    setComparisonInfo(null);
    fetch(`${API_BASE}/api/reports/${selectedRecordId}/comparison?compare=${comparisonMode}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setComparisonInfo(data);
      })
      .catch(() => {
        if (!cancelled) setComparisonInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecordId, comparisonMode]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetFilters = () => {
    setFilters({ year: "", municipality: "" });
    setSearch("");
    setComparisonMode("oldest");
  };

  const handleSelectRecord = (record) => {
    setSelectedRecordId(record.id);
  };

  const handleViewPdf = (record, e) => {
    e.stopPropagation();
    window.open(record.pdfUrl, "_blank", "noopener,noreferrer");
  };

  const handlePrintPdf = (record, e) => {
    e.stopPropagation();
    // printUrl is a same-origin HTML wrapper that loads the PDF as a blob and calls
    // window.print() itself, so this opens the print dialog directly — see
    // GET /:zoneId/pdf/print in backend/routes/reports.js for why the wrapper is needed.
    window.open(record.printUrl, "_blank", "noopener,noreferrer");
  };

  const handleClosePreview = () => setSelectedRecordId(null);

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="reports-container">
        <div className="reports-header">
          <h1>Coastal Erosion Assessment Report</h1>
          <p>Browse and preview generated erosion assessment reports across Bataan municipalities</p>
        </div>

        <div className="reports-filter-bar">
          <div className="filter-group-inline">
            <label htmlFor="municipality-filter">Municipality:</label>
            <Dropdown
              inputId="municipality-filter"
              className="filter-dropdown"
              value={filters.municipality}
              onChange={(e) => handleFilterChange("municipality", e.value)}
              options={[{ label: "All", value: "" }, ...bataanMunicipalities.map((m) => ({ label: m, value: m }))]}
              placeholder="All"
            />
          </div>

          <div className="filter-group-inline">
            <label htmlFor="year-filter">Year:</label>
            <Dropdown
              inputId="year-filter"
              className="filter-dropdown"
              value={filters.year}
              onChange={(e) => handleFilterChange("year", e.value)}
              options={[{ label: "All", value: "" }, ...years.map((y) => ({ label: String(y), value: y }))]}
              placeholder="All"
            />
          </div>

          <div className="filter-group-inline">
            <label htmlFor="comparison-filter">Compared to:</label>
            <Dropdown
              inputId="comparison-filter"
              className="filter-dropdown"
              value={comparisonMode}
              onChange={(e) => setComparisonMode(e.value)}
              options={[
                { label: "Oldest shoreline", value: "oldest" },
                { label: "3-year interval", value: "interval3" },
              ]}
            />
          </div>

          <IconField iconPosition="left" className="reports-search-box">
            <InputIcon className="pi pi-search" />
            <InputText
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search reports"
            />
          </IconField>

          <button className="reports-reset-btn" onClick={handleResetFilters}>
            <img src="/resetFilter.png" alt="" className="reports-reset-icon" />
            Reset Filters
          </button>
        </div>

        <div className="reports-body">
          <div className="reports-preview-panel">
            {selectedRecord ? (
              <>
                <div className="reports-preview-header">
                  <div className="reports-preview-title">
                    <strong>{selectedRecord.title}</strong>
                    <span>{selectedRecord.specificArea} · {selectedRecord.year}</span>
                    {comparisonInfo?.description && (
                      <span
                        className={`reports-comparison-note${comparisonInfo.fellBack ? " is-fallback" : ""}`}
                      >
                        <i className="pi pi-info-circle" aria-hidden="true" />
                        {comparisonInfo.description}
                      </span>
                    )}
                  </div>
                  <div className="reports-preview-actions">
                    <button className="btn-view-pdf" onClick={(e) => handleViewPdf(selectedRecord, e)}>
                      Full View
                    </button>
                    <button className="btn-close-preview" onClick={handleClosePreview}>
                      ✕
                    </button>
                  </div>
                </div>
                <iframe
                  key={`${selectedRecord.id}-${comparisonMode}`}
                  src={selectedRecord.pdfUrl}
                  title={selectedRecord.title}
                  className="reports-pdf-frame"
                />
              </>
            ) : (
              <>
                <div className="reports-preview-header">
                  <div className="reports-preview-title">
                    <strong>Bataan Province</strong>
                    <span>Select a record to preview its report</span>
                  </div>
                </div>
                <div className="reports-map-frame">
                  {bataanBounds && (
                    <MapContainer
                      bounds={bataanBounds}
                      style={{ height: "100%", width: "100%" }}
                      zoomControl={false}
                      dragging={true}
                      doubleClickZoom={false}
                      scrollWheelZoom={false}
                      keyboard={false}
                    >
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution="Tiles &copy; Esri"
                      />
                      {geoJsonData && (
                        <GeoJSON
                          data={geoJsonData}
                          style={() => ({
                            color: "#0096FF",
                            weight: 2,
                            opacity: 0.6,
                            fillColor: "#F0FFFF",
                            fillOpacity: 0.15,
                          })}
                        />
                      )}
                    </MapContainer>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="reports-table-panel">
            {loading && (
              <div className="table-info">
                <p>Loading records...</p>
              </div>
            )}

            {error && (
              <div className="table-info error">
                <p>⚠️ {error}</p>
              </div>
            )}

            {!loading && !error && (
              <div className="table-wrapper">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Year</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length > 0 ? (
                      filteredRecords.map((record) => (
                        <tr
                          key={record.id}
                          className={selectedRecordId === record.id ? "selected-row" : ""}
                          onClick={() => handleSelectRecord(record)}
                        >
                          <td>
                            <div className="record-title">{record.title}</div>
                            <div className="record-subtitle">{record.specificArea}</div>
                          </td>
                          <td>{record.year}</td>
                          <td>
                            <div className="record-actions">
                              <button className="btn-view-pdf-link" onClick={(e) => handleViewPdf(record, e)}>
                                View PDF
                              </button>
                              <span className="action-divider">|</span>
                              <button
                                className="btn-print-report"
                                onClick={(e) => handlePrintPdf(record, e)}
                                title="Print report"
                              >
                                <img src="/printer.png" alt="Print" className="btn-print-icon" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="no-data-row">
                        <td colSpan="3">No records available for the selected filters</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
