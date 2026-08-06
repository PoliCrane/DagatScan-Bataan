import AdminLayout from "../../components/AdminLayout";
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/data-upload.css";
import { showSuccess, showError } from "../../utils/sweetAlertUtils";
import useGuidedTour from "../../hooks/useGuidedTour";
import TourInfoButton from "../../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../../tours/pageIds";
import { buildDataUploadSteps } from "../../tours/steps/dataUploadSteps";

import { API_BASE_URL } from "../../config/api";
export default function DataUpload() {
  const navigate = useNavigate();

  // Data Upload is admin/superadmin only — normal users get redirected
  useEffect(() => {
    const userRole = localStorage.getItem("roles");
    if (userRole !== "admin" && userRole !== "superadmin") {
      navigate("/coastalmonitoring", { replace: true });
    }
  }, [navigate]);

  const [uploadType, setUploadType] = useState("ndwi");
  const [datasetFile, setDatasetFile] = useState(null);
  const [satelliteFile, setSatelliteFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState([]);
  const dataUploadSteps = useMemo(() => buildDataUploadSteps(setUploadType), [setUploadType]);
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.DATA_UPLOAD, dataUploadSteps);
  // Two phases: "uploading" (real byte progress, capped at 90%) then
  // "processing" (indeterminate — server-side analysis has no byte signal).
  const [uploadPhase, setUploadPhase] = useState("idle");

  // NDWI Generator fields
  const [ndwiLonMin, setNdwiLonMin] = useState("");
  const [ndwiLatMin, setNdwiLatMin] = useState("");
  const [ndwiLonMax, setNdwiLonMax] = useState("");
  const [ndwiLatMax, setNdwiLatMax] = useState("");
  const [ndwiYear, setNdwiYear] = useState(new Date().getFullYear().toString());
  const [ndwiCoastlineName, setNdwiCoastlineName] = useState("");
  const [ndwiGenerating, setNdwiGenerating] = useState(false);
  const [ndwiResult, setNdwiResult] = useState(null);
  const [ndwiError, setNdwiError] = useState(null);

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

  const municipalities = [
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

  const years = Array.from(
    { length: 20 },
    (_, i) => (2026 - i).toString()
  ).sort();

  // NDWI Generator's own municipality selector — the card has no location
  // concept today, so the Coastline Name dropdown needs one to know which
  // municipality's coastal_areas to offer.
  const [ndwiMunicipality, setNdwiMunicipality] = useState("");

  const extractGeoJSONProperties = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const geojson = JSON.parse(event.target.result);
        const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);
        if (features.length === 0) return;

        // Collect all properties from all features, first non-null wins per field
        const props = {};
        for (const feature of features) {
          const p = feature.properties || {};
          for (const [k, v] of Object.entries(p)) {
            if (v !== null && v !== undefined && v !== "" && !(k.toLowerCase() in props)) {
              props[k.toLowerCase()] = v;
            }
          }
        }

        // Municipality: match against known list (case-insensitive)
        const muniKeys = ["municipality", "muni", "city", "town", "lgu"];
        for (const key of muniKeys) {
          const val = props[key];
          if (val) {
            const match = municipalities.find(
              (m) => m.toLowerCase() === String(val).trim().toLowerCase()
            );
            if (match) {
              setMunicipality(match);
              break;
            }
          }
        }

        // Specific area / location
        const areaKeys = ["specific_area", "location", "area", "name", "zone", "barangay", "sitio", "place"];
        for (const key of areaKeys) {
          if (props[key]) {
            setSpecificArea(String(props[key]).trim());
            break;
          }
        }

        // Year
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
        // Silently ignore parse errors — invalid GeoJSON will be caught on upload
      }
    };
    reader.readAsText(file);
  };

  // Accepts decimal degrees, symbol-based DMS, or raw concatenated DMS with
  // no separators (e.g. pasted from sources that strip °'" marks).
  const parseDMSOrDecimal = (value) => {
    if (!value) return null;
    const str = value.trim();

    // Symbol-based DMS, e.g. 14°32'34.39"N
    const dmsRegex = /(\d+(?:\.\d+)?)[°\s]+(\d+(?:\.\d+)?)['’′\s]+(\d+(?:\.\d+)?)["”″]?\s*([NSEW])?/i;
    const dmsMatch = str.match(dmsRegex);
    if (dmsMatch) {
      const [, deg, min, sec, dir] = dmsMatch;
      let decimal = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
      if (dir && /[SW]/i.test(dir)) decimal = -decimal;
      return decimal;
    }

    // Raw concatenated DMS with no separators, e.g. 143234.87 -> deg=14 min=32 sec=34.87
    const rawMatch = str.match(/^(\d{5,7})(\.\d+)?\s*([NSEW])?$/i);
    if (rawMatch) {
      const [, intPart, frac = "", dir] = rawMatch;
      const sec = parseFloat(intPart.slice(-2) + frac);
      const min = parseInt(intPart.slice(-4, -2), 10);
      const deg = parseInt(intPart.slice(0, -4), 10);
      if (min < 60 && sec < 60) {
        let decimal = deg + min / 60 + sec / 3600;
        if (dir && /[SW]/i.test(dir)) decimal = -decimal;
        return decimal;
      }
    }

    // Plain decimal degrees, e.g. 14.542886
    if (/^-?\d+(\.\d+)?$/.test(str)) {
      return parseFloat(str);
    }

    return null;
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

  const handleGenerateNDWI = async () => {
    setNdwiError(null);
    setNdwiResult(null);

    if (!ndwiLonMin || !ndwiLatMin || !ndwiLonMax || !ndwiLatMax || !ndwiYear) {
      setNdwiError("All bounds fields and year are required");
      return;
    }
    if (!ndwiMunicipality) {
      setNdwiError("Municipality is required");
      return;
    }
    if (!ndwiCoastlineName) {
      setNdwiError("Coastline name is required");
      return;
    }

    // Accepts decimal degrees or DMS (e.g. 14°33'54.17"N) — same parser used
    // for the Satellite tab's image bounds fields.
    const lonMinParsed = parseDMSOrDecimal(ndwiLonMin);
    const latMinParsed = parseDMSOrDecimal(ndwiLatMin);
    const lonMaxParsed = parseDMSOrDecimal(ndwiLonMax);
    const latMaxParsed = parseDMSOrDecimal(ndwiLatMax);

    if ([lonMinParsed, latMinParsed, lonMaxParsed, latMaxParsed].some((v) => v === null || isNaN(v))) {
      setNdwiError('Could not parse one or more bounds. Use decimal degrees (120.3816) or DMS (120°22\'53.66"E).');
      return;
    }

    setNdwiGenerating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-ndwi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          lonMin: lonMinParsed,
          latMin: latMinParsed,
          lonMax: lonMaxParsed,
          latMax: latMaxParsed,
          year: ndwiYear,
          coastlineName: ndwiCoastlineName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setNdwiError(data.error || "NDWI generation failed");
        return;
      }

      setNdwiResult(data);
      await showSuccess("NDWI GeoTIFF generated. Click the download link to save it, then upload it in the Satellite Image Upload Tab.");
    } catch (err) {
      setNdwiError(err.message || "Network error while generating NDWI");
    } finally {
      setNdwiGenerating(false);
    }
  };

  const handleUpload = async () => {
    const validation = validateForm();
    if (!validation.valid) {
      await showError(
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
            await showError(
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

      // Cap at 90% so the "processing" phase doesn't look stuck at 100%.
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

          // Leave image bounds filled in — reuploading another year for the
          // same scene needs them again. "Clear" button wipes them if needed.
          setDatasetFile(null);
          setSatelliteFile(null);
          if (datasetInputRef.current) datasetInputRef.current.value = "";
          if (satelliteInputRef.current) satelliteInputRef.current.value = "";

          await showSuccess(`Upload completed successfully!<br/><small>${response.uploads?.length || 1} file(s) processed</small>`);
        } else {
          const error = JSON.parse(xhr.responseText);
          await showError(`Upload failed<br/><small>${error.error || "Unknown error"}</small>`);
        }
        setUploading(false);
        setUploadProgress(0);
        setUploadPhase("idle");
      });

      xhr.addEventListener("error", async () => {
        await showError("Upload failed<br/><small>Network connection error</small>");
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
      await showError(`Upload failed<br/><small>${error.message}</small>`);
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

        {/* Main Upload Section */}
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
            <button
              type="button"
              className={`toggle-btn ${uploadType === "satellite" ? "active" : ""}`}
              onClick={() => setUploadType("satellite")}
            >
              <img src="/uploadSatellite.png" alt="" className="toggle-btn-icon" />
              Satellite Image Upload
            </button>
          </div>

          {/* GeoJSON temporarily disabled */}
          <div className="upload-files-grid">
            {/* NDWI Generator */}
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
                Generate NDWI imagery from Google Earth Engine using a bounding box and year, then download and upload it in the Satellite Image Upload Tab.
              </p>

              <div className="form-grid" id="ndwi-generator-fields">
                <div className="form-group">
                  <label className="form-label">Latitude Min (South) *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ndwiLatMin}
                    onChange={(e) => setNdwiLatMin(e.target.value)}
                    placeholder={`14.6000 or 14°33'0.76"N`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Latitude Max (North) *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ndwiLatMax}
                    onChange={(e) => setNdwiLatMax(e.target.value)}
                    placeholder={`14.6400 or 14°33'54.17"N`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude Min (West) *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ndwiLonMin}
                    onChange={(e) => setNdwiLonMin(e.target.value)}
                    placeholder={`120.3800 or 120°22'53.66"E`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude Max (East) *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ndwiLonMax}
                    onChange={(e) => setNdwiLonMax(e.target.value)}
                    placeholder={`120.4200 or 120°23'37.98"E`}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Year *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={ndwiYear}
                    onChange={(e) => setNdwiYear(e.target.value)}
                    min="2015"
                    max={new Date().getFullYear()}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Municipality *</label>
                  <select
                    className="form-select"
                    value={ndwiMunicipality}
                    onChange={(e) => setNdwiMunicipality(e.target.value)}
                  >
                    <option value="">Select Municipality</option>
                    {municipalities.map((mun) => (
                      <option key={mun} value={mun}>
                        {mun}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Coastline Name *</label>
                  <AreaNameField
                    municipality={ndwiMunicipality}
                    value={ndwiCoastlineName}
                    onChange={setNdwiCoastlineName}
                  />
                </div>
              </div>

              <div className="upload-actions" style={{ marginTop: '16px' }}>
                <button
                  className="btn-upload"
                  id="generate-ndwi-btn"
                  onClick={handleGenerateNDWI}
                  disabled={ndwiGenerating}
                >
                  <img src="/generateNDWI.png" alt="" className="btn-icon" />
                  {ndwiGenerating ? "Generating..." : "Generate NDWI Image"}
                </button>
              </div>

              {ndwiError && (
                <p className="error-text" style={{ marginTop: '12px' }}>{ndwiError}</p>
              )}

              {ndwiResult && (
                <div className="result-card result-success" style={{ marginTop: '12px' }}>
                  <div className="result-body">
                    <p><strong>File ready:</strong> {ndwiResult.fileName}</p>
                    <p>
                      <a
                        href={`${API_BASE_URL}${ndwiResult.downloadUrl}`}
                        download
                        style={{ color: '#0077B6', fontWeight: 'bold' }}
                      >
                        Download NDWI GeoTIFF
                      </a>
                    </p>
                    <p className="placeholder-secondary">
                      After downloading, upload this file using the Satellite Image Upload
                      card to run coastline detection on it.
                    </p>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Satellite Image Upload */}
            {uploadType === "satellite" && (
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
                      <input
                        type="text"
                        className="form-input"
                        value={boundsNorth}
                        onChange={(e) => setBoundsNorth(e.target.value)}
                        placeholder={`14.7000 or 14°32'34.39"N`}
                      />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-west">
                      <label className="form-label">West (lng)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={boundsWest}
                        onChange={(e) => setBoundsWest(e.target.value)}
                        placeholder={`120.5300 or 120°22'54.14"E`}
                      />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-center" aria-hidden="true">
                      <img src="/coastalmonitoring.png" alt="" style={{ width: '22px', height: '22px', opacity: 0.4 }} />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-east">
                      <label className="form-label">East (lng)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={boundsEast}
                        onChange={(e) => setBoundsEast(e.target.value)}
                        placeholder={`120.5500 or 120°23'30.64"E`}
                      />
                    </div>
                    <div className="bounds-compass-cell bounds-compass-south">
                      <label className="form-label">South (lat)</label>
                      <input
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

              {/* Location & Metadata Section */}
              <div className="location-metadata-section">
                <p className="upload-section-label">Location Details</p>

                <div className="form-grid">
                  {/* Municipality */}
                  <div className="form-group">
                    <label className="form-label">Municipality *</label>
                    <select
                      className="form-select"
                      value={municipality}
                      onChange={(e) => setMunicipality(e.target.value)}
                    >
                      <option value="">Select Municipality</option>
                      {municipalities.map((mun) => (
                        <option key={mun} value={mun}>
                          {mun}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Specific Area */}
                  <div className="form-group">
                    <label className="form-label">Specific Area *</label>
                    <AreaNameField
                      municipality={municipality}
                      value={specificArea}
                      onChange={setSpecificArea}
                    />
                  </div>

                  {/* Year */}
                  <div className="form-group">
                    <label className="form-label">Year of Data *</label>
                    <select
                      className="form-select"
                      value={yearOfData}
                      onChange={(e) => setYearOfData(e.target.value)}
                    >
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Data Quality */}
                  <div className="form-group">
                    <label className="form-label">Data Quality</label>
                    <select
                      className="form-select"
                      value={dataQuality}
                      onChange={(e) => setDataQuality(e.target.value)}
                    >
                      <option value="Measured">Measured (High Confidence)</option>
                      <option value="Estimated">Estimated (Medium Confidence)</option>
                      <option value="Simulated">Simulated (Low Confidence)</option>
                    </select>
                  </div>

                </div>
              </div>

              {/* Upload Progress */}
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

              {/* Upload Results */}
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

              {/* Upload Button */}
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

// Shared by the Satellite card's "Specific Area" and the NDWI card's
// "Coastline Name" — both need the same "pick an existing coastal_areas
// name for this municipality, or type a new one" behavior.
function AreaNameField({ municipality, value, onChange }) {
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

  // Covers values set from outside this component too (e.g. GeoJSON property
  // extraction filling in specificArea directly) — if the value isn't a
  // known area name, show it in the editable "Others" input rather than
  // silently discarding it from view.
  const isKnownAreaName = value !== "" && areas.some((a) => a.name === value);
  const otherMode = otherSelected || (value !== "" && !isKnownAreaName);

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    if (selected === "__other__") {
      setOtherSelected(true);
      onChange("");
    } else {
      setOtherSelected(false);
      onChange(selected);
    }
  };

  return (
    <>
      <select
        className="form-select"
        value={otherMode ? "__other__" : value}
        onChange={handleSelectChange}
      >
        <option value="" disabled>
          {areas.length > 0 ? "Select an area" : "No existing areas yet"}
        </option>
        {areas.map((area) => (
          <option key={area.id} value={area.name}>
            {area.name}
          </option>
        ))}
        <option value="__other__">Others</option>
      </select>
      {otherMode && (
        <input
          type="text"
          className="form-input"
          style={{ marginTop: 8 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter a new area name"
        />
      )}
    </>
  );
}
