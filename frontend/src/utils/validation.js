// Shared field-format validators, centralized so forms don't re-derive their own regexes.

// Philippine mobile numbers: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the backend's isValidFullName (backend/utils/validators.js) — kept in sync
// by hand since the two run in different languages. The backend is the real gate;
// this is just a faster, friendlier error before the request even goes out.
const FULL_NAME_REGEX = /^[\p{L}\p{N} .,'-]{2,60}$/u;

export function isValidPhilippineMobile(value) {
  return PH_MOBILE_REGEX.test((value || "").trim());
}

export function isValidEmail(value) {
  return EMAIL_REGEX.test((value || "").trim());
}

export function isValidFullName(value) {
  const trimmed = (value || "").trim();
  if (!FULL_NAME_REGEX.test(trimmed)) return false;
  const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
  return letterCount >= 2;
}
