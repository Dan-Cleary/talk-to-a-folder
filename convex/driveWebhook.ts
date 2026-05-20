import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  SUPPORTED_MIME_TYPES,
  getFreshAccessToken,
  getStartPageToken,
  listChanges,
  startChangesWatch,
  stopWatchChannel,
} from "./lib/drive";

function randomToken(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Ensure the user has an active `changes.watch` channel and a current
 * pageToken. Called from folders.add right after the first folder gets
 * registered, then again from the renewal cron.
 *
 * Idempotent — if a non-expiring channel already exists, no-op.
 */
export const ensureChangesWatch = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.auth.getUserById, {
      userId: args.userId,
    });
    if (!user) return;

    // Skip if a non-expiring channel already exists. 24h safety margin.
    if (
      user.changesWatchChannelId &&
      user.changesWatchExpiresAt &&
      user.changesWatchExpiresAt > Date.now() + 24 * 60 * 60 * 1000
    ) {
      return;
    }

    const accessToken = await getFreshAccessToken(ctx, user);

    // Stop any existing channel first.
    if (user.changesWatchChannelId && user.changesWatchResourceId) {
      await stopWatchChannel(accessToken, {
        channelId: user.changesWatchChannelId,
        resourceId: user.changesWatchResourceId,
      }).catch(() => {});
    }

    let pageToken = user.changesPageToken;
    if (!pageToken) {
      pageToken = await getStartPageToken(accessToken);
    }

    const channelId = randomToken();
    const sharedSecret = randomToken();
    const address = `${requireEnv("CONVEX_SITE_URL")}/drive/webhook`;

    try {
      const { resourceId, expiration } = await startChangesWatch(accessToken, {
        pageToken,
        channelId,
        address,
        token: sharedSecret,
      });
      await ctx.runMutation(internal.driveWebhook.saveWatchChannel, {
        userId: args.userId,
        channelId,
        resourceId,
        expiresAt: expiration,
        pageToken,
        sharedSecret,
      });
    } catch (err) {
      console.warn("changes.watch failed", err);
    }
  },
});

export const saveWatchChannel = internalMutation({
  args: {
    userId: v.id("users"),
    channelId: v.string(),
    resourceId: v.string(),
    expiresAt: v.number(),
    pageToken: v.string(),
    sharedSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      changesWatchChannelId: args.channelId,
      changesWatchResourceId: args.resourceId,
      changesWatchExpiresAt: args.expiresAt,
      changesPageToken: args.pageToken,
    });
    // We don't persist sharedSecret yet (would need a schema field).
    // For v1 we accept all webhook hits matching channelId; future hardening:
    // store the secret and verify the X-Goog-Channel-Token header.
  },
});

export const findUserByChannel = internalQuery({
  args: { channelId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_watch_channel", (q) =>
        q.eq("changesWatchChannelId", args.channelId),
      )
      .unique();
  },
});

export const setPageToken = internalMutation({
  args: { userId: v.id("users"), pageToken: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { changesPageToken: args.pageToken });
  },
});

export const listUsersWithExpiringWatches = internalQuery({
  args: { withinMs: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() + args.withinMs;
    return await ctx.db
      .query("users")
      .filter((q) =>
        q.and(
          q.neq(q.field("changesWatchChannelId"), undefined),
          q.lt(q.field("changesWatchExpiresAt"), cutoff),
        ),
      )
      .collect();
  },
});

export const listUserFoldersInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const findFileByDriveId = internalQuery({
  args: { folderId: v.id("folders"), driveFileId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("by_folder_drive", (q) =>
        q
          .eq("folderId", args.folderId)
          .eq("driveFileId", args.driveFileId),
      )
      .unique();
  },
});

