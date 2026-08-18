const fs = require("fs");
const path = require("path");
const readline = require("readline");
const https = require("https");

const OUT_PATH = path.join(__dirname, "../data/eventContext.json");
const START_YEAR = parseInt(process.argv[2], 10) || 2015;
const END_YEAR = parseInt(process.argv[3], 10) || new Date().getFullYear();

const BATAAN_BOX = { latMin: 13.8, latMax: 15.4, lonMin: 119.2, lonMax: 121.2 };
const WAVE_POINT = { lat: 14.6, lon: 120.2 };
const IBTRACS_URL =
  "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.WP.list.v04r01.csv";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

async function fetchOni() {
  const text = await fetchText("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt");
  const byYear = {};
  for (const line of text.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const year = parseInt(parts[1], 10);
    const anom = parseFloat(parts[3]);
    if (!Number.isFinite(year) || !Number.isFinite(anom)) continue;
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(anom);
  }
  const result = {};
  for (const [year, anoms] of Object.entries(byYear)) {
    const mean = anoms.reduce((a, b) => a + b, 0) / anoms.length;
    const peak = anoms.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    result[year] = {
      meanAnomaly: parseFloat(mean.toFixed(2)),
      peakAnomaly: parseFloat(peak.toFixed(2)),
      state: peak >= 0.5 ? "El Niño" : peak <= -0.5 ? "La Niña" : "Neutral",
    };
  }
  return result;
}

async function fetchWaves(year) {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${WAVE_POINT.lat}&longitude=${WAVE_POINT.lon}` +
    `&start_date=${year}-01-01&end_date=${year}-12-31&daily=wave_height_max&timezone=Asia%2FManila`;
  const data = JSON.parse(await fetchText(url));
  const heights = (data.daily?.wave_height_max || []).filter((v) => v !== null);
  if (heights.length === 0) return null;
  const max = Math.max(...heights);
  const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
  const daysOver2m = heights.filter((h) => h >= 2).length;
  return {
    maxWaveM: parseFloat(max.toFixed(2)),
    meanWaveM: parseFloat(mean.toFixed(2)),
    daysOver2m,
  };
}

function fetchTyphoons() {
  return new Promise((resolve, reject) => {
    const byYearStorm = new Map();
    https
      .get(IBTRACS_URL, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`IBTrACS -> HTTP ${res.statusCode}`));
        const rl = readline.createInterface({ input: res });
        let header = null;
        rl.on("line", (line) => {
          if (!header) {
            header = line.split(",");
            return;
          }
          const cols = line.split(",");
          const season = parseInt(cols[1], 10);
          if (!Number.isFinite(season) || season < START_YEAR || season > END_YEAR) return;
          const name = cols[5];
          const isoTime = cols[6];
          const lat = parseFloat(cols[8]);
          const lon = parseFloat(cols[9]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          if (
            lat < BATAAN_BOX.latMin || lat > BATAAN_BOX.latMax ||
            lon < BATAAN_BOX.lonMin || lon > BATAAN_BOX.lonMax
          ) return;
          const key = `${season}-${name}`;
          if (!byYearStorm.has(key)) {
            byYearStorm.set(key, {
              year: season,
              name: name && name !== "NOT_NAMED" ? name : "Unnamed storm",
              month: parseInt((isoTime || "").split("-")[1], 10) || null,
              maxWindKt: 0,
            });
          }
          const wind = parseFloat(cols[23]);
          if (Number.isFinite(wind)) {
            const storm = byYearStorm.get(key);
            storm.maxWindKt = Math.max(storm.maxWindKt, wind);
          }
        });
        rl.on("close", () => resolve([...byYearStorm.values()]));
      })
      .on("error", reject);
  });
}

async function main() {
  console.log(`Building event context for ${START_YEAR}-${END_YEAR}...`);
  const years = {};
  for (let y = START_YEAR; y <= END_YEAR; y++) years[y] = { typhoons: [], enso: null, waves: null };

  console.log("Fetching ONI (ENSO) index...");
  const oni = await fetchOni();
  for (const y of Object.keys(years)) {
    if (oni[y]) years[y].enso = oni[y];
  }

  console.log("Fetching wave climate per year (Open-Meteo marine archive)...");
  for (const y of Object.keys(years)) {
    try {
      years[y].waves = await fetchWaves(y);
      console.log(`  ${y}: max wave ${years[y].waves?.maxWaveM ?? "?"} m`);
    } catch (err) {
      console.warn(`  ${y}: wave fetch failed — ${err.message}`);
    }
  }

  console.log("Streaming IBTrACS typhoon tracks (large file, may take a few minutes)...");
  try {
    const storms = await fetchTyphoons();
    for (const storm of storms) {
      if (years[storm.year]) years[storm.year].typhoons.push(storm);
    }
    console.log(`  ${storms.length} storms passed within the Bataan box.`);
  } catch (err) {
    console.warn(`IBTrACS fetch failed (${err.message}) — typhoon lists will be empty; re-run later.`);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        boundingBox: BATAAN_BOX,
        wavePoint: WAVE_POINT,
        sources: {
          typhoons: "NOAA IBTrACS v04r01 (WP basin)",
          enso: "NOAA CPC Oceanic Niño Index",
          waves: "Open-Meteo Marine Archive (ERA5)",
        },
        years,
      },
      null,
      2
    )
  );
  console.log(`Written: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Event context build failed:", err);
  process.exit(1);
});
