import { api, ApiError } from "./client";

// Auth endpoints intentionally resolve with { error } instead of throwing —
// the login/register forms branch on res.error rather than using try/catch.
async function soft(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Network error. Please check your connection and try again." };
  }
}

// creates a pending account request an admin must approve, not a usable account
// FormData carries the request-letter PDF — no Content-Type header, browser sets the multipart boundary
export const requestAccount = (formData) =>
  soft(api("/request-account", { method: "POST", body: formData }));

export const getMunicipalities = () => soft(api("/api/shoreline/municipalities"));

export const loginUser = (userData) =>
  soft(api("/login", { method: "POST", body: userData }));

export const forgotPass = (email) =>
  soft(api("/forgot-password", { method: "POST", body: { email } }));

export const resetPass = (email, resetCode, newPassword) =>
  soft(api("/reset-password", { method: "POST", body: { email, resetCode, newPassword } }));
