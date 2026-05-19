import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const stashOAuthState = internalMutation({
  args: {
    state: v.string(),
    codeVerifier: v.string(),
    redirectTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", {
      ...args,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
  },
});

export const consumeOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return { codeVerifier: row.codeVerifier, redirectTo: row.redirectTo };
  },
});

export const upsertUserAndCreateSession = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    googleSub: v.string(),
    googleAccessToken: v.string(),
    googleRefreshToken: v.optional(v.string()),
    googleTokenExpiresAt: v.number(),
    googleScope: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { sessionToken, ...userFields } = args;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_google_sub", (q) => q.eq("googleSub", args.googleSub))
      .unique();

    let userId;
    if (existing) {
      const patch: Record<string, unknown> = {
        email: userFields.email,
        name: userFields.name,
        image: userFields.image,
        googleAccessToken: userFields.googleAccessToken,
        googleTokenExpiresAt: userFields.googleTokenExpiresAt,
        googleScope: userFields.googleScope,
      };
      if (userFields.googleRefreshToken) {
        patch.googleRefreshToken = userFields.googleRefreshToken;
      }
      await ctx.db.patch(existing._id, patch);
      userId = existing._id;
    } else {
      userId = await ctx.db.insert("users", userFields);
    }

    await ctx.db.insert("sessions", {
      userId,
      token: sessionToken,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return userId;
  },
});

export const getUserBySession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!session) return null;
    if (session.expiresAt < Date.now()) return null;
    const user = await ctx.db.get(session.userId);
    return user;
  },
});

export const deleteSession = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

export const updateAccessToken = internalMutation({
  args: {
    userId: v.id("users"),
    googleAccessToken: v.string(),
    googleTokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, ...patch } = args;
    await ctx.db.patch(userId, patch);
  },
});

/**
 * Public query: returns the current user if their session cookie is valid.
 * Reads the session token from the user's identity (set via setAuth on the client).
 */
export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.token) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token!))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    const user = await ctx.db.get(session.userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  },
});
