// If VITE_API_BASE_URL is set, use it. Otherwise use relative /api (handy for local dev with Vite proxy).
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

export const apiUrl = (path: string) => {
  if (!path) return API_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!API_BASE) {
    // fall back to relative URL
    return path.startsWith("/") ? path : `/${path}`;
  }
  const normalizedBase = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
};

export const apiFetch = (path: string, init?: RequestInit) => {
  return fetch(apiUrl(path), init);
};
