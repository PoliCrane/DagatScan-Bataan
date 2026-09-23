const crypto = require("crypto");

// re-checked server-side so the frontend's rules can't be bypassed by calling the API directly
function meetsPasswordRequirements(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  );
}

const PASSWORD_REQUIREMENTS_MESSAGE =
  "Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character";

// Ambiguous glyphs (0/O, 1/l/I) are left out — these passwords get read off an email
// and retyped, so a character a recipient can misread costs a support round-trip.
// The specials also exclude & < > " so the value stays safe to drop straight into the
// HTML email body and the admin-facing confirmation dialog without escaping.
const TEMP_PASSWORD_POOLS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%*_-",
];

/**
 * Cryptographically random temporary password, guaranteed to satisfy
 * meetsPasswordRequirements() by drawing one character from every required class
 * before filling the rest — so the two can never drift apart.
 */
function generateTemporaryPassword(length = 14) {
  const everyChar = TEMP_PASSWORD_POOLS.join("");
  const pick = (pool) => pool[crypto.randomInt(pool.length)];

  const chars = TEMP_PASSWORD_POOLS.map(pick);
  while (chars.length < length) chars.push(pick(everyChar));

  // Fisher-Yates, otherwise the first four characters are always in class order.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const USERNAME_REGEX = /^[\p{L}\p{N} .,'-]{2,60}$/u;
const USERNAME_REQUIREMENTS_MESSAGE =
  "Name must be 2-60 characters, contain only letters, numbers, spaces, and . , ' -, and include at least 2 letters";

// USERNAME_REGEX alone isn't enough: it counts spaces toward the 2-60 length, so
// "   " (just spaces) or "A    " (one real letter padded with spaces) both satisfy
// it without containing a real name. Trimming first, then requiring at least 2 actual
// letters, closes both gaps while still accepting names with numerals/punctuation
// (e.g. "Jose Rizal II", "Ma. Peñaflorida-Reyes").
function isValidFullName(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!USERNAME_REGEX.test(trimmed)) return false;
  const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
  return letterCount >= 2;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  meetsPasswordRequirements,
  generateTemporaryPassword,
  PASSWORD_REQUIREMENTS_MESSAGE,
  EMAIL_REGEX,
  PH_MOBILE_REGEX,
  USERNAME_REGEX,
  USERNAME_REQUIREMENTS_MESSAGE,
  isValidFullName,
  escapeHtml,
};
