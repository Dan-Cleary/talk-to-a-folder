import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  DriveError,
  SUPPORTED_MIME_TYPES,
  getFolderMetadata,
  getFreshAccessToken,
  listFolderFilesRecursive,
  listMyFolders,
} from "./lib/drive";
import { parseFolderId } from "./lib/driveUrl";
import { workflow } from "./workflow";

async function requireUser(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"users">> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Not signed in");
  }
  const user = await ctx.db.get(session.userId);
  if (!user) throw new Error("User not found");
  return user;
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return folders.map((f) => ({
      _id: f._id,
      driveFolderId: f.driveFolderId,
      name: f.name,
      status: f.status,
      error: f.error,
      _creationTime: f._creationTime,
    }));
  },
});

export const filesByFolder = query({
  args: { token: v.string(), folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== user._id) {
      throw new Error("Folder not found");
    }
    const files = await ctx.db
      .query("files")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    return files.map((f) => ({
      _id: f._id,
      name: f.name,
      mimeType: f.mimeType,
      status: f.status,
      error: f.error,
      chunkCount: f.chunkCount,
    }));
  },
});

/**
 * Internal mutation: insert folder + queued file rows. Called from the
 * `add` action after Drive listing succeeds.
 */
export const insertFolderAndFiles = internalMutation({
  args: {
    userId: v.id("users"),
    driveFolderId: v.string(),
    name: v.string(),
    files: v.array(
      v.object({
        driveFileId: v.string(),
        name: v.string(),
        mimeType: v.string(),
        size: v.optional(v.number()),
        modifiedTime: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Idempotency: if folder already exists for this user, reuse it.
    const existing = await ctx.db
      .query("folders")
      .withIndex("by_user_drive", (q) =>
        q.eq("userId", args.userId).eq("driveFolderId", args.driveFolderId),
      )
      .unique();
    let folderId: Id<"folders">;
    if (existing) {
      folderId = existing._id;
      await ctx.db.patch(folderId, {
        status: "indexing",
        name: args.name,
        error: undefined,
      });
    } else {
      folderId = await ctx.db.insert("folders", {
        userId: args.userId,
        driveFolderId: args.driveFolderId,
        name: args.name,
        status: "indexing",
      });
    }

    // Diff existing files; only insert new ones.
    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect();
    const existingByDriveId = new Map(
      existingFiles.map((f) => [f.driveFileId, f]),
    );

    let inserted = 0;
    let skipped = 0;
    for (const f of args.files) {
      const supported = SUPPORTED_MIME_TYPES.has(f.mimeType);
      const prior = existingByDriveId.get(f.driveFileId);
      if (prior) {
        // We'll handle re-index on modifiedTime change in a later step.
        continue;
      }
      await ctx.db.insert("files", {
        folderId,
        driveFileId: f.driveFileId,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
        status: supported ? "queued" : "skipped",
      });
      if (supported) inserted++;
      else skipped++;
    }

    return { folderId, inserted, skipped, total: args.files.length };
  },
});

export const listQueuedFileIds = internalQuery({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    return files
      .filter((f) => f.status === "queued")
      .map((f) => f._id);
  },
});

export const getFileInternal = internalQuery({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

export const setFileStatus = internalMutation({
  args: {
    fileId: v.id("files"),
    status: v.union(
      v.literal("queued"),
      v.literal("downloading"),
      v.literal("extracting"),
      v.literal("embedding"),
      v.literal("indexed"),
      v.literal("skipped"),
      v.literal("error"),
    ),
    chunkCount: v.optional(v.number()),
    extractor: v.optional(
      v.union(v.literal("native"), v.literal("llamaparse")),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { fileId, ...patch } = args;
    await ctx.db.patch(fileId, patch);
  },
});

/**
 * Cap extracted text we persist for re-render. 1.5MB ceiling avoids blowing
 * up the row size on huge PDFs; chunks are already in RAG either way.
 */
const MAX_EXTRACTED_CHARS = 1_500_000;

export const setFileExtractedText = internalMutation({
  args: {
    fileId: v.id("files"),
    text: v.string(),
    spans: v.array(
      v.object({ startChar: v.number(), endChar: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const trimmed = args.text.slice(0, MAX_EXTRACTED_CHARS);
    await ctx.db.patch(args.fileId, {
      extractedText: trimmed,
      chunkSpans: args.spans,
    });
  },
});

export const markFolderReady = internalMutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.folderId, { status: "ready", error: undefined });
  },
});

/**
 * Public action: re-queue any non-indexed files in an existing folder
 * and re-kick the indexing workflow. Useful for folders that were added
 * before the workflow was deployed, or to retry errors.
 */
export const reindex = action({
  args: { token: v.string(), folderId: v.id("folders") },
  handler: async (ctx, args): Promise<{ requeued: number }> => {
    const user = await ctx.runQuery(internal.auth.getUserBySession, {
      token: args.token,
    });
    if (!user) throw new Error("Not signed in");
    const requeued = await ctx.runMutation(internal.folders.requeueStuckFiles, {
      folderId: args.folderId,
      userId: user._id,
    });
    await workflow.start(ctx, internal.indexer.indexFolderWorkflow, {
      folderId: args.folderId,
      userId: user._id,
    });
    return { requeued };
  },
});

export const requeueStuckFiles = internalMutation({
  args: { folderId: v.id("folders"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      throw new Error("Folder not found");
    }
    const files = await ctx.db
      .query("files")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    let count = 0;
    for (const f of files) {
      if (!SUPPORTED_MIME_TYPES.has(f.mimeType)) continue;
      // Explicit user-triggered reindex: requeue everything, including
      // already-indexed files. Lets the user pick up schema changes
      // (e.g. extractedText added later) or fix bad extractions.
      await ctx.db.patch(f._id, { status: "queued", error: undefined });
      count++;
    }
    await ctx.db.patch(args.folderId, {
      status: "indexing",
      error: undefined,
    });
    return count;
  },
});

export const markFolderError = internalMutation({
  args: { folderId: v.id("folders"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.folderId, { status: "error", error: args.error });
  },
});

/**
 * Public action: parse a Drive folder URL, list files, persist rows.
 * Returns the new folder ID so the UI can navigate to it immediately.
 * Indexing runs in a separate workflow (next task).
 */
/**
 * Public action: list the signed-in user's Drive folders so the UI can show
 * a picker. Optional search filter.
 */
export const browseDriveFolders = action({
  args: { token: v.string(), search: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ id: string; name: string; modifiedTime?: string }>> => {
    const user = await ctx.runQuery(internal.auth.getUserBySession, {
      token: args.token,
    });
    if (!user) throw new Error("Not signed in");
    const accessToken = await getFreshAccessToken(ctx, user);
    try {
      return await listMyFolders(accessToken, args.search);
    } catch (e) {
      if (e instanceof DriveError) throw new Error(`Drive: ${e.message}`);
      throw e;
    }
  },
});

export const add = action({
  args: { token: v.string(), input: v.string() },
  handler: async (ctx, args): Promise<{ folderId: Id<"folders"> }> => {
    const folderId = parseFolderId(args.input);
    if (!folderId) {
      throw new Error("Couldn't find a folder ID in that input.");
    }

    // Authenticate via session token.
    const user = await ctx.runQuery(internal.auth.getUserBySession, {
      token: args.token,
    });
    if (!user) throw new Error("Not signed in");

    const accessToken = await getFreshAccessToken(ctx, user);

    let meta;
    try {
      meta = await getFolderMetadata(accessToken, folderId);
    } catch (e) {
      if (e instanceof DriveError) {
        throw new Error(`Drive: ${e.message}`);
      }
      throw e;
    }

    const files = await listFolderFilesRecursive(accessToken, folderId);

    const result = await ctx.runMutation(internal.folders.insertFolderAndFiles, {
      userId: user._id,
      driveFolderId: meta.id,
      name: meta.name,
      files: files.map((f) => ({
        driveFileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
      })),
    });

    // Fire-and-forget durable workflow. The UI sees progress via reactive
    // queries on file status.
    await workflow.start(ctx, internal.indexer.indexFolderWorkflow, {
      folderId: result.folderId,
      userId: user._id,
    });

    return { folderId: result.folderId };
  },
});
