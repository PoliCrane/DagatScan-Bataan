// Single source of truth for the backend's base URL. Falls back to local
// dev's backend port; production builds fail loudly instead of silently
// pointing every request at localhost.
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL must be set for production builds (Vercel environment variables).");
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
