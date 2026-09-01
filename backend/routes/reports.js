/** Generates a PDF assessment report on the fly for a given shoreline zone record. */

const logger = require("../utils/logger");
const express = require("express");
const path = require("path");
const PDFDocument = require("pdfkit");
const pool = require("../db");
const { extractCoordinatesFromGeoJSON } = require("../services/eprAutoCalculator");
const { renderShorelineMap } = require("../services/staticMap");
const { classifyErosionRisk, RISK_COLORS, RISK_LABELS } = require("../services/riskClassification");

const router = express.Router();

// Same fixed shoreline colors as the Erosion Analysis legend (ErosionLegend.jsx) so the PDF matches the live app.
const PREVIOUS_SHORELINE_COLOR = "#FFEA00";
const CURRENT_SHORELINE_COLOR = "#FF3131";
const EROSION_AREA_COLOR = "#fc4c00";

// Report palette/typography — same design tokens the live app uses in light contexts
// (frontend/src/styles/app.css), not the dark "Deep Survey" theme: a printed report
// needs a light background, so this borrows the accent color and type system rather
// than the dark chrome itself.
const INK = "#0b1a2b"; // --color-ink
const MUTED = "#4a5b6c"; // --color-muted
const PRIMARY = "#0077b6"; // --color-primary
const LINE = "#dde5ec"; // --color-line
const BAND_BG = "#eaf6fb"; // pale cyan tint for section header bands / map placeholder
const MAP_BORDER = "#c2e4fd";

// Real static TTFs, not @fontsource's woff2 files — fontkit's WOFF2 subset/embedding path
// hits an internal encoder bug in this environment (crashes/renders blank text), confirmed
// by testing plain TTF embedding side by side, which works correctly.
const FONTS = {
  body: path.join(__dirname, "../assets/fonts/Mulish-Regular.ttf"),
  bodyBold: path.join(__dirname, "../assets/fonts/Mulish-Bold.ttf"),
  display: path.join(__dirname, "../assets/fonts/InstrumentSerif-Regular.ttf"),
};
const LOGO_PATH = path.join(__dirname, "../assets/DSLogo.png");

const EVENT_CONTEXT_MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same cache-on-first-read pattern as GET /api/shoreline/context/:year (shorelineData.js) —
// same underlying file, so the PDF's "What Happened in {year}" section matches the live card.
let eventContextCache = null;
function getEventContextForYear(year) {
  if (!eventContextCache) {
    const contextPath = require("path").join(__dirname, "../data/eventContext.json");
    if (!require("fs").existsSync(contextPath)) return null;
    eventContextCache = JSON.parse(require("fs").readFileSync(contextPath, "utf8"));
  }
  return eventContextCache.years?.[year] || null;
}

// Bounding box (with padding) from [lon, lat] coordinate arrays; used when no stored image bounds exist.
function bboxFromCoordinateSets(coordinateSets, paddingRatio = 0.2) {
  const points = coordinateSets.flat();
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const lonPad = (maxLon - minLon) * paddingRatio || 0.003;
  const latPad = (maxLat - minLat) * paddingRatio || 0.003;
  return { west: minLon - lonPad, east: maxLon + lonPad, south: minLat - latPad, north: maxLat + latPad };
}

// Projects [lon, lat] coordinate arrays into a pixel box, preserving aspect ratio, north = up.
function projectCoordinateSets(coordinateSets, box) {
  const points = coordinateSets.flat();
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const lonRange = maxLon - minLon || 0.0001;
  const latRange = maxLat - minLat || 0.0001;
  const padding = 16;
  const innerW = box.w - padding * 2;
  const innerH = box.h - padding * 2;
  const scale = Math.min(innerW / lonRange, innerH / latRange);
  const offsetX = box.x + padding + (innerW - lonRange * scale) / 2;
  const offsetY = box.y + padding + (innerH - latRange * scale) / 2;

  const project = ([lon, lat]) => [
    offsetX + (lon - minLon) * scale,
    offsetY + (maxLat - lat) * scale,
  ];

  return coordinateSets.map((coords) => coords.map(project));
}

