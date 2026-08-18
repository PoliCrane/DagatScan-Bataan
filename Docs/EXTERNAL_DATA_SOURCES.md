# External Data Sources — Status and Usage

## Implemented and populated (run once, refresh yearly)

`node scripts/fetchEventContext.js [startYear] [endYear]` builds
`backend/data/eventContext.json` from three free sources (verified live 2026-08-18):

| Source | What it provides | Status |
|---|---|---|
| NOAA IBTrACS v04r01 (G1) | Typhoon tracks passing the Bataan box, per year, with peak winds | ✅ e.g. 2020 = GONI (Rolly) + VAMCO (Ulysses), Nov |
| NOAA CPC ONI (G3) | ENSO state per year (El Niño / La Niña / Neutral + anomaly) | ✅ e.g. 2020 = La Niña (peak −1.11) |
| Open-Meteo Marine Archive (G2) | Max/mean wave height + rough-sea days at a Bataan offshore point | ✅ from ~2021 (archive limit; earlier years stay null) |

Served at `GET /api/shoreline/context/:year` (public). Defense use: "why did the
shoreline jump in 2020?" → the endpoint answers with the two typhoons and the La Niña
state. UI integration into the erosion-analysis year view is planned with the Phase 6
redesign; until then the data is available via the API and the thesis tables.

Commit `backend/data/eventContext.json` after running so the deployment has it.

## To cite / acquire manually (no API)

- **G4 PAGASA annual tropical cyclone reports** — for local storm names in the thesis text.
- **G5 PSMSL Manila tide gauge** (station: Manila South Harbor) — CSV download; pair with
  Rodolfo & Siringan (2006) on Manila Bay subsidence for the strongest "why chronic
  erosion" argument. https://psmsl.org/data/obtaining/
- **G6 Deltares ShorelineMonitor / Luijendijk et al. 2018** — global transect rates
  (Landsat 1984–2016) including the PH coast; download and compare against this system's
  rates as independent validation (pairs with the CoastSat benchmark, item C3).
- **G8 Global Mangrove Watch** — mangrove extent change overlays; erosion driver context.
- **G9 UP Project NOAH** (noah.up.edu.ph) — storm-surge hazard maps; cross-reference the
  Very High tier areas in the thesis.

## Wired to future features

- **G7 JRC Global Surface Water** (`JRC/GSW1_4` in the GEE catalog) — independent
  land-loss corroboration; add alongside NDWI generation when Earth Engine credentials
  are available for testing.
- **G10 OSM Overpass API** — buildings/roads for the affected-infrastructure overlay (F1).
- **G11 PSA OpenSTAT** — barangay population for exposure estimates (F2).
- **G12 NAMRIA tide predictions** — input for the tidal correction utility
  (`services/tidalCorrection.js`, see TIDAL_CORRECTION_GUIDE.md).
