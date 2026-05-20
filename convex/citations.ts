import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const CONTEXT_CHARS = 600;

/**
 * Resolve a citation handle `(entryId, order)` into a highlighted text view
 * for the side panel. Cheap reactive query — no RAG round-trip — because we
 * persisted `extractedText` + `chunkSpans` at index time.
 *
 * entryId is our file `_id` (RAG `key` is set to file _id when adding).
 */
export const resolve = query({
  args: {
    token: v.string(),
    folderId: v.id("folders"),
    entryId: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Not signed in");
    }
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== session.userId) {
      throw new Error("Folder not found");
    }

    let file;
    try {
      file = await ctx.db.get(args.entryId as Id<"files">);
    } catch {
      file = null;
    }
    if (!file || file.folderId !== args.folderId) {
      return { found: false } as const;
    }

    const spans = file.chunkSpans ?? [];
    const span = spans[args.order];
    const text = file.extractedText ?? "";

    if (!span || !text) {
      return {
        found: true,
        fileName: file.name,
        fileId: file._id,
        before: "",
        highlight: text.slice(0, 400),
        after: "",
      } as const;
    }

    return {
      found: true,
      fileName: file.name,
      fileId: file._id,
      before: text.slice(Math.max(0, span.startChar - CONTEXT_CHARS), span.startChar),
      highlight: text.slice(span.startChar, span.endChar),
      after: text.slice(span.endChar, span.endChar + CONTEXT_CHARS),
    } as const;
  },
});
