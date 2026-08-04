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

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  if (/^https?:\/\//i.test(path)) {
    throw new Error('apiFetch accepte uniquement les routes internes de l’application.');
  }
  const headers = new Headers(init.headers);
  if (typeof window !== 'undefined' && !headers.has('Authorization')) {
    const token = window.localStorage.getItem('token')?.trim();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    !path.endsWith('/login')
  ) {
    window.localStorage.removeItem('user');
    window.localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  return response;
};
