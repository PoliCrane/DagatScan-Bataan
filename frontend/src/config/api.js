// Single source of truth for the backend's base URL. Falls back to local
// dev's backend port so nothing breaks for anyone without a .env file yet;
// set VITE_API_BASE_URL in production (Vercel env vars) to the deployed
// backend's URL (e.g. Render).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
