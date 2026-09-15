const PLAUSIBLE_MAX_RATE_M_PER_YEAR = 20;
// RSS positional uncertainty of a single yearly shoreline position (Docs/ERROR_BUDGET.md:
// grid/trace ~±40 m, tide residual ~±15 m, season ~±10 m, sensor ~±10 m). Comparing two
// years differences two independent positions, so that comparison carries sigma * sqrt(2).
const POSITION_NOISE_SIGMA_M = 45;
const STABLE_BAND_M_PER_YEAR = 0.5;
const MIN_YEARS_FOR_LRR = 3;
const MIN_YEARS_FOR_HINDCAST = 5;
const HINDCAST_HOLDOUT_YEARS = 2;
const JWT_EXPIRY = "1h";
const PASSWORD_RESET_CODE_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

module.exports = {
  PLAUSIBLE_MAX_RATE_M_PER_YEAR,
  POSITION_NOISE_SIGMA_M,
  STABLE_BAND_M_PER_YEAR,
  MIN_YEARS_FOR_LRR,
  MIN_YEARS_FOR_HINDCAST,
  HINDCAST_HOLDOUT_YEARS,
  JWT_EXPIRY,
  PASSWORD_RESET_CODE_TTL_MS,
  PASSWORD_RESET_MAX_ATTEMPTS,
};
