import { Agent, createTool } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { components } from "./_generated/api";
import { rag } from "./rag";
import type { Id } from "./_generated/dataModel";

/**
 * Tool: searchFolder.
 * Vector-searches the active folder's RAG namespace. Returns a list of
 * snippets with stable citation handles (`cid`) the agent must reference
 * in its reply via `[cid:N]` markers.
 */
const searchFolder = createTool({
  description:
    "Search the user's folder for passages relevant to a query. Returns top snippets with a citation handle (cid). When you quote or rely on a snippet, end the sentence with [cid:<handle>].",
  inputSchema: z.object({
    query: z.string().describe("Natural-language search query."),
    limit: z.number().optional().describe("Max results, default 6."),
  }),
  execute: async (ctx: any, input: { query: string; limit?: number }) => {
    const folderId = ctx.folderId as Id<"folders"> | undefined;
    if (!folderId) return { results: [] };
    const { results, entries } = await rag.search(ctx, {
      namespace: folderId,
      query: input.query,
      limit: input.limit ?? 6,
      vectorScoreThreshold: 0.3,
    });
    const entryById = new Map(entries.map((e) => [e.entryId, e]));
    return {
      results: results.map((r, i) => {
        const e = entryById.get(r.entryId);
        const cid = `${r.entryId}:${r.order}`;
        return {
          cid,
          index: i,
          file: e?.title ?? "unknown",
          score: r.score,
          text: r.content.map((c) => c.text).join(""),
        };
      }),
    };
  },
});

export const folderAgent = new Agent(components.agent, {
  name: "Talk-to-Folder Agent",
  languageModel: anthropic.chat("claude-sonnet-4-6"),
  embeddingModel: openai.embedding("text-embedding-3-small"),
  instructions: `You are a careful research assistant who answers questions about a user's Google Drive folder.

Rules:
- Always use the searchFolder tool before answering substantive questions. Never guess.
- When a fact comes from a snippet, append the snippet's citation handle in square brackets at the end of the sentence: [cid:<handle>]. You may stack multiple: [cid:a][cid:b].
- If the search returns nothing relevant, say so plainly. Do not invent.
- Prefer short, direct answers. Bullets when comparing multiple sources.
- The "active folder" is implicit; do not ask the user which folder — just search.`,
  tools: { searchFolder },
});
