const { offsetCoastlineSeaward } = require("./geoUtils");

const DEFAULT_BEACH_SLOPE_DEGREES = 3;

// Horizontal shoreline displacement caused by the tide: a waterline observed at tide
// level h (meters relative to the target datum, positive = higher water) sits
// h / tan(slope) meters LANDWARD of the datum shoreline on a beach with the given slope.
function horizontalTideDisplacementMeters(tideLevelMeters, beachSlopeDegrees = DEFAULT_BEACH_SLOPE_DEGREES) {
  const slopeRad = (beachSlopeDegrees * Math.PI) / 180;
  const tan = Math.tan(slopeRad);
  if (!isFinite(tan) || tan <= 0) {
    throw new Error("beachSlopeDegrees must be a positive angle");
  }
  return tideLevelMeters / tan;
}

// Corrects an observed waterline to the reference datum: an observation taken at high
// water (positive tideLevelMeters) is pushed back SEAWARD by the displacement, so
// shorelines from different tide stages become comparable.
// points: [[lat,lng],...]; returns the corrected copy.
function correctShorelineToDatum(points, tideLevelMeters, beachSlopeDegrees = DEFAULT_BEACH_SLOPE_DEGREES) {
  const displacement = horizontalTideDisplacementMeters(tideLevelMeters, beachSlopeDegrees);
  return offsetCoastlineSeaward(points, displacement);
}

module.exports = {
  horizontalTideDisplacementMeters,
  correctShorelineToDatum,
  DEFAULT_BEACH_SLOPE_DEGREES,
};
