import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { clearSession, readSession } from "./session";

export function useCurrentUser() {
  const token = readSession() ?? undefined;
  const user = useQuery(api.auth.me, { token });
  const loading = user === undefined;
  return { user: user ?? null, loading, token };
}

export function startGoogleSignIn() {
  const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
  const redirectTo = window.location.pathname + window.location.search;
  window.location.href = `${base}/auth/google/start?redirectTo=${encodeURIComponent(
    redirectTo,
  )}`;
}

export async function signOut() {
  const token = readSession();
  if (token) {
    const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }
  clearSession();
  window.location.href = "/";
}
