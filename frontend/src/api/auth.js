import { API_BASE_URL } from "../config/api";
// Submits a municipal-account request — a pending row an admin must approve,
// not an immediately-usable account (see server.js's /request-account).
// Takes a FormData (carries the signed request-letter PDF alongside the
// text fields) — no Content-Type header, the browser sets the multipart
// boundary itself.
export const requestAccount = async (formData) => {
  const res = await fetch(`${API_BASE_URL}/request-account`, {
    method: "POST",
    body: formData
  });
  return res.json();
};

export const getMunicipalities = async () => {
  const res = await fetch(`${API_BASE_URL}/api/shoreline/municipalities`);
  return res.json();
};

export const loginUser = async (userData) => {
  const res = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData)
  });
  return res.json();
};

export const forgotPass = async (email) => {
  const res = await fetch(`${API_BASE_URL}/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  return res.json();
};

export const resetPass = async (email, resetCode, newPassword) => {
  const res = await fetch(`${API_BASE_URL}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, resetCode, newPassword })
  });
  return res.json();
};