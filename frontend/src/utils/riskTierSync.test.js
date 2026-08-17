import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import { classifyErosionRisk as classifyFrontend } from "./segmentData";
import { getShorelineStatus, STABLE_BAND_M_PER_YEAR } from "./eprUtils";

const require = createRequire(import.meta.url);
const backend = require("../../../backend/services/riskClassification.js");

const SAMPLE_RATES = [];
for (let r = -8; r <= 8; r += 0.25) SAMPLE_RATES.push(parseFloat(r.toFixed(2)));

describe("frontend and backend classification stay in sync", () => {
  test("risk tiers agree for every sampled rate", () => {
    for (const rate of SAMPLE_RATES) {
      expect(classifyFrontend(rate), `rate=${rate}`).toBe(backend.classifyErosionRisk(rate));
    }
  });

  test("stable band width matches the backend", () => {
    expect(STABLE_BAND_M_PER_YEAR).toBe(backend.STABLE_BAND_M_PER_YEAR);
  });

  test("shoreline status agrees with the backend convention", () => {
    const map = { EROSION: "Erosion", ACCRETION: "Accretion", STABLE: "Stable" };
    for (const rate of SAMPLE_RATES) {
      expect(getShorelineStatus(rate), `rate=${rate}`).toBe(map[backend.classifyShorelineStatus(rate)]);
    }
  });
});
