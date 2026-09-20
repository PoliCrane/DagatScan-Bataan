import { describe, expect, test } from "vitest";
import { parseDMSOrDecimal, formatDeg } from "./coordinates";

describe("parseDMSOrDecimal", () => {
  test("reads plain decimal degrees", () => {
    expect(parseDMSOrDecimal("14.542886")).toBeCloseTo(14.542886, 6);
    expect(parseDMSOrDecimal("120.3816")).toBeCloseTo(120.3816, 6);
    expect(parseDMSOrDecimal("-14.5")).toBeCloseTo(-14.5, 6);
  });

  test("reads symbol-based DMS, applying S/W as negative", () => {
    expect(parseDMSOrDecimal("14°32'34.39\"N")).toBeCloseTo(14 + 32 / 60 + 34.39 / 3600, 6);
    expect(parseDMSOrDecimal("120°22'53.66\"E")).toBeCloseTo(120 + 22 / 60 + 53.66 / 3600, 6);
    expect(parseDMSOrDecimal("14°32'34.39\"S")).toBeCloseTo(-(14 + 32 / 60 + 34.39 / 3600), 6);
  });

  test("reads raw concatenated DMS", () => {
    // 143234.87 -> 14 deg, 32 min, 34.87 sec
    expect(parseDMSOrDecimal("143234.87")).toBeCloseTo(14 + 32 / 60 + 34.87 / 3600, 6);
  });

  test("rejects unparseable input", () => {
    expect(parseDMSOrDecimal("")).toBeNull();
    expect(parseDMSOrDecimal(null)).toBeNull();
    expect(parseDMSOrDecimal("not a coordinate")).toBeNull();
    expect(parseDMSOrDecimal("1.2.3")).toBeNull();
  });
});

describe("formatDeg", () => {
  test("writes six decimals without float noise or exponent notation", () => {
    expect(formatDeg(14.600000000000001)).toBe("14.600000");
    expect(formatDeg(0.0000001)).toBe("0.000000");
    expect(formatDeg(120.3816)).toBe("120.381600");
  });

  // The map writes text the form must be able to read back, so these two have to agree.
  test("round-trips through parseDMSOrDecimal", () => {
    for (const n of [14.6, 120.3816, 14.564557, -14.5, 120.5, 14.999999]) {
      expect(parseDMSOrDecimal(formatDeg(n))).toBeCloseTo(n, 6);
    }
  });

  test("a formatted value never falls into the raw-DMS branch", () => {
    // "120.381600" has only 3 digits before the dot, so the 5-7 digit raw-DMS regex
    // can't claim it — this is what makes the round-trip above safe.
    expect(parseDMSOrDecimal(formatDeg(120.3816))).toBeCloseTo(120.3816, 6);
    expect(parseDMSOrDecimal(formatDeg(14.5))).toBeCloseTo(14.5, 6);
  });
});
