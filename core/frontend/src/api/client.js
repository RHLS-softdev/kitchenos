const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const ACCESS_KEY = "kos_access";
const REFRESH_KEY = "kos_refresh";

let accessToken = localStorage.getItem(ACCESS_KEY) || null;
let refreshToken = localStorage.getItem(REFRESH_KEY) || null;
let onUnauthorized = () => {};

export class ApiError extends Error {
  constructor(message, status, fieldErrors) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors || null;
  }
}

export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

// Pass null to clear the session entirely. Pass {access_token, refresh_token?}
// to store a new session (refresh_token is only present on login/register).
export function setTokens(tokens) {
  if (!tokens) {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    return;
  }
  accessToken = tokens.access_token ?? accessToken;
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (tokens.refresh_token) {
    refreshToken = tokens.refresh_token;
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
}

export function hasSession() {
  return !!(accessToken || refreshToken);
}

async function refreshAccessToken() {
  if (!refreshToken) return false;
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data);
  return true;
}

async function request(path, { method = "GET", body, auth = true, retry = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Couldn't reach the server. Check your connection and that the backend is running.",
      0
    );
  }

  if (res.status === 401 && auth && retry) {
    if (await refreshAccessToken()) {
      return request(path, { method, body, auth, retry: false });
    }
    setTokens(null);
    onUnauthorized();
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.errors);
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { method: "POST", body, ...opts }),
  put: (path, body, opts) => request(path, { method: "PUT", body, ...opts }),
  del: (path, opts) => request(path, { method: "DELETE", ...opts }),
};

// For endpoints that return a file (e.g. CSV export) instead of JSON —
// fetches with the auth header and triggers a normal browser download.
export async function downloadFile(path, filename) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Like downloadFile, but for displaying an image inline (e.g. a recipe
// photo) instead of saving it to disk. A plain <img src="..."> can't send
// the Authorization header the image endpoint requires, so this fetches the
// bytes with auth and hands back an object URL to put in src instead.
// Returns null (rather than throwing) on any failure — the caller can just
// fall back to a placeholder, since a missing photo isn't an error state.
export async function fetchImageUrl(path) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// For multipart file uploads (recipe photos). Deliberately doesn't set
// Content-Type — the browser fills in the correct multipart boundary for a
// FormData body automatically, and overriding it here would break that.
export async function uploadFile(path, formData) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and that the backend is running.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(data?.error || `Upload failed (${res.status})`, res.status);
  return data;
}
