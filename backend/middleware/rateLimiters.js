const rateLimit = require("express-rate-limit");

// Applies to /login. Keyed by IP, not by the submitted email, so it also
// caps distributed guesses against a single account from one source.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

// Covers both halves of the reset flow: requesting a code and redeeming
// one. The 6-digit code is only ~1M possibilities, so this is what actually
// caps brute-forcing it within its 30-minute validity window.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts. Please try again later." },
});

const accountRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many account requests. Please try again later." },
});

// Generous global backstop against floods/scrapers — the map UI legitimately polls
// job status and loads many segments, so this must stay well above normal usage.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

module.exports = { loginLimiter, passwordResetLimiter, accountRequestLimiter, apiLimiter };
