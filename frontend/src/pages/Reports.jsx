import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { useState, useEffect, useMemo, useRef } from "react";
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

  // Raw segment data fetched from API
  const [allSegments, setAllSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected record for PDF preview (null = show Bataan map instead)
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Off-screen iframe used purely to trigger the browser print dialog on a
  // PDF without navigating away — window.open + printWindow.print() doesn't
  // reliably fire for a cross-origin PDF response (frontend on :5173, PDF
  // served from the backend on :5000), it just leaves the PDF sitting open
  // in its own tab with no print dialog.
  const printFrameRef = useRef(null);

  // Bataan province boundary for the map panel
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

  // Fetch all segment data once on component mount
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
      pdfUrl: `${API_BASE}/api/reports/${seg.id ?? idx}/pdf`,
    }));
  }, [allSegments]);

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

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectRecord = (record) => {
    setSelectedRecord(record);
  };

  const handleViewPdf = (record, e) => {
    e.stopPropagation();
    window.open(record.pdfUrl, "_blank", "noopener,noreferrer");
  };

  const handlePrintPdf = (record, e) => {
    e.stopPropagation();
    const frame = printFrameRef.current;
    if (!frame) return;

    const triggerPrint = () => {
      frame.removeEventListener("load", triggerPrint);
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
    frame.addEventListener("load", triggerPrint);
    frame.src = record.pdfUrl;
  };

  const handleClosePreview = () => setSelectedRecord(null);

  return (
    <Layout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="reports-container">
        {/* Off-screen — exists purely so handlePrintPdf has a same-page
            frame to load the PDF into and call print() on. */}
        <iframe ref={printFrameRef} title="print-frame" className="print-frame" />

        <div className="reports-header">
          <h1>Coastal Erosion Assessment Report</h1>
          <p>Browse and preview generated erosion assessment reports across Bataan municipalities</p>
        </div>

        {/* Filter Section */}
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

          <IconField iconPosition="left" className="reports-search-box">
            <InputIcon className="pi pi-search" />
            <InputText
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search reports"
            />
          </IconField>
        </div>

        {/* Body: Map/Preview + Records table */}
        <div className="reports-body">
          <div className="reports-preview-panel">
            {selectedRecord ? (
              <>
                <div className="reports-preview-header">
                  <div className="reports-preview-title">
                    <strong>{selectedRecord.title}</strong>
                    <span>{selectedRecord.specificArea} · {selectedRecord.year}</span>
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
                  key={selectedRecord.id}
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
                          className={selectedRecord?.id === record.id ? "selected-row" : ""}
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
