const { test } = require("node:test");
const assert = require("node:assert");
const {
  classifyErosionRisk,
  classifyShorelineStatus,
  STABLE_BAND_M_PER_YEAR,
} = require("../services/riskClassification");
const { meetsPasswordRequirements, escapeHtml, USERNAME_REGEX } = require("../utils/validators");

test("risk tiers follow the negative-is-erosion convention", () => {
  assert.strictEqual(classifyErosionRisk(-6), "VERY_HIGH");
  assert.strictEqual(classifyErosionRisk(-2), "HIGH");
  assert.strictEqual(classifyErosionRisk(0), "MODERATE");
  assert.strictEqual(classifyErosionRisk(2), "LOW");
  assert.strictEqual(classifyErosionRisk(6), "VERY_LOW");
  assert.strictEqual(classifyErosionRisk(null), "NO_DATA");
  assert.strictEqual(classifyErosionRisk("abc"), "NO_DATA");
});

test("tier boundaries are inclusive on the erosion side", () => {
  assert.strictEqual(classifyErosionRisk(-5), "VERY_HIGH");
  assert.strictEqual(classifyErosionRisk(-1), "HIGH");
  assert.strictEqual(classifyErosionRisk(0.99), "MODERATE");
  assert.strictEqual(classifyErosionRisk(1), "LOW");
  assert.strictEqual(classifyErosionRisk(5), "VERY_LOW");
});

test("shoreline status uses the stable band", () => {
  assert.strictEqual(classifyShorelineStatus(-(STABLE_BAND_M_PER_YEAR + 0.01)), "EROSION");
  assert.strictEqual(classifyShorelineStatus(STABLE_BAND_M_PER_YEAR + 0.01), "ACCRETION");
  assert.strictEqual(classifyShorelineStatus(0), "STABLE");
  assert.strictEqual(classifyShorelineStatus(0.4), "STABLE");
  assert.strictEqual(classifyShorelineStatus(-0.4), "STABLE");
  assert.strictEqual(classifyShorelineStatus(undefined), "NO_DATA");
});

test("password requirements enforce complexity", () => {
  assert.strictEqual(meetsPasswordRequirements("Str0ng!Pass"), true);
  assert.strictEqual(meetsPasswordRequirements("weakpass"), false);
  assert.strictEqual(meetsPasswordRequirements("Short1!"), false);
  assert.strictEqual(meetsPasswordRequirements("NOLOWER123!"), false);
});

test("escapeHtml neutralizes markup", () => {
  assert.strictEqual(escapeHtml('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.strictEqual(escapeHtml(null), "");
});

test("username regex accepts names and rejects markup", () => {
  assert.strictEqual(USERNAME_REGEX.test("Juan Dela Cruz Jr."), true);
  assert.strictEqual(USERNAME_REGEX.test("Ma. Peñaflorida-Reyes"), true);
  assert.strictEqual(USERNAME_REGEX.test("<script>"), false);
  assert.strictEqual(USERNAME_REGEX.test("a"), false);
});
