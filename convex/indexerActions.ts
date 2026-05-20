"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { rag } from "./rag";
import { limiter } from "./limiter";
import { downloadFile, getFreshAccessToken } from "./lib/drive";
import { chunkText, extractFromBytes } from "./lib/extract";

/**
 * Per-file indexing step. Runs end-to-end for one file:
 *   download → extract → chunk → embed into RAG.
 * Marks file status at each transition so the UI reflects progress live.
 */
export const indexOneFile = internalAction({
  args: { fileId: v.id("files"), userId: v.id("users") },
  handler: async (ctx, args): Promise<{ ok: boolean; chunks?: number }> => {
    const fileMeta = await ctx.runQuery(internal.folders.getFileInternal, {
      fileId: args.fileId,
    });
    if (!fileMeta) return { ok: false };
    if (fileMeta.status === "indexed") return { ok: true };

    const user = await ctx.runQuery(internal.auth.getUserById, {
      userId: args.userId,
    });
    if (!user) throw new Error("User not found");

    try {
      // ---- Download ----
      await ctx.runMutation(internal.folders.setFileStatus, {
        fileId: args.fileId,
        status: "downloading",
      });
      await limiter.limit(ctx, "drive_api", { throws: true });
      const accessToken = await getFreshAccessToken(ctx, user);
      const { bytes, mimeType } = await downloadFile(
        accessToken,
        fileMeta.driveFileId,
        fileMeta.mimeType,
      );

      // ---- Extract ----
      await ctx.runMutation(internal.folders.setFileStatus, {
        fileId: args.fileId,
        status: "extracting",
      });
      const { text, thin } = await extractFromBytes(mimeType, bytes);
      if (!text.trim()) {
        await ctx.runMutation(internal.folders.setFileStatus, {
          fileId: args.fileId,
          status: "skipped",
          error: "No text extracted",
        });
        return { ok: true };
      }

      // ---- Chunk + Embed ----
      await ctx.runMutation(internal.folders.setFileStatus, {
        fileId: args.fileId,
        status: "embedding",
      });
      const chunks = chunkText(text);
      await limiter.limit(ctx, "openai_embed", {
        count: chunks.length,
        throws: true,
      });

      await rag.add(ctx, {
        namespace: fileMeta.folderId,
        key: fileMeta._id,
        title: fileMeta.name,
        chunks: chunks.map((c) => c.text),
        filterValues: [{ name: "fileId", value: fileMeta._id }],
      });

      await ctx.runMutation(internal.folders.setFileChunkSpans, {
        fileId: args.fileId,
        spans: chunks.map((c) => ({
          startChar: c.startChar,
          endChar: c.endChar,
        })),
      });
      await ctx.runMutation(internal.folders.setFileStatus, {
        fileId: args.fileId,
        status: "indexed",
        chunkCount: chunks.length,
        extractor: thin ? undefined : "native",
      });
      return { ok: true, chunks: chunks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.folders.setFileStatus, {
        fileId: args.fileId,
        status: "error",
        error: message.slice(0, 500),
      });
      throw err;
    }
  },
});
