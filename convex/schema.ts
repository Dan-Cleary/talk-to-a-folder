import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    googleSub: v.string(),
    googleAccessToken: v.string(),
    googleRefreshToken: v.optional(v.string()),
    googleTokenExpiresAt: v.number(),
    googleScope: v.string(),
    // Drive `changes.watch` — one channel per user, covers all folders.
    changesWatchChannelId: v.optional(v.string()),
    changesWatchResourceId: v.optional(v.string()),
    changesWatchExpiresAt: v.optional(v.number()),
    changesPageToken: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_google_sub", ["googleSub"])
    .index("by_watch_channel", ["changesWatchChannelId"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  oauthStates: defineTable({
    state: v.string(),
    codeVerifier: v.string(),
    redirectTo: v.optional(v.string()),
    expiresAt: v.number(),
  }).index("by_state", ["state"]),

  folders: defineTable({
    userId: v.id("users"),
    driveFolderId: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("indexing"),
      v.literal("ready"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
    pageToken: v.optional(v.string()),
    watchChannelId: v.optional(v.string()),
    watchResourceId: v.optional(v.string()),
    watchExpiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_drive", ["userId", "driveFolderId"])
    .index("by_watch_channel", ["watchChannelId"]),

  files: defineTable({
    folderId: v.id("folders"),
    driveFileId: v.string(),
    name: v.string(),
    mimeType: v.string(),
    size: v.optional(v.number()),
    modifiedTime: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("queued"),
      v.literal("downloading"),
      v.literal("extracting"),
      v.literal("embedding"),
      v.literal("indexed"),
      v.literal("skipped"),
      v.literal("error"),
    ),
    extractor: v.optional(
      v.union(v.literal("native"), v.literal("llamaparse")),
    ),
    chunkCount: v.optional(v.number()),
    chunkSpans: v.optional(
      v.array(
        v.object({ startChar: v.number(), endChar: v.number() }),
      ),
    ),
    extractedText: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_folder", ["folderId"])
    .index("by_folder_drive", ["folderId", "driveFileId"]),

  chats: defineTable({
    userId: v.id("users"),
    title: v.string(),
    folderId: v.id("folders"),
    // Agent component thread id (string, opaque to us).
    threadId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_thread", ["threadId"]),
});
