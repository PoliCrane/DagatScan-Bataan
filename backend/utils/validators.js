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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const USERNAME_REGEX = /^[\p{L}\p{N} .,'-]{2,60}$/u;
const USERNAME_REQUIREMENTS_MESSAGE =
  "Name must be 2-60 characters and contain only letters, numbers, spaces, and . , ' -";

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
  PASSWORD_REQUIREMENTS_MESSAGE,
  EMAIL_REGEX,
  PH_MOBILE_REGEX,
  USERNAME_REGEX,
  USERNAME_REQUIREMENTS_MESSAGE,
  escapeHtml,
};
