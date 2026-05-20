"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { rag } from "./rag";
import { limiter } from "./limiter";
import { downloadFile, getFreshAccessToken } from "./lib/drive";
import { chunkText, extractFromBytes } from "./lib/extract";
import { isLlamaParseConfigured, parseWithLlama } from "./lib/llamaParse";

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
    // Only short-circuit if already indexed AND nothing is asking us to rerun.
    // Reindex path sets status back to "queued", so this guard never triggers
    // for explicit reindexes.
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
      let { text, thin } = await extractFromBytes(mimeType, bytes);
      let extractor: "native" | "llamaparse" = "native";

      // Fallback to LlamaParse for thin/empty extractions — typically scanned
      // PDFs, image-heavy documents, or complex tables. Only attempted when
      // configured; otherwise we skip the file with a clear reason.
      if ((thin || !text.trim()) && isLlamaParseConfigured()) {
        try {
          const llamaText = await parseWithLlama(
            bytes,
            fileMeta.name,
            mimeType,
          );
          if (llamaText.trim().length > text.length) {
            text = llamaText;
            thin = false;
            extractor = "llamaparse";
          }
        } catch (err) {
          console.warn(
            "llamaParse fallback failed; using native result",
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (!text.trim()) {
        await ctx.runMutation(internal.folders.setFileStatus, {
          fileId: args.fileId,
          status: "skipped",
          error: isLlamaParseConfigured()
            ? "No text extracted (native + LlamaParse)"
            : "No text extracted (LlamaParse not configured)",
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

      await ctx.runMutation(internal.folders.setFileExtractedText, {
        fileId: args.fileId,
        text,
        spans: chunks.map((c) => ({
          startChar: c.startChar,
          endChar: c.endChar,
        })),
      });
      await ctx.runMutation(internal.folders.setFileStatus, {
        fileId: args.fileId,
        status: "indexed",
        chunkCount: chunks.length,
        extractor,
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