function buildInterpretation({ specificArea, baselineYear, year, erosionRate, riskLevel }) {
  if (erosionRate === null || erosionRate === undefined) {
    return `${specificArea} is currently the baseline year on record (${year}). An erosion rate will be available once a later satellite-detected shoreline is uploaded for comparison.`;
  }

  const trend = erosionRate < 0 ? "experienced shoreline retreat" : "showed shoreline stability or growth";
  const riskLabel = riskLevel === "NO_DATA" ? "No Data" : `${RISK_LABELS[riskLevel] || riskLevel} Risk`;
  const fromTo = baselineYear && baselineYear !== year ? ` from ${baselineYear} to ${year}` : ` in ${year}`;

  return `The selected coastal area (${specificArea})${fromTo} ${trend}. Based on the calculated erosion rate of ${Math.abs(erosionRate).toFixed(2)} m/year, the area is classified as ${riskLabel}.`;
}

// Helmet's defaults (X-Frame-Options: SAMEORIGIN, CSP frame-ancestors 'self') block the
// frontend's inline <iframe> preview since it's a different origin from this API. Applied as
// middleware (not just on the success path) so it covers every response on this route,
// including the 400/404/500 branches below — scoped to the actual frontend origin, not a wildcard.
router.use("/:zoneId/pdf", (req, res, next) => {
  const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${frontendOrigin}`);
  next();
});

// Streams a generated PDF assessment report for a single shoreline zone record.
router.get("/:zoneId/pdf", async (req, res) => {
  try {
    const { zoneId } = req.params;
    if (!/^\d+$/.test(zoneId)) {
      return res.status(400).json({ error: "zoneId must be a positive integer" });
    }

    const query = `
      SELECT
        sz.id,
        sz.area_id,
        ca.municipality_id,
        m.name as municipality,
        sz.year,
        sz.erosion_rate,
        sz.cumulative_erosion,
        sz.data_quality,
        sz.source_type,
        ca.name as specific_area,
        sz.geojson_data
      FROM shoreline_zones sz
      JOIN coastal_areas ca ON sz.area_id = ca.id
      JOIN municipalities m ON ca.municipality_id = m.id
      WHERE sz.id = $1
    `;
    const result = await pool.query(query, [zoneId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report record not found" });
    }

    const row = result.rows[0];
    const erosionRate = row.erosion_rate !== null ? parseFloat(row.erosion_rate) : null;
    const riskLevel = classifyErosionRisk(erosionRate);
    const specificArea = row.specific_area || `Zone ${row.id}`;

    // baseline zone (earliest year) is the "previous shoreline"; run concurrently with the imagery lookup
    const [baselineResult, imageryResult] = await Promise.all([
      pool.query(
        `SELECT year, geojson_data
         FROM shoreline_zones
         WHERE area_id = $1 AND erosion_rate IS NULL
         ORDER BY year ASC LIMIT 1`,
        [row.area_id]
      ),
      pool.query(
        `SELECT bounds FROM satellite_imagery WHERE area_id = $1 AND year = $2 LIMIT 1`,
        [row.area_id, row.year]
      ),
    ]);
    const baselineRow = baselineResult.rows[0] || null;

    const currentCoords = extractCoordinatesFromGeoJSON(row.geojson_data);
    const baselineCoords = baselineRow ? extractCoordinatesFromGeoJSON(baselineRow.geojson_data) : null;

    // prefer the actual satellite image's bounds so the basemap lines up with what was
    // analyzed; fall back to a padded box around the shoreline coordinates
    let mapBounds = null;
    if (imageryResult.rows[0]?.bounds) {
      mapBounds = imageryResult.rows[0].bounds;
    } else if (currentCoords && currentCoords.length > 1) {
      mapBounds = bboxFromCoordinateSets(baselineCoords ? [currentCoords, baselineCoords] : [currentCoords]);
    }

    const generatedOn = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const filename = `Coastal-Erosion-Assessment-${row.municipality}-${row.year}-${row.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    doc.registerFont("Body", FONTS.body);
    doc.registerFont("Body-Bold", FONTS.bodyBold);
    doc.registerFont("Display", FONTS.display);

    // Masthead
    const mastheadTop = doc.y;
    try {
      doc.image(LOGO_PATH, doc.page.width / 2 - 20, mastheadTop, { width: 40, height: 40 });
    } catch (logoErr) {
      logger.warn("Report logo failed to load:", logoErr.message);
    }
    doc.y = mastheadTop + 48;
    doc
      .fillColor(INK)
      .fontSize(24)
      .font("Display")
      .text("Coastal Erosion Assessment Report", { align: "center" });
    doc
      .fontSize(13)
      .fillColor(PRIMARY)
      .font("Body-Bold")
      .text(`Municipality of ${row.municipality}`, { align: "center" });
    doc.moveDown(0.2);
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .font("Body")
      .text("DagatScan Bataan — Coastal Erosion Monitoring System", { align: "center" });
    doc.moveDown(0.6);
    doc.strokeColor(PRIMARY).lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Section header: pale band + colored accent bar, echoing the app's card-header look
    const addSectionHeader = (title) => {
      doc.x = 50;
      doc.moveDown(0.4);
      const bandY = doc.y;
      const bandH = 22;
      doc.rect(50, bandY, 495, bandH).fill(BAND_BG);
      doc.rect(50, bandY, 4, bandH).fill(PRIMARY);
      doc
        .font("Body-Bold")
        .fontSize(11)
        .fillColor(INK)
        .text(title.toUpperCase(), 64, bandY + 6, { width: 470, characterSpacing: 1.2 });
      doc.y = bandY + bandH + 10;
    };

    // Label/value row: uppercase letter-spaced label + plain value, echoing .card-label/.card-value
    const addRow = (label, value, valueColor = INK) => {
      const y = doc.y;
      doc
        .font("Body-Bold")
        .fontSize(10)
        .fillColor(MUTED)
        .text(label.toUpperCase(), 50, y, { width: 180, characterSpacing: 0.6 });
      doc.font("Body").fontSize(11).fillColor(valueColor).text(value, 240, y, { width: 300 });
      doc.moveDown(0.8);
    };

    // Risk level as a bordered pill (colored border + text, no fill), echoing .card-value.risk-*
    const addRiskRow = (label, riskLabel, color) => {
      const y = doc.y;
      doc
        .font("Body-Bold")
        .fontSize(10)
        .fillColor(MUTED)
        .text(label.toUpperCase(), 50, y, { width: 180, characterSpacing: 0.6 });

      const pillText = riskLabel.toUpperCase();
      doc.font("Body-Bold").fontSize(9);
      const textW = doc.widthOfString(pillText);
      const padX = 10, pillH = 16;
      doc
        .roundedRect(240, y - 1, textW + padX * 2, pillH, pillH / 2)
        .lineWidth(1.2)
        .stroke(color);
      doc
        .fillColor(color)
        .text(pillText, 240 + padX, y + 3, { width: textW + 4, lineBreak: false, characterSpacing: 0.5 });

      doc.font("Body").fontSize(11);
      doc.moveDown(0.8);
    };

    // Municipality Information
    addSectionHeader("Municipality Information");
    addRow("Municipality Name:", row.municipality);
    addRow("Specific Area:", specificArea);
    addRow("Year Analyzed:", String(row.year));

    // Map
    addSectionHeader("Map");
    const mapBox = { x: 50, y: doc.y, w: 495, h: 240 };

    let mapImageBuffer = null;
    if (mapBounds && currentCoords && currentCoords.length > 1) {
      try {
        mapImageBuffer = await renderShorelineMap({
          bounds: mapBounds,
          lines: [
            baselineCoords && baselineCoords.length > 1
              ? { coords: baselineCoords, color: PREVIOUS_SHORELINE_COLOR, dashed: true, width: 4 }
              : null,
            { coords: currentCoords, color: CURRENT_SHORELINE_COLOR, width: 4.5 },
          ].filter(Boolean),
          fillRibbon:
            baselineCoords && baselineCoords.length > 1
              ? { points: [...currentCoords, ...[...baselineCoords].reverse()], color: EROSION_AREA_COLOR }
              : null,
          outputWidth: mapBox.w * 2,
          outputHeight: mapBox.h * 2,
        });
      } catch (mapErr) {
        // likely offline/tile server unreachable - fall back to plain vector rendering instead of failing
        logger.warn("Static basemap render failed, falling back to plain background:", mapErr.message);
      }
    }

    if (mapImageBuffer) {
      doc.image(mapImageBuffer, mapBox.x, mapBox.y, { width: mapBox.w, height: mapBox.h });
      doc.rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h).lineWidth(1).stroke(MAP_BORDER);
    } else {
      doc.rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h).fill(BAND_BG);
      doc.rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h).lineWidth(1).stroke(MAP_BORDER);

      if (currentCoords && currentCoords.length > 1) {
        const coordinateSets = baselineCoords && baselineCoords.length > 1
          ? [baselineCoords, currentCoords]
          : [currentCoords];
        const projected = projectCoordinateSets(coordinateSets, mapBox);
        const projBaseline = coordinateSets.length === 2 ? projected[0] : null;
        const projCurrent = coordinateSets.length === 2 ? projected[1] : projected[0];

        doc.save();
        doc.rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h).clip();

        if (projBaseline) {
          const ribbon = [...projCurrent, ...[...projBaseline].reverse()];
          doc.polygon(...ribbon);
          doc.fillColor(EROSION_AREA_COLOR, 0.35).fill();

          doc.moveTo(projBaseline[0][0], projBaseline[0][1]);
          for (const [x, y] of projBaseline.slice(1)) doc.lineTo(x, y);
          doc.dash(4, { space: 3 }).lineWidth(2).strokeColor(PREVIOUS_SHORELINE_COLOR, 1).stroke();
          doc.undash();
        }

        doc.moveTo(projCurrent[0][0], projCurrent[0][1]);
        for (const [x, y] of projCurrent.slice(1)) doc.lineTo(x, y);
        doc.lineWidth(2.5).strokeColor(CURRENT_SHORELINE_COLOR, 1).stroke();

        doc.restore();
      } else {
        doc.font("Body").fontSize(10).fillColor(MUTED).text(
          "No shoreline geometry available for this record.",
          mapBox.x + 16,
          mapBox.y + mapBox.h / 2 - 6,
          { width: mapBox.w - 32, align: "center" }
        );
      }
    }
    doc.y = mapBox.y + mapBox.h + 10;

    // Legend
    const legendY = doc.y;
    const legendItems = [
      baselineCoords ? { color: PREVIOUS_SHORELINE_COLOR, label: `Previous Shoreline (${baselineRow.year})` } : null,
      { color: CURRENT_SHORELINE_COLOR, label: `Current Shoreline (${row.year})` },
      baselineCoords ? { color: EROSION_AREA_COLOR, label: "Erosion / Change Area", faded: true } : null,
    ].filter(Boolean);

    let legendX = 50;
    legendItems.forEach((item) => {
      doc.save();
      doc.rect(legendX, legendY + 2, 14, 8).fillColor(item.color, item.faded ? 0.3 : 1).fill();
      doc.restore();
      doc.font("Body").fontSize(9).fillColor(MUTED).text(item.label, legendX + 20, legendY, { width: 160 });
      legendX += 175;
    });
    doc.x = 50;
    doc.y = legendY + 20;
    doc.moveDown(0.5);

    // Coastal Erosion Summary
    addSectionHeader("Coastal Erosion Summary");
    addRiskRow("Risk Level:", RISK_LABELS[riskLevel] || riskLevel, RISK_COLORS[riskLevel] || INK);
    addRow(
      "Erosion Rate:",
      erosionRate !== null ? `${erosionRate.toFixed(2)} m/year` : "No data (baseline year)"
    );

    // What Happened in {year} — ENSO/wave/typhoon context, when available for this year
    const eventContext = getEventContextForYear(String(row.year));
    if (eventContext && (eventContext.enso || eventContext.waves || (eventContext.typhoons || []).length > 0)) {
      addSectionHeader(`What Happened in ${row.year}`);
      if (eventContext.enso) {
        addRow("ENSO State:", eventContext.enso.state);
      }
      if (eventContext.waves) {
        addRow("Max Wave Height:", `${eventContext.waves.maxWaveM} m`);
      }
      if ((eventContext.typhoons || []).length > 0) {
        const typhoonList = eventContext.typhoons
          .map((t) => `${t.name}${t.month ? ` (${EVENT_CONTEXT_MONTHS[t.month]})` : ""}`)
          .join(", ");
        addRow("Typhoons Near Bataan:", typhoonList);
      }
    }

    // Interpretation
    addSectionHeader("Interpretation");
    const interpretation = buildInterpretation({
      specificArea,
      baselineYear: baselineRow?.year,
      year: row.year,
      erosionRate,
      riskLevel,
    });
    doc.font("Body").fontSize(10.5).fillColor(INK).text(interpretation, { align: "left", lineGap: 3 });

    doc.moveDown(1.5);
    doc.strokeColor(LINE).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.7);
    doc
      .font("Body")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Report generated on ${generatedOn}. Values are auto-computed from satellite-derived shoreline data using the End Point Rate (EPR) methodology.`);

    doc.end();
  } catch (err) {
    logger.error("Error generating report PDF:", err.message);
    res.status(500).json({ error: "Failed to generate report PDF", details: err.message });
  }
});

module.exports = router;
