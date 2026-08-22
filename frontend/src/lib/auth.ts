// The login token, kept in the browser only (per-device). There is no
// server-rendered auth check — every page here is a client component that
// talks straight to the Express API, so the API itself is the real gate;
// this just decides what the UI shows.
const KEY = "mailhub_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}

export function clearToken() {
  localStorage.removeItem(KEY);
}
