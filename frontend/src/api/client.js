import { API_BASE_URL } from "../config/api";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function extractErrorMessage(res) {
  try {
    const data = await res.json();
    return data.error || data.message || `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

// Central fetch wrapper: base URL, JSON handling, auth header, and consistent errors.
// auth: true attaches the stored token; a 401 on an authed call clears the session so
// the AuthContext storage listener logs the user out everywhere.
export async function api(path, { auth = false, body, headers = {}, ...opts } = {}) {
  const finalHeaders = { ...headers };
  const isFormData = body instanceof FormData;

  if (body !== undefined && !isFormData) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = localStorage.getItem("token");
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: finalHeaders,
    body: body !== undefined && !isFormData ? JSON.stringify(body) : body,
  });

  if (res.status === 401 && auth) {
    ["token", "username", "roles", "municipality", "municipality_id"].forEach((key) =>
      localStorage.removeItem(key)
    );
    window.dispatchEvent(new StorageEvent("storage", { key: "token" }));
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }

  return res.json();
}
