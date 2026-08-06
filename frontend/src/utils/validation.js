// Shared field-format validators, centralized so forms don't re-derive their own regexes.

// Philippine mobile numbers: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

// Same pattern already used in AddAccountModal.jsx.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidPhilippineMobile(value) {
  return PH_MOBILE_REGEX.test((value || "").trim());
}

export function isValidEmail(value) {
  return EMAIL_REGEX.test((value || "").trim());
}
