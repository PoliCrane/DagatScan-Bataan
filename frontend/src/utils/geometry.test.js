import { describe, expect, test } from "vitest";
import {
  metersPerDegreeLon,
  seawardUnitNormals,
  offsetCoastlineSeaward,
  haversineMeters,
} from "./geometry";

const westCoast = [
  [14.7, 120.25],
  [14.68, 120.25],
  [14.66, 120.25],
];
const eastCoast = [
  [14.7, 120.55],
  [14.68, 120.55],
  [14.66, 120.55],
];

describe("geometry", () => {
  test("seaward normal points west on the west coast", () => {
    expect(seawardUnitNormals(westCoast)[1][1]).toBeLessThan(-0.9);
  });

  test("seaward normal points east on the east coast", () => {
    expect(seawardUnitNormals(eastCoast)[1][1]).toBeGreaterThan(0.9);
  });

  test("longitude degree length uses cos(latitude)", () => {
    expect(metersPerDegreeLon(14.7)).toBeLessThan(metersPerDegreeLon(0));
    expect(metersPerDegreeLon(14.7)).toBeCloseTo(107676, -3);
  });

  test("negative offset moves the west coast inland (east)", () => {
    const moved = offsetCoastlineSeaward(westCoast, -100);
    expect(moved[1][1]).toBeGreaterThan(westCoast[1][1]);
  });

  test("short input returns empty array", () => {
    expect(offsetCoastlineSeaward([[14.7, 120.25]], 10)).toEqual([]);
    expect(offsetCoastlineSeaward(null, 10)).toEqual([]);
  });

  test("haversine matches a known distance", () => {
    expect(haversineMeters([14.7, 120.25], [14.7, 120.26])).toBeCloseTo(1076, -1);
  });
});