export const applyChange = internalMutation({
  args: {
    folderId: v.id("folders"),
    driveFileId: v.string(),
    removed: v.boolean(),
    file: v.optional(
      v.object({
        name: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        modifiedTime: v.optional(v.string()),
        trashed: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("files")
      .withIndex("by_folder_drive", (q) =>
        q
          .eq("folderId", args.folderId)
          .eq("driveFileId", args.driveFileId),
      )
      .unique();

    // Removed or trashed → delete the row. The corresponding RAG entry
    // becomes orphaned; cheap to live with for v1.
    if (args.removed || args.file?.trashed) {
      if (existing) await ctx.db.delete(existing._id);
      return { action: "deleted" as const };
    }

    if (!args.file?.mimeType || !args.file?.name) {
      return { action: "skipped" as const };
    }

    const supported = SUPPORTED_MIME_TYPES.has(args.file.mimeType);

    if (existing) {
      // Same modifiedTime → no-op.
      if (
        args.file.modifiedTime &&
        existing.modifiedTime === args.file.modifiedTime &&
        existing.status === "indexed"
      ) {
        return { action: "unchanged" as const };
      }
      await ctx.db.patch(existing._id, {
        name: args.file.name,
        mimeType: args.file.mimeType,
        modifiedTime: args.file.modifiedTime,
        status: supported ? "queued" : "skipped",
        error: undefined,
      });
      return { action: supported ? "requeued" : "skipped" } as const;
    }

    await ctx.db.insert("files", {
      folderId: args.folderId,
      driveFileId: args.driveFileId,
      name: args.file.name,
      mimeType: args.file.mimeType,
      modifiedTime: args.file.modifiedTime,
      status: supported ? "queued" : "skipped",
    });
    return { action: supported ? "inserted" : "skipped" } as const;
  },
});

/**
 * Process pending changes for a user. Drains the changes feed from the
 * stored pageToken, applies updates per tracked folder, kicks the indexing
 * workflow if anything got requeued.
 */
export const processUserChanges = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.auth.getUserById, {
      userId: args.userId,
    });
    if (!user || !user.changesPageToken) return;

    const accessToken = await getFreshAccessToken(ctx, user);
    const { newPageToken, changes } = await listChanges(
      accessToken,
      user.changesPageToken,
    );

    const folders = await ctx.runQuery(
      internal.driveWebhook.listUserFoldersInternal,
      { userId: args.userId },
    );
    const folderIdsByDriveId = new Map<string, Id<"folders">>(
      folders.map((f) => [f.driveFolderId, f._id]),
    );

    const affectedFolderIds = new Set<Id<"folders">>();
    for (const change of changes) {
      const parents: string[] = change.file?.parents ?? [];
      // A change in a tracked folder = the file's parent is one of ours.
      // Subfolders are also tracked (driveFolderId is the *file's* parent).
      // For removed changes we don't have parents — try to match existing
      // rows by driveFileId.
      if (parents.length === 0 && change.removed) {
        for (const folder of folders) {
          const file = await ctx.runQuery(
            internal.driveWebhook.findFileByDriveId,
            { folderId: folder._id, driveFileId: change.fileId },
          );
          if (file) {
            await ctx.runMutation(internal.driveWebhook.applyChange, {
              folderId: folder._id,
              driveFileId: change.fileId,
              removed: true,
            });
            affectedFolderIds.add(folder._id);
          }
        }
        continue;
      }
      for (const parent of parents) {
        const folderId = folderIdsByDriveId.get(parent);
        if (!folderId) continue;
        await ctx.runMutation(internal.driveWebhook.applyChange, {
          folderId,
          driveFileId: change.fileId,
          removed: change.removed,
          file: change.file,
        });
        affectedFolderIds.add(folderId);
      }
    }

    await ctx.runMutation(internal.driveWebhook.setPageToken, {
      userId: args.userId,
      pageToken: newPageToken,
    });

    for (const folderId of affectedFolderIds) {
      const { workflow } = await import("./workflow");
      await workflow.start(ctx, internal.indexer.indexFolderWorkflow, {
        folderId,
        userId: args.userId,
      });
    }
  },
});
