import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Polyline, Rectangle, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Button } from "primereact/button";
import { Slider } from "primereact/slider";
import { InputSwitch } from "primereact/inputswitch";
import useBataanGeoJson from "../../hooks/useBataanGeoJson";
import { extractCoastline } from "../../utils/coastlineUtils";
import { fetchAreaSegments } from "../../utils/areaSegments";
import { isLandlocked } from "../../utils/coastalMunicipalities";
import {
  boxFromCenter,
  centerAndSizeFromBox,
  effectiveMetersPerPixel,
  estimateFittedSizeMeters,
  estimateLandFraction,
  nearestPointOnPolylines,
  resolutionQuality,
  toPolylines,
  BATAAN_BBOX,
  SLIDER_MAX_METERS,
  SLIDER_MIN_METERS,
  SNAP_RADIUS_M,
  TRACE_SIZE,
} from "../../utils/aoiGeometry";
import "../../pages/styles/aoiPicker.css";

const PRESETS = [
  { label: "1.0 km", meters: 1000 },
  { label: "1.7 km", meters: 1700, recommended: true },
  { label: "2.2 km", meters: 2200 },
];

const QUALITY_LABEL = { recommended: "Recommended", acceptable: "Acceptable", coarse: "Coarse" };

// No L.Icon.Default fix exists anywhere in this app, so a stock marker image would 404
// under Vite. Every other map here draws its markers the same way.
const pinIcon = L.divIcon({
  className: "aoi-pin",
  html: '<div class="aoi-pin-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/**
 * MapContainer reads center/zoom only at init, and the card animates in around a
 * collapsible panel — so the view and the canvas size both have to be driven from
 * inside the map. Same approach as the dashboard preview in pages/Home.jsx.
 */
function MapViewController({ bounds, containerRef }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !bounds) return undefined;

    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    };
    fit();

    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [map, bounds, containerRef]);

  return null;
}

function MapClickHandler({ enabled, onPick }) {
  const lastDragEndRef = useRef(0);
  useMapEvents({
    click: (e) => {
      if (!enabled) return;
      // Leaflet fires a click straight after a marker drag in some builds; ignore it.
      if (Date.now() - lastDragEndRef.current < 250) return;
      onPick([e.latlng.lat, e.latlng.lng]);
    },
    dragend: () => {
      lastDragEndRef.current = Date.now();
    },
  });
  return null;
}

/**
 * Map for choosing the satellite analysis area. Owns no bounds of its own — it reads the
 * box the form already holds and calls back with a new one, so the four coordinate
 * fields stay the single source of truth.
 */
