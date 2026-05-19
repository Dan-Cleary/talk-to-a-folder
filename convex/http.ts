import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SCOPES } from "./auth";

const http = httpRouter();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function pkceChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function callbackUrl(): string {
  return `${requireEnv("CONVEX_SITE_URL")}/auth/google/callback`;
}

http.route({
  path: "/auth/google/start",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirectTo") ?? undefined;

    const state = randomToken(16);
    const verifier = randomToken(32);
    const challenge = await pkceChallenge(verifier);

    await ctx.runMutation(internal.auth.stashOAuthState, {
      state,
      codeVerifier: verifier,
      redirectTo,
    });

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
    authUrl.searchParams.set("redirect_uri", callbackUrl());
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return Response.redirect(authUrl.toString(), 302);
  }),
});

http.route({
  path: "/auth/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const siteUrl = requireEnv("SITE_URL");

    if (error) {
      return Response.redirect(
        `${siteUrl}/login?error=${encodeURIComponent(error)}`,
        302,
      );
    }
    if (!code || !state) {
      return Response.redirect(`${siteUrl}/login?error=missing_code`, 302);
    }

    const stashed = await ctx.runMutation(internal.auth.consumeOAuthState, {
      state,
    });
    if (!stashed) {
      return Response.redirect(`${siteUrl}/login?error=invalid_state`, 302);
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        code,
        code_verifier: stashed.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(),
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("google token exchange failed", tokenRes.status, body);
      return Response.redirect(`${siteUrl}/login?error=token_exchange`, 302);
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      id_token?: string;
    };

    const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoRes.ok) {
      return Response.redirect(`${siteUrl}/login?error=userinfo`, 302);
    }
    const profile = (await userinfoRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    const sessionToken = randomToken(32);
    await ctx.runMutation(internal.auth.upsertUserAndCreateSession, {
      email: profile.email,
      name: profile.name,
      image: profile.picture,
      googleSub: profile.sub,
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      googleScope: tokens.scope,
      sessionToken,
    });

    const redirectTo = stashed.redirectTo ?? "/";
    const target = new URL(redirectTo, siteUrl);
    target.searchParams.set("session", sessionToken);
    return Response.redirect(target.toString(), 302);
  }),
});

http.route({
  path: "/auth/logout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request
      .json()
      .catch(() => ({}))) as { token?: string };
    if (body.token) {
      await ctx.runMutation(internal.auth.deleteSession, { token: body.token });
    }
    return new Response(null, { status: 204 });
  }),
});

export default http;
