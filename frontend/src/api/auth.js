import { API_BASE_URL } from "../config/api";
// creates a pending account request an admin must approve, not a usable account
// FormData carries the request-letter PDF — no Content-Type header, browser sets the multipart boundary
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