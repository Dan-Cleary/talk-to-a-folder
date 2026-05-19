const KEY = "ttf.session";

export function readSession(): string | null {
  return localStorage.getItem(KEY);
}

export function writeSession(token: string) {
  localStorage.setItem(KEY, token);
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

/**
 * Strip ?session=... from the URL after capturing it.
 * Called once on app boot.
 */
export function captureSessionFromUrl(): boolean {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("session");
  if (!token) return false;
  writeSession(token);
  url.searchParams.delete("session");
  window.history.replaceState({}, "", url.toString());
  return true;
}