export default function AoiPicker({
  municipality,
  box,
  sizeMeters,
  onSizeChange,
  onApplyBox,
  onSnapDistanceChange,
  onCoastlinesChange,
  onLandFractionChange,
  errors = [],
  warnings = [],
  onRestoreStoredBounds = null,
}) {
  const { data: geoJson, error: geoJsonError } = useBataanGeoJson();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [isSatellite, setIsSatellite] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [dragSize, setDragSize] = useState(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [traced, setTraced] = useState({ municipality: null, lines: null });

  // While a coordinate field is mid-edit and unparseable there is no box to draw, and
  // showing nothing is the honest signal that the typed value isn't usable yet.
  const drawnBox = box;

  const municipalityFeature = useMemo(() => {
    if (!geoJson || !municipality) return null;
    const owned = geoJson.features.filter(
      (f) => f.properties?.MUNICIPALI?.toUpperCase() === municipality.toUpperCase()
    );
    if (owned.length === 0) return null;
    const area = (f) => {
      const b = L.geoJSON(f).getBounds();
      return (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth());
    };
    return owned.reduce((largest, f) => (area(f) > area(largest) ? f : largest));
  }, [geoJson, municipality]);

  // Every municipality's outer ring, for the lopsided-box check below — real landmass,
  // not the derived "coastline" edges, so it isn't thrown off by the same land-border
  // confusion that affects extractCoastline for Dinalupihan/Hermosa.
  const landRings = useMemo(() => {
    if (!geoJson) return [];
    return geoJson.features.map((f) => f.geometry.coordinates[0]);
  }, [geoJson]);

  // Real traced shorelines beat the 2007-vintage municipal polygon, so prefer them where
  // this municipality has already been analysed. Fetched once per municipality.
  useEffect(() => {
    if (!municipality) return undefined;
    let cancelled = false;
    // Both trailing arguments are dereferenced unguarded inside, and an empty fallback
    // shoreline makes it return early instead of inventing a "Main Coastline".
    fetchAreaSegments(municipality, [], [])
      .then((segments) => {
        if (cancelled) return;
        const lines = (segments || [])
          .map((s) => s.shoreline)
          .filter((line) => Array.isArray(line) && line.length >= 2);
        setTraced({ municipality, lines: lines.length > 0 ? lines : null });
      })
      .catch(() => {
        if (!cancelled) setTraced({ municipality, lines: null });
      });
    return () => {
      cancelled = true;
    };
  }, [municipality]);

  // Held against the municipality it was fetched for, so switching reads as "nothing yet"
  // rather than needing a reset written from inside the effect.
  const tracedLines = traced.municipality === municipality ? traced.lines : null;

  // extractCoastline rebuilds an edge map over every Bataan polygon, so it runs once per
  // municipality here — never per click.
  const polygonCoastline = useMemo(() => {
    if (!geoJson || !municipality) return [];
    try {
      return toPolylines(extractCoastline(geoJson, municipality));
    } catch {
      return [];
    }
  }, [geoJson, municipality]);

  const snapLines = tracedLines && tracedLines.length > 0 ? tracedLines : polygonCoastline;
  const landlocked = isLandlocked(municipality);

  // The form owns validation, so it needs the same coastline this map snaps against.
  useEffect(() => {
    onCoastlinesChange?.(snapLines);
  }, [snapLines, onCoastlinesChange]);

  const fitBounds = useMemo(() => {
    if (municipalityFeature) return L.geoJSON(municipalityFeature).getBounds();
    if (geoJson) return L.geoJSON(geoJson).getBounds();
    return null;
  }, [municipalityFeature, geoJson]);

  const placePin = useCallback(
    (point, { announce = true } = {}) => {
      let target = point;
      let distance = null;

      if (snapLines.length > 0) {
        const nearest = nearestPointOnPolylines(point, snapLines);
        if (nearest) {
          distance = nearest.distanceMeters;
          if (snapEnabled && nearest.distanceMeters <= SNAP_RADIUS_M) {
            target = nearest.point;
            if (announce) {
              setNotice({
                tone: "info",
                text: `Snapped to the coastline (moved ${Math.round(nearest.distanceMeters)} m).`,
              });
            }
          } else if (announce) {
            setNotice(null);
          }
        }
      } else if (announce) {
        setNotice(null);
      }

      onSnapDistanceChange?.(distance);
      onApplyBox(boxFromCenter(target, sizeMeters));

      // The municipality fit has to show a tall outline in a short wide panel, so it
      // lands far enough out that a 1.7 km box is a speck. Close in once there's a pin
      // to look at — but never pull back from a zoom the user chose themselves.
      const map = mapRef.current;
      if (map) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 });
    },
    [snapLines, snapEnabled, sizeMeters, onApplyBox, onSnapDistanceChange]
  );

  const handleSizeCommit = (meters) => {
    setDragSize(null);
    onSizeChange(meters);
    if (drawnBox) {
      const { center } = centerAndSizeFromBox(drawnBox);
      onApplyBox(boxFromCenter(center, meters));
    }
  };

  // Always snaps, regardless of the "Snap to coastline" toggle — the point of this
  // button is the objectively best box at the current spot, not to respect a setting
  // that exists for when the admin wants an offshore/inland box on purpose.
  const handleBestBox = () => {
    if (!drawnBox || snapLines.length === 0) return;
    const { center } = centerAndSizeFromBox(drawnBox);
    const nearest = nearestPointOnPolylines(center, snapLines);
    const target = nearest ? nearest.point : center;
    const fittedSize = estimateFittedSizeMeters(target, snapLines);

    onSnapDistanceChange?.(nearest ? nearest.distanceMeters : null);
    onSizeChange(fittedSize);
    onApplyBox(boxFromCenter(target, fittedSize));
    setNotice({ tone: "info", text: `Sized to fit the coastline here (${fittedSize.toLocaleString()} m).` });

    const map = mapRef.current;
    if (map) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 });
  };

  const handleLocate = () => {
    setNotice(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const inBataan =
          longitude >= BATAAN_BBOX.west && longitude <= BATAAN_BBOX.east &&
          latitude >= BATAAN_BBOX.south && latitude <= BATAAN_BBOX.north;
        if (!inBataan) {
          // Jumping the pin to wherever they actually are would wipe the typed bounds.
          setNotice({ tone: "warn", text: "You appear to be outside Bataan, so the pin was left where it is." });
          return;
        }
        placePin([latitude, longitude], { announce: false });
        setNotice(
          accuracy > 500
            ? { tone: "warn", text: `Located you to within about ${Math.round(accuracy)} m — check the pin before generating.` }
            : { tone: "info", text: "Pin moved to your current location." }
        );
      },
      (err) => {
        setLocating(false);
        setNotice({
          tone: "warn",
          text:
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. You can still drop the pin by clicking the map."
              : "Couldn't get your location. Drop the pin by clicking the map instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const previewBox =
    dragSize != null && drawnBox
      ? boxFromCenter(centerAndSizeFromBox(drawnBox).center, dragSize)
      : drawnBox;

  const metrics = previewBox ? centerAndSizeFromBox(previewBox) : null;
  const mpp = previewBox ? effectiveMetersPerPixel(previewBox) : null;
  const quality = mpp != null ? resolutionQuality(mpp) : null;

  // Cheap enough (49 point-in-polygon tests) to compute directly each render, matching
  // metrics/mpp/quality above rather than adding a memo the compiler can't verify is safe.
  const landFraction = previewBox ? estimateLandFraction(previewBox, landRings) : null;
  // The form owns validation, so it needs this the same way it already gets snapLines.
  useEffect(() => {
    onLandFractionChange?.(landFraction);
  }, [landFraction, onLandFractionChange]);

  const geolocationSupported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const secure = typeof window !== "undefined" && window.isSecureContext;

  const rectBounds = previewBox
    ? [
        [previewBox.latMin, previewBox.lonMin],
        [previewBox.latMax, previewBox.lonMax],
      ]
    : null;

  return (
    <section className="aoi-picker" id="ndwi-aoi-picker">
      <div className="aoi-picker-head">
        <div>
          <h4 className="aoi-picker-title">Pick the area on the map</h4>
          <p className="aoi-picker-sub">
            {landlocked
              ? "This municipality has no coastline to generate against."
              : municipality
                ? "Click the coast to drop a pin. The box around it is what gets analysed."
                : "Select a municipality above to start pinning."}
          </p>
        </div>
        <div className="aoi-picker-head-actions">
          <label className="aoi-snap-toggle">
            <InputSwitch checked={snapEnabled} onChange={(e) => setSnapEnabled(e.value)} />
            <span>Snap to coastline</span>
          </label>
          <Button
            type="button"
            label="Best Box"
            icon="pi pi-sparkles"
            outlined
            size="small"
            disabled={!drawnBox || snapLines.length === 0 || landlocked}
            tooltip="Snaps to the coastline and sizes the box to fit it here — ignores the Snap toggle above."
            tooltipOptions={{ position: "top" }}
            onClick={handleBestBox}
          />
          <Button
            type="button"
            label={isSatellite ? "Street map" : "Satellite"}
            icon="pi pi-globe"
            outlined
            size="small"
            onClick={() => setIsSatellite((v) => !v)}
          />
          {geolocationSupported && (
            <Button
              type="button"
              label="Use my location"
              icon="pi pi-map-marker"
              outlined
              size="small"
              loading={locating}
              disabled={!municipality || !secure || landlocked}
              tooltip={!secure ? "Requires HTTPS — open the site on localhost or over HTTPS." : undefined}
              tooltipOptions={{ position: "top" }}
              onClick={handleLocate}
            />
          )}
        </div>
      </div>

      <div className="aoi-picker-map" ref={containerRef}>
        {geoJsonError && <div className="aoi-picker-overlay">Couldn't load the Bataan boundary: {geoJsonError}</div>}
        {!municipality && !geoJsonError && (
          <div className="aoi-picker-overlay">Select a municipality above to drop a pin</div>
        )}
        {municipality && landlocked && !geoJsonError && (
          <div className="aoi-picker-overlay">No coastline available for this municipality</div>
        )}
        {geoJson && (
          <MapContainer
            ref={mapRef}
            center={[14.65, 120.42]}
            zoom={11}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <MapViewController bounds={fitBounds} containerRef={containerRef} />
            <MapClickHandler enabled={!!municipality && !landlocked} onPick={placePin} />

            {isSatellite ? (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
              />
            ) : (
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
            )}

            <GeoJSON
              key={municipality || "all"}
              data={geoJson}
              style={(feature) => {
                const isOwn =
                  municipality &&
                  feature.properties?.MUNICIPALI?.toUpperCase() === municipality.toUpperCase();
                return {
                  color: isOwn ? "#0077b6" : "#7aa7c7",
                  weight: isOwn ? 2 : 1,
                  opacity: isOwn ? 0.9 : 0.35,
                  fillOpacity: 0,
                  interactive: false,
                };
              }}
            />

            {snapLines.map((line, i) => (
              <Polyline
                key={`coast-${i}`}
                positions={line}
                pathOptions={{ color: "#38bdf8", weight: 2, opacity: 0.85, interactive: false }}
              />
            ))}

            {rectBounds && (
              <Rectangle
                bounds={rectBounds}
                pathOptions={{
                  color: box ? "#c1440e" : "#c1440e99",
                  weight: 2,
                  dashArray: box ? null : "6 6",
                  fillColor: "#c1440e",
                  fillOpacity: 0.12,
                  interactive: false,
                }}
              />
            )}

            {previewBox && (
              <Marker
                position={centerAndSizeFromBox(previewBox).center}
                icon={pinIcon}
                draggable={!!municipality && !landlocked}
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    placePin([lat, lng]);
                  },
                }}
              />
            )}
          </MapContainer>
        )}
      </div>

      <div className="aoi-picker-controls">
        <div className="aoi-size-row">
          <label className="aoi-size-label" htmlFor="aoi-size-slider">Box size</label>
          <Slider
            id="aoi-size-slider"
            className="aoi-size-slider"
            value={dragSize ?? sizeMeters}
            min={SLIDER_MIN_METERS}
            max={SLIDER_MAX_METERS}
            step={50}
            disabled={!drawnBox}
            onChange={(e) => setDragSize(e.value)}
            onSlideEnd={(e) => handleSizeCommit(e.value)}
            // PrimeReact's Slider fires onChange but not onSlideEnd for arrow keys.
            onBlur={() => dragSize != null && handleSizeCommit(dragSize)}
          />
          <div className="aoi-presets">
            {PRESETS.map((p) => (
              <button
                key={p.meters}
                type="button"
                className={`aoi-preset${sizeMeters === p.meters ? " is-active" : ""}`}
                disabled={!drawnBox}
                onClick={() => handleSizeCommit(p.meters)}
              >
                {p.label}
                {p.recommended && <span className="aoi-preset-star" aria-hidden="true">★</span>}
              </button>
            ))}
          </div>
        </div>

        {metrics && (
          <p className={`aoi-readout tone-${quality}`}>
            <strong>{Math.round(metrics.widthMeters).toLocaleString()} m × {Math.round(metrics.heightMeters).toLocaleString()} m</strong>
            <span className="aoi-readout-sep">·</span>
            <strong>{mpp.toFixed(1)} m per pixel</strong>
            <span className="aoi-readout-sep">·</span>
            <span className="aoi-readout-quality">{QUALITY_LABEL[quality]}</span>
          </p>
        )}

        <p className="aoi-picker-note">
          Every image is resampled to a {TRACE_SIZE}×{TRACE_SIZE} grid before the shoreline is traced,
          so a bigger box means a coarser measurement.
        </p>
      </div>

      {(errors.length > 0 || warnings.length > 0 || notice) && (
        <ul className="aoi-messages">
          {errors.map((e) => (
            <li key={e.code} className="aoi-message tone-error">
              <i className="pi pi-times-circle" aria-hidden="true" />
              <span>{e.message}</span>
            </li>
          ))}
          {warnings.map((w) => (
            <li key={w.code} className="aoi-message tone-warn">
              <i className="pi pi-exclamation-triangle" aria-hidden="true" />
              <span>{w.message}</span>
              {w.code === "AREA_DIVERGENCE" && onRestoreStoredBounds && (
                <Button
                  type="button"
                  label="Restore stored bounds"
                  link
                  size="small"
                  className="aoi-message-action"
                  onClick={onRestoreStoredBounds}
                />
              )}
            </li>
          ))}
          {notice && (
            <li className={`aoi-message tone-${notice.tone}`}>
              <i className={notice.tone === "warn" ? "pi pi-exclamation-triangle" : "pi pi-info-circle"} aria-hidden="true" />
              <span>{notice.text}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
