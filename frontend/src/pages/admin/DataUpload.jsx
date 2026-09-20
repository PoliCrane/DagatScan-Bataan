import AdminLayout from "../../components/AdminLayout";
import { useState, useRef, useEffect, useMemo } from "react";
import { InputText } from "primereact/inputtext";
import { InputNumber } from "primereact/inputnumber";
import { Dropdown } from "primereact/dropdown";
import { Button } from "primereact/button";
import { ProgressBar } from "primereact/progressbar";
import "../styles/data-upload.css";
import { showSuccess, showSuccessHtml, showError, showErrorHtml } from "../../utils/sweetAlertUtils";
import useGuidedTour from "../../hooks/useGuidedTour";
import TourInfoButton from "../../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../../tours/pageIds";
import { buildDataUploadSteps } from "../../tours/steps/dataUploadSteps";
import { useNdwiGeneration } from "../../contexts/NdwiGenerationContext";
import { parseDMSOrDecimal, formatDeg } from "../../utils/coordinates";
import AoiPicker from "../../components/admin/AoiPicker";
import { normalizeBox, validateAoi, DEFAULT_AOI_METERS } from "../../utils/aoiGeometry";
import { isLandlocked } from "../../utils/coastalMunicipalities";

import { API_BASE_URL } from "../../config/api";
export default function DataUpload() {

  // Satellite upload hidden but not removed; flip to true to restore.
  const SHOW_SATELLITE_UPLOAD = false;
  // Map/pin picker hidden but not removed; flip to true to restore. Old manual-only
  // bounds entry is what's left underneath — it never depended on the picker.
  const SHOW_AOI_PICKER = false;

  const [uploadType, setUploadType] = useState("ndwi");
  const [datasetFile, setDatasetFile] = useState(null);
  const [satelliteFile, setSatelliteFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState([]);
  const dataUploadSteps = useMemo(() => buildDataUploadSteps(setUploadType), [setUploadType]);
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.DATA_UPLOAD, dataUploadSteps);
  // "uploading" caps at 90% byte progress; "processing" is indeterminate since the server has no byte signal.
  const [uploadPhase, setUploadPhase] = useState("idle");

  // NDWI Generator fields
  const [ndwiLonMin, setNdwiLonMin] = useState("");
  const [ndwiLatMin, setNdwiLatMin] = useState("");
  const [ndwiLonMax, setNdwiLonMax] = useState("");
  const [ndwiLatMax, setNdwiLatMax] = useState("");
  const [ndwiYear, setNdwiYear] = useState(new Date().getFullYear().toString());
  const [ndwiCoastlineName, setNdwiCoastlineName] = useState("");
  // Only pre-request validation errors; generation state lives in NdwiGenerationContext below.
  const [ndwiError, setNdwiError] = useState(null);

  // Map picker state. The four strings above stay the single source of truth for bounds —
  // these only describe how the picker should behave, never what the box is.
  const [aoiSizeMeters, setAoiSizeMeters] = useState(DEFAULT_AOI_METERS);
  const [aoiSnapDistance, setAoiSnapDistance] = useState(null);
  const [storedAreaBounds, setStoredAreaBounds] = useState(null);
  // Reported up by the picker, which is where the municipality's coastline gets resolved;
  // held here because the straddle check has to run even with the panel collapsed.
  const [aoiCoastlines, setAoiCoastlines] = useState([]);
  // Same reasoning — the picker already has the land polygons loaded for the balance check.
  const [aoiLandFraction, setAoiLandFraction] = useState(null);

  // Derived, not stored: a second copy of the bounds as numbers is what would create a
  // render loop between the map and the text fields.
  const ndwiBox = useMemo(() => {
    const lonMin = parseDMSOrDecimal(ndwiLonMin);
    const latMin = parseDMSOrDecimal(ndwiLatMin);
    const lonMax = parseDMSOrDecimal(ndwiLonMax);
    const latMax = parseDMSOrDecimal(ndwiLatMax);
    if ([lonMin, latMin, lonMax, latMax].some((v) => v === null || Number.isNaN(v))) return null;
    return { lonMin, latMin, lonMax, latMax };
  }, [ndwiLonMin, ndwiLatMin, ndwiLonMax, ndwiLatMax]);

  // The only writer from map to form. Normalising here is what guarantees the API never
  // sees inverted bounds, which Earth Engine rejects with an opaque error.
  const applyAoiBox = (box) => {
    const n = normalizeBox(box);
    setNdwiLonMin(formatDeg(n.lonMin));
    setNdwiLatMin(formatDeg(n.latMin));
    setNdwiLonMax(formatDeg(n.lonMax));
    setNdwiLatMax(formatDeg(n.latMax));
  };

  // Tracked app-wide so progress survives navigating away, and a second click can't start a duplicate request.
  const ndwiGeneration = useNdwiGeneration();

  // Location & Metadata Fields
  const [municipality, setMunicipality] = useState("Balanga");
  const [specificArea, setSpecificArea] = useState("");
  const [yearOfData, setYearOfData] = useState(new Date().getFullYear().toString());
  const [dataQuality, setDataQuality] = useState("Measured");

  // Georeference bounds for satellite image coastline detection (optional)
  const [boundsNorth, setBoundsNorth] = useState("");
  const [boundsSouth, setBoundsSouth] = useState("");
  const [boundsEast, setBoundsEast] = useState("");
  const [boundsWest, setBoundsWest] = useState("");

  const datasetInputRef = useRef(null);
  const satelliteInputRef = useRef(null);

  const municipalityNames = [
    "Balanga",
    "Bagac",
    "Dinalupihan",
    "Hermosa",
    "Limay",
    "Morong",
    "Orani",
    "Orion",
    "Pilar",
    "Samal",
    "Mariveles",
    "Abucay",
  ];
  // Landlocked municipalities still need to exist for their DENR office elsewhere in
  // the app, but there's no coastline to generate NDWI against — greyed out here
  // rather than removed, so it's clear why they're unavailable.
  const municipalities = municipalityNames.map((name) => ({
    label: isLandlocked(name) ? `${name} (no coastline)` : name,
    value: name,
    disabled: isLandlocked(name),
  }));

  const years = Array.from(
    { length: 20 },
    (_, i) => (2026 - i).toString()
  ).sort();

  // NDWI card has no location concept of its own, so this feeds the Coastline Name dropdown.
  const [ndwiMunicipality, setNdwiMunicipality] = useState("");
  // Open on arrival so new admins still meet it, collapsible so regulars can reclaim the space.
  const [coordinateHelpOpen, setCoordinateHelpOpen] = useState(true);

  const { errors: aoiErrors, warnings: aoiWarnings } = useMemo(
    () =>
      SHOW_AOI_PICKER
        ? validateAoi({
            box: ndwiBox,
            polylines: aoiCoastlines,
            snapDistanceMeters: aoiSnapDistance,
            storedBounds: storedAreaBounds,
            areaName: ndwiCoastlineName,
            isLandlockedMunicipality: isLandlocked(ndwiMunicipality),
            landFraction: aoiLandFraction,
          })
        : { errors: [], warnings: [] },
    [SHOW_AOI_PICKER, ndwiBox, aoiCoastlines, aoiSnapDistance, storedAreaBounds, ndwiCoastlineName, ndwiMunicipality, aoiLandFraction]
  );

  const extractGeoJSONProperties = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const geojson = JSON.parse(event.target.result);
        const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);
        if (features.length === 0) return;

        // Collect properties across all features; first non-null value wins per field.
        const props = {};
        for (const feature of features) {
          const p = feature.properties || {};
          for (const [k, v] of Object.entries(p)) {
            if (v !== null && v !== undefined && v !== "" && !(k.toLowerCase() in props)) {
              props[k.toLowerCase()] = v;
            }
          }
        }

        const muniKeys = ["municipality", "muni", "city", "town", "lgu"];
        for (const key of muniKeys) {
          const val = props[key];
          if (val) {
            const match = municipalities.find(
              (m) => m.value.toLowerCase() === String(val).trim().toLowerCase()
            );
            if (match) {
              setMunicipality(match.value);
              break;
            }
          }
        }

        const areaKeys = ["specific_area", "location", "area", "name", "zone", "barangay", "sitio", "place"];
        for (const key of areaKeys) {
          if (props[key]) {
            setSpecificArea(String(props[key]).trim());
            break;
          }
        }

        const yearKeys = ["year", "data_year", "datayear", "survey_year", "date_year"];
        for (const key of yearKeys) {
          const val = props[key];
          if (val) {
            const yr = parseInt(String(val).trim());
            if (!isNaN(yr) && yr >= 2007 && yr <= 2026) {
              setYearOfData(String(yr));
              break;
            }
          }
        }

      } catch {
        // Ignore parse errors here — invalid GeoJSON is caught on upload instead.
      }
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (e, setFile) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
      if (setFile === setDatasetFile) {
        extractGeoJSONProperties(files[0]);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = "#d0e8f2";
    e.currentTarget.style.borderColor = "#0055a4";
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = "#eaf4f8";
    e.currentTarget.style.borderColor = "#0077B6";
  };

  const handleDrop = (e, setFile) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = "#eaf4f8";
    e.currentTarget.style.borderColor = "#0077B6";

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setFile(files[0]);
      if (setFile === setDatasetFile) {
        extractGeoJSONProperties(files[0]);
      }
    }
  };

  const validateForm = () => {
    const errors = [];

    if (!municipality) errors.push("Municipality is required");
    if (!specificArea) errors.push("Specific area is required");
    if (!yearOfData) errors.push("Year of data is required");
    if (!datasetFile && !satelliteFile) errors.push("At least one file is required");

    return { valid: errors.length === 0, errors };
  };

  // Shared validation/parsing for both single-year and "all years" NDWI generation.
  const validateAndParseNdwiInputs = () => {
    if (!ndwiLonMin || !ndwiLatMin || !ndwiLonMax || !ndwiLatMax) {
      return { error: "All bounds fields are required" };
    }
    if (!ndwiMunicipality) {
      return { error: "Municipality is required" };
    }
    if (!ndwiCoastlineName) {
      return { error: "Coastline name is required" };
    }

    const lonMinParsed = parseDMSOrDecimal(ndwiLonMin);
    const latMinParsed = parseDMSOrDecimal(ndwiLatMin);
    const lonMaxParsed = parseDMSOrDecimal(ndwiLonMax);
    const latMaxParsed = parseDMSOrDecimal(ndwiLatMax);

    if ([lonMinParsed, latMinParsed, lonMaxParsed, latMaxParsed].some((v) => v === null || isNaN(v))) {
      return { error: 'Could not parse one or more bounds. Use decimal degrees (120.3816) or DMS (120°22\'53.66"E).' };
    }

    // Same check the picker shows live, repeated here so a blocking problem can't reach
    // Earth Engine even if the map panel was never opened.
    if (aoiErrors.length > 0) {
      return { error: aoiErrors[0].message };
    }

    return { bounds: { lonMinParsed, latMinParsed, lonMaxParsed, latMaxParsed } };
  };

  const handleGenerateNDWI = async () => {
    setNdwiError(null);

    if (!ndwiYear) {
      setNdwiError("Year is required");
      return;
    }
    const { error, bounds } = validateAndParseNdwiInputs();
    if (error) {
      setNdwiError(error);
      return;
    }
    const { lonMinParsed, latMinParsed, lonMaxParsed, latMaxParsed } = bounds;

    const result = await ndwiGeneration.startSingleYear({
      lonMin: lonMinParsed,
      latMin: latMinParsed,
      lonMax: lonMaxParsed,
      latMax: latMaxParsed,
      year: ndwiYear,
      coastlineName: ndwiCoastlineName,
      municipality: ndwiMunicipality,
      specificArea: ndwiCoastlineName,
    });

    if (result.success) {
      await showSuccess(result.message || "NDWI generated and processed successfully.");
    } else if (result.error) {
      await showError(result.error);
    }
  };

  const handleGenerateAllYears = async () => {
    setNdwiError(null);

    const { error, bounds } = validateAndParseNdwiInputs();
    if (error) {
      setNdwiError(error);
      return;
    }
    const { lonMinParsed, latMinParsed, lonMaxParsed, latMaxParsed } = bounds;

    try {
      await ndwiGeneration.startBatch({
        lonMin: lonMinParsed,
        latMin: latMinParsed,
        lonMax: lonMaxParsed,
        latMax: latMaxParsed,
        municipality: ndwiMunicipality,
        specificArea: ndwiCoastlineName,
      });
    } catch (err) {
      setNdwiError(err.message || "Failed to start batch generation");
    }
  };

  const handleUpload = async () => {
    const validation = validateForm();
    if (!validation.valid) {
      await showErrorHtml(
        `Validation Errors:<br/><small>${validation.errors.map(e => `• ${e}`).join("<br/>")}</small>`
      );
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadPhase("uploading");
    setUploadResults([]);

    try {
      const formData = new FormData();
      formData.append("municipality", municipality);
      formData.append("year", yearOfData);
      formData.append("specific_area", specificArea);

      if (datasetFile) {
        formData.append("geojson", datasetFile);
      }

      if (satelliteFile) {
        formData.append("satellite", satelliteFile);

        const boundsFilled = [boundsNorth, boundsSouth, boundsEast, boundsWest].some((v) => v.trim());
        if (boundsFilled) {
          const north = parseDMSOrDecimal(boundsNorth);
          const south = parseDMSOrDecimal(boundsSouth);
          const east = parseDMSOrDecimal(boundsEast);
          const west = parseDMSOrDecimal(boundsWest);

          if ([north, south, east, west].some((v) => v === null || isNaN(v))) {
            await showErrorHtml(
              "Could not parse one or more image bounds.<br/><small>Use decimal degrees (14.542886) or DMS (14°32'34.39\"N), or leave all four blank to skip automated detection.</small>"
            );
            setUploading(false);
            setUploadProgress(0);
            return;
          }

          formData.append("north", north);
          formData.append("south", south);
          formData.append("east", east);
          formData.append("west", west);
        }
      }

      const xhr = new XMLHttpRequest();

      // Reserve the last 10% for the processing phase.
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 90;
          setUploadProgress(Math.round(percentComplete));
        }
      });

      xhr.upload.addEventListener("load", () => {
        setUploadProgress(90);
        setUploadPhase("processing");
      });

      xhr.addEventListener("load", async () => {
        setUploadProgress(100);
        setUploadPhase("done");

        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setUploadResults(response.uploads || []);

          // Leave image bounds filled in — reuploading another year for the same scene needs them again.
          setDatasetFile(null);
          setSatelliteFile(null);
          if (datasetInputRef.current) datasetInputRef.current.value = "";
          if (satelliteInputRef.current) satelliteInputRef.current.value = "";

          await showSuccessHtml(`Upload completed successfully!<br/><small>${response.uploads?.length || 1} file(s) processed</small>`);
        } else {
          const error = JSON.parse(xhr.responseText);
          await showErrorHtml(`Upload failed<br/><small>${error.error || "Unknown error"}</small>`);
        }
        setUploading(false);
        setUploadProgress(0);
        setUploadPhase("idle");
      });

      xhr.addEventListener("error", async () => {
        await showErrorHtml("Upload failed<br/><small>Network connection error</small>");
        setUploading(false);
        setUploadProgress(0);
        setUploadPhase("idle");
      });

      xhr.open("POST", `${API_BASE_URL}/api/admin/uploads/upload`, true);
      // Ties admin_id in upload_history to a real user; rejects anonymous uploads.
      xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);
      xhr.send(formData);
    } catch (error) {
      console.error("Upload error:", error);
      await showErrorHtml(`Upload failed<br/><small>${error.message}</small>`);
      setUploading(false);
      setUploadProgress(0);
      setUploadPhase("idle");
    }
  };

  return (
    <AdminLayout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="data-upload-container">
        <div className="upload-header">
          <h1 className="upload-title">Data Upload Center</h1>
          <p className="upload-subtitle">
            Upload satellite imagery for coastal erosion analysis
          </p>
        </div>

        <div className="upload-main-section">
          <div className="upload-type-toggle">
            <button
              type="button"
              className={`toggle-btn ${uploadType === "ndwi" ? "active" : ""}`}
              onClick={() => setUploadType("ndwi")}
            >
              <img src="/NDWI.png" alt="" className="toggle-btn-icon" />
              NDWI Generator
            </button>
          </div>

          <div className="upload-files-grid">
            {uploadType === "ndwi" && (
            <div className="upload-card">
              <div className="upload-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="upload-card-icon-badge blue">
                    <img src="/NDWI.png" alt="" />
                  </span>
                  <h3>NDWI Generator (Google Earth Engine)</h3>
                </div>
                <span className="file-type-badge">Sentinel-2</span>
              </div>

              <p className="placeholder-secondary" style={{ margin: '0 0 16px' }}>
                Generate NDWI imagery from Google Earth Engine using a bounding box, then generate a single year or all available years (2015–{new Date().getFullYear()}) at once — each is analyzed and saved automatically, no manual upload step needed.
              </p>

              <div
                className={`info-box ndwi-coordinate-help ${coordinateHelpOpen ? "is-expanded" : "is-collapsed"}`}
                id="ndwi-coordinate-help"
              >
                <button
                  type="button"
                  className="coordinate-help-header"
                  onClick={() => setCoordinateHelpOpen((v) => !v)}
                  aria-expanded={coordinateHelpOpen}
                  aria-controls="ndwi-coordinate-help-body"
                >
                  <h4>Where do I get these coordinates?</h4>
                  <i
                    className={`pi ${coordinateHelpOpen ? "pi-chevron-up" : "pi-chevron-down"} coordinate-help-chevron`}
                    aria-hidden="true"
                  />
                </button>

                <div className="coordinate-help-body" id="ndwi-coordinate-help-body">
                <p>
                  A bounding box is just two corners. The <strong>south-west</strong> corner gives you Latitude Min and Longitude Min; the <strong>north-east</strong> corner gives you Latitude Max and Longitude Max.
                </p>
                <p>
                  <strong>Google Earth Pro</strong> is a free desktop app and the easiest way to find them: open it, navigate to the stretch of coast you want, and read the latitude and longitude off the status bar at the bottom of the window as you move the cursor. It displays coordinates as <code>14&deg;33'0.76&quot;N</code> — paste that straight into these fields, no conversion needed.
                </p>
                <a
                  className="coordinate-help-link"
                  href="https://www.google.com/earth/about/versions/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download Google Earth Pro
                </a>
                <p className="coordinate-help-alt-label">Other ways to get them:</p>
                <ul>
                  <li>
                    <strong>Google Maps</strong> — right-click any point; the coordinates appear at the top of the menu, click them to copy.
                  </li>
                  <li>
                    <strong>Google Earth on the web</strong> (earth.google.com) — the same idea, with nothing to install.
                  </li>
                  <li>
                    <strong>An area already in the system</strong> — pick it under Coastline Name below and all four fields fill in automatically from the bounds used for it before.
                  </li>
                </ul>
                </div>
              </div>

              <div className="form-grid" id="ndwi-generator-fields">
                <div className="form-group">
                  <label className="form-label">Latitude Min (South) *</label>
                  <InputText
                    className="form-input w-full"
                    value={ndwiLatMin}
                    onChange={(e) => setNdwiLatMin(e.target.value)}
                    placeholder={`14.6000 or 14°33'0.76"N`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Latitude Max (North) *</label>
                  <InputText
                    className="form-input w-full"
                    value={ndwiLatMax}
                    onChange={(e) => setNdwiLatMax(e.target.value)}
                    placeholder={`14.6400 or 14°33'54.17"N`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude Min (West) *</label>
                  <InputText
                    className="form-input w-full"
                    value={ndwiLonMin}
                    onChange={(e) => setNdwiLonMin(e.target.value)}
                    placeholder={`120.3800 or 120°22'53.66"E`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude Max (East) *</label>
                  <InputText
                    className="form-input w-full"
                    value={ndwiLonMax}
                    onChange={(e) => setNdwiLonMax(e.target.value)}
                    placeholder={`120.4200 or 120°23'37.98"E`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Year *</label>
                  <InputNumber
                    className="w-full"
                    inputClassName="form-input w-full"
                    value={ndwiYear ? Number(ndwiYear) : null}
                    onValueChange={(e) => setNdwiYear(e.value == null ? "" : String(e.value))}
                    min={2015}
                    max={new Date().getFullYear()}
                    useGrouping={false}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Municipality *</label>
                  <Dropdown
                    className="form-select w-full"
                    value={ndwiMunicipality}
                    onChange={(e) => setNdwiMunicipality(e.value)}
                    options={municipalities}
                    optionLabel="label"
                    optionValue="value"
                    optionDisabled="disabled"
                    placeholder="Select Municipality"
                    filter
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Coastline Name *</label>
                  <AreaNameField
                    municipality={ndwiMunicipality}
                    value={ndwiCoastlineName}
                    onChange={setNdwiCoastlineName}
                    onAreaSelect={(area) => {
                      if (!area.bounds) {
                        setStoredAreaBounds(null);
                        return;
                      }
                      const { north, south, east, west } = area.bounds;
                      if (north != null) setNdwiLatMax(String(north));
                      if (south != null) setNdwiLatMin(String(south));
                      if (east != null) setNdwiLonMax(String(east));
                      if (west != null) setNdwiLonMin(String(west));
                      // Remembered so the picker can warn if the box later drifts from
                      // what earlier years for this area were generated with.
                      setStoredAreaBounds(
                        [north, south, east, west].every((v) => v != null)
                          ? { north, south, east, west }
                          : null
                      );
                      setAoiSnapDistance(null);
                    }}
                  />
                </div>
              </div>

              {SHOW_AOI_PICKER && (
                <AoiPicker
                  municipality={ndwiMunicipality}
                  box={ndwiBox}
                  sizeMeters={aoiSizeMeters}
                  onSizeChange={setAoiSizeMeters}
                  onApplyBox={applyAoiBox}
                  onSnapDistanceChange={setAoiSnapDistance}
                  onCoastlinesChange={setAoiCoastlines}
                  onLandFractionChange={setAoiLandFraction}
                  errors={aoiErrors}
                  warnings={aoiWarnings}
                  onRestoreStoredBounds={
                    storedAreaBounds
                      ? () => {
                          applyAoiBox({
                            lonMin: storedAreaBounds.west,
                            lonMax: storedAreaBounds.east,
                            latMin: storedAreaBounds.south,
                            latMax: storedAreaBounds.north,
                          });
                          setAoiSnapDistance(null);
                        }
                      : null
                  }
                />
              )}

              <div className="upload-actions" style={{ marginTop: '16px', gap: '10px', flexWrap: 'wrap' }}>
                <Button
                  className="btn-upload"
                  id="generate-ndwi-btn"
                  icon="pi pi-cloud-download"
                  onClick={handleGenerateNDWI}
                  disabled={ndwiGeneration.singleYear.generating || ndwiGeneration.running || aoiErrors.length > 0}
                  loading={ndwiGeneration.singleYear.generating}
                  label={ndwiGeneration.singleYear.generating ? "Generating..." : "Generate & Upload Selected Year"}
                />
                <Button
                  className="btn-upload"
                  id="generate-ndwi-all-years-btn"
                  icon="pi pi-calendar"
                  severity="secondary"
                  onClick={handleGenerateAllYears}
                  disabled={ndwiGeneration.singleYear.generating || ndwiGeneration.running || aoiErrors.length > 0}
                  loading={ndwiGeneration.running}
                  label={ndwiGeneration.running ? "Generating All Years..." : `Generate & Upload All Years (2015–${new Date().getFullYear()})`}
                />
              </div>

              {ndwiGeneration.singleYear.generating && (
                <div className="ndwi-single-progress" style={{ marginTop: '12px' }}>
                  <div className="ndwi-single-progress-top">
                    <div className="ndwi-single-progress-icon">⏳</div>
                    <div>
                      <p className="ndwi-single-progress-headline">
                        Generating NDWI for {ndwiGeneration.singleYear.year}
                      </p>
                      <p className="ndwi-single-progress-subtext">
                        Analyzing satellite imagery… this can take up to a minute.
                      </p>
                    </div>
                  </div>
                  <ProgressBar mode="indeterminate" style={{ height: "6px" }} />
                  <p className="ndwi-single-progress-note">
                    <span className="ndwi-single-progress-note-icon">✓</span>
                    You can safely navigate to another page — we'll show a confirmation when it's done.
                  </p>
                </div>
              )}

              {(ndwiError || ndwiGeneration.singleYear.error) && (
                <p className="error-text" style={{ marginTop: '12px' }}>{ndwiError || ndwiGeneration.singleYear.error}</p>
              )}

              {ndwiGeneration.singleYear.result && (
                <div className="result-card result-success" style={{ marginTop: '12px' }}>
                  <div className="result-body">
                    <p><strong>{ndwiGeneration.singleYear.result.fileName}</strong> generated and processed successfully.</p>
                    {ndwiGeneration.singleYear.result.message && <p className="placeholder-secondary">{ndwiGeneration.singleYear.result.message}</p>}
                  </div>
                </div>
              )}

              {ndwiGeneration.status && <NdwiBatchPanel batch={ndwiGeneration} />}
            </div>
            )}

            {SHOW_SATELLITE_UPLOAD && uploadType === "satellite" && (
            <div className="upload-card">
              <div className="upload-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="upload-card-icon-badge green">
                    <img src="/uploadSatellite.png" alt="" />
                  </span>
                  <div>
                    <h3>Satellite Image Upload</h3>
                    <p className="upload-card-subtitle">Upload your own satellite imagery for analysis.</p>
                  </div>
                </div>
                <span className="file-type-badge">Raster Data</span>
              </div>

              <div className="satellite-upload-body">
                <div className="satellite-dropzone-col">
                  <p className="upload-section-label">Upload Satellite Image</p>
                  <div
                    className="upload-drop-zone satellite-dropzone"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, setSatelliteFile)}
                    onClick={() => satelliteInputRef.current?.click()}
                  >
                    <input
                      ref={satelliteInputRef}
                      type="file"
                      hidden
                      accept=".tif,.tiff,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => handleFileSelect(e, setSatelliteFile)}
                    />

                    {satelliteFile ? (
                      <div className="file-selected-display">
                        <div className="file-icon">✓</div>
                        <p className="file-name">{satelliteFile.name}</p>
                        <p className="file-size">
                          {(satelliteFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="file-placeholder">
                        <div className="placeholder-icon">
                          <img src="/upload-icon.png" alt="Upload" style={{ width: '60px', height: '60px' }} />
                        </div>
                        <p className="placeholder-primary">
                          Drag image here or click
                        </p>
                        <p className="placeholder-secondary">
                          Formats: .tif, .jpg, .png (max 200MB)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="satellite-bounds-col">
                  <p className="upload-section-label">Image Bounds</p>
                  <p className="placeholder-secondary" style={{ margin: '0 0 12px' }}>
                    Optional for .tif/NDWI images — bounds are auto-detected. Recommended for .jpg/.png.
                  </p>

                  <div className="bounds-compass">
                    <div className="bounds-compass-cell bounds-compass-north">
                      <label className="form-label">North (lat)</label>
                      <InputText
                        type="text"
                        className="form-input"
                        value={boundsNorth}
                        onChange={(e) => setBoundsNorth(e.target.value)}
                        placeholder={`14.7000 or 14°32'34.39"N`}
                      />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-west">
                      <label className="form-label">West (lng)</label>
                      <InputText
                        type="text"
                        className="form-input"
                        value={boundsWest}
                        onChange={(e) => setBoundsWest(e.target.value)}
                        placeholder={`120.5300 or 120°22'54.14"E`}
                      />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-center" aria-hidden="true">
                      <i className="pi pi-compass" style={{ fontSize: '22px', opacity: 0.4 }} aria-hidden="true" />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-east">
                      <label className="form-label">East (lng)</label>
                      <InputText
                        type="text"
                        className="form-input"
                        value={boundsEast}
                        onChange={(e) => setBoundsEast(e.target.value)}
                        placeholder={`120.5500 or 120°23'30.64"E`}
                      />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-south">
                      <label className="form-label">South (lat)</label>
                      <InputText
                        type="text"
                        className="form-input"
                        value={boundsSouth}
                        onChange={(e) => setBoundsSouth(e.target.value)}
                        placeholder={`14.6800 or 14°31'59.06"N`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="location-metadata-section">
                <p className="upload-section-label">Location Details</p>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Municipality *</label>
                    <Dropdown
                      className="form-select"
                      value={municipality}
                      onChange={(e) => setMunicipality(e.value)}
                      options={municipalities}
                      optionLabel="label"
                      optionValue="value"
                      optionDisabled="disabled"
                      placeholder="Select Municipality"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Specific Area *</label>
                    <AreaNameField
                      municipality={municipality}
                      value={specificArea}
                      onChange={setSpecificArea}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Year of Data *</label>
                    <Dropdown
                      className="form-select"
                      value={yearOfData}
                      onChange={(e) => setYearOfData(e.value)}
                      options={years.map((year) => ({ label: String(year), value: year }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Data Quality</label>
                    <Dropdown
                      className="form-select"
                      value={dataQuality}
                      onChange={(e) => setDataQuality(e.value)}
                      options={[
                        { label: "Measured (High Confidence)", value: "Measured" },
                        { label: "Estimated (Medium Confidence)", value: "Estimated" },
                        { label: "Simulated (Low Confidence)", value: "Simulated" },
                      ]}
                    />
                  </div>

                </div>
              </div>

              {uploading && (
                <div className="upload-progress-section">
                  <div className="progress-info">
                    <span className="progress-label">
                      {uploadPhase === "processing" ? "Processing on server…" : "Uploading…"}
                    </span>
                    <span className="progress-percent">
                      {uploadPhase === "processing" ? "" : `${uploadProgress}%`}
                    </span>
                  </div>
                  <div className="progress-bar-container">
                    <div
                      className={`progress-bar-fill ${uploadPhase === "processing" ? "progress-bar-indeterminate" : ""}`}
                      style={uploadPhase === "processing" ? undefined : { width: `${uploadProgress}%` }}
                    />
                  </div>
                  {uploadPhase === "processing" && (
                    <p className="progress-subtext">
                      File transfer complete — running coastline analysis, this can take a while for large images.
                    </p>
                  )}
                </div>
              )}

              {uploadResults.length > 0 && (
                <div className="upload-results-section">
                  <h3 className="results-title">Upload Results</h3>
                  {uploadResults.map((result, index) => (
                    <div
                      key={index}
                      className={`result-card ${
                        result.success ? "result-success" : "result-error"
                      }`}
                    >
                      <div className="result-header">
                        <span className="result-type">{result.type}</span>
                        <span className="result-status">
                          {result.success ? "✓ Success" : "✗ Failed"}
                        </span>
                      </div>
                      <div className="result-body">
                        {result.success && result.recordsProcessed && (
                          <p>
                            <strong>Records Processed:</strong> {result.recordsProcessed}
                          </p>
                        )}
                        {result.success && result.satelliteId && (
                          <p>
                            <strong>Image ID:</strong> {result.satelliteId}
                          </p>
                        )}
                        {result.message && (
                          <p>
                            <strong>Message:</strong> {result.message}
                          </p>
                        )}
                        {result.error && (
                          <p className="error-text">
                            <strong>Error:</strong> {result.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="upload-actions">
                <button
                  className="btn-upload"
                  id="upload-files-btn"
                  onClick={handleUpload}
                  disabled={uploading || (!datasetFile && !satelliteFile)}
                >
                  <img src="/uploadSatellite.png" alt="" className="btn-icon" />
                  {uploading ? "Uploading..." : "Upload Files"}
                </button>
                <button
                  className="btn-reset"
                  onClick={() => {
                    setDatasetFile(null);
                    setSatelliteFile(null);
                    setBoundsNorth("");
                    setBoundsSouth("");
                    setBoundsEast("");
                    setBoundsWest("");
                    setUploadResults([]);
                    if (datasetInputRef.current) datasetInputRef.current.value = "";
                    if (satelliteInputRef.current) satelliteInputRef.current.value = "";
                  }}
                  disabled={uploading}
                >
                  <img src="/clear.png" alt="" className="btn-icon btn-icon-dark" />
                  Clear
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const NDWI_MIN_YEAR = 2015;

// Fuller progress view of the same batch job the floating widget shows elsewhere
function NdwiBatchPanel({ batch }) {
  const { status, running, cancelBatch } = batch;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - NDWI_MIN_YEAR + 1 }, (_, i) => NDWI_MIN_YEAR + i);
  const failedByYear = new Map((status.failedYears || []).map((f) => [f.year, f.reason]));
  const completedSet = new Set(status.completedYears || []);
  const doneCount = completedSet.size + failedByYear.size;
  const percent = Math.round((doneCount / (status.totalYears || 1)) * 100);

  return (
    <div className="ndwi-batch-panel" style={{ marginTop: '12px' }}>
      <div className="ndwi-batch-panel-top">
        <div className="ndwi-batch-panel-percent">{percent}%</div>
        <div>
          <p className="ndwi-batch-panel-headline">
            {doneCount} of {status.totalYears} years processed
          </p>
          <p className="ndwi-batch-panel-subtext">
            {running
              ? status.currentYear
                ? `Currently processing satellite imagery for ${status.currentYear}`
                : "Starting…"
              : status.failedYears?.length
                ? `${status.completedYears.length} succeeded, ${status.failedYears.length} skipped`
                : "All years processed successfully."}
          </p>
        </div>
      </div>

      <div className="progress-bar-container" style={{ margin: '12px 0' }}>
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="ndwi-batch-panel-timeline">
        {years.map((year) => {
          const state = completedSet.has(year)
            ? "done"
            : failedByYear.has(year)
              ? "failed"
              : running && status.currentYear === year
                ? "current"
                : "pending";
          return (
            <div key={year} className="ndwi-batch-panel-timeline-item" title={failedByYear.get(year) || undefined}>
              <span className={`ndwi-batch-panel-dot ndwi-batch-panel-dot-${state}`} />
              <span className="ndwi-batch-panel-year">{year}</span>
            </div>
          );
        })}
      </div>

      {running ? (
        <>
          <p className="ndwi-batch-panel-note">
            <span className="ndwi-batch-panel-note-icon">✓</span>
            You can safely navigate to another page. Processing will continue in the background.
          </p>
          <button type="button" className="ndwi-batch-panel-cancel-btn" onClick={cancelBatch}>
            Cancel batch
          </button>
        </>
      ) : status.failedYears?.length > 0 && (
        <ul className="ndwi-batch-panel-skipped">
          {status.failedYears.map((f) => (
            <li key={f.year}><strong>{f.year}:</strong> {f.reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Shared by Specific Area and Coastline Name fields — pick an existing area or type a new one
function AreaNameField({ municipality, value, onChange, onAreaSelect }) {
  const [areas, setAreas] = useState([]);
  const [otherSelected, setOtherSelected] = useState(false);

  useEffect(() => {
    if (!municipality) {
      setAreas([]);
      return;
    }

    let cancelled = false;
    fetch(`${API_BASE_URL}/api/shoreline/municipality/${encodeURIComponent(municipality)}/areas`)
      .then((res) => (res.ok ? res.json() : { areas: [] }))
      .then((data) => {
        if (!cancelled) setAreas(data.areas || []);
      })
      .catch(() => {
        if (!cancelled) setAreas([]);
      });

    return () => {
      cancelled = true;
    };
  }, [municipality]);

  // A previously picked/typed area doesn't carry over to a new municipality.
  useEffect(() => {
    setOtherSelected(false);
    onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipality]);

  // If the value isn't a known area name (e.g. set via GeoJSON extraction), show it in the "Others" input
  const isKnownAreaName = value !== "" && areas.some((a) => a.name === value);
  const otherMode = otherSelected || (value !== "" && !isKnownAreaName);

  const handleSelectChange = (e) => {
    const selected = e.value;
    if (selected === "__other__") {
      setOtherSelected(true);
      onChange("");
    } else {
      setOtherSelected(false);
      onChange(selected);
      // Only a known existing area has bounds on file to offer
      if (onAreaSelect) {
        const area = areas.find((a) => a.name === selected);
        if (area) onAreaSelect(area);
      }
    }
  };

  return (
    <>
      <Dropdown
        className="form-select w-full"
        value={otherMode ? "__other__" : value || null}
        onChange={handleSelectChange}
        options={[
          ...areas.map((area) => ({ label: area.name, value: area.name })),
          { label: "Others", value: "__other__" },
        ]}
        placeholder={areas.length > 0 ? "Select an area" : "No existing areas yet"}
        filter={areas.length > 5}
      />
      {otherMode && (
        <InputText
          className="form-input w-full"
          style={{ marginTop: 8 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter a new area name"
        />
      )}
    </>
  );
}
