const DEFAULT_API_BASE = 'https://the-project2jhbgcioijiuzi1niisinr5cci6iback.vercel.app';

const API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;

export const apiUrl = (path: string) => {
  if (!path) return API_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
};

export const apiFetch = (path: string, init?: RequestInit) => {
  return fetch(apiUrl(path), init);
};
