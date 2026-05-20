import { Agent, createTool } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { stepCountIs } from "ai";
import { z } from "zod";
import { components, internal } from "./_generated/api";
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
        // `key` was set to our file _id at index time; use that as the
        // citation handle so the side-panel resolver can look it up.
        const fileId = (e as any)?.key ?? r.entryId;
        const cid = `${fileId}:${r.order}`;
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

/**
 * Tool: listFiles. Returns the names + status of every file in the active
 * folder. Critical for broad questions like "summarize each file" where the
 * agent should fan out instead of relying on a single vector search.
 */
const listFiles = createTool({
  description:
    "List every indexed file in the active folder. Use this BEFORE searching when the user asks something that requires considering the whole folder (e.g. 'what's in here?', 'summarize each file', 'compare X across files').",
  inputSchema: z.object({}),
  execute: async (ctx: any) => {
    const folderId = ctx.folderId as Id<"folders"> | undefined;
    if (!folderId) return { files: [] };
    const files: any[] = await ctx.runQuery(
      internal.folders.listFolderFilesInternal,
      { folderId },
    );
    return {
      files: files
        .filter((f) => f.status === "indexed")
        .map((f) => ({ name: f.name, mimeType: f.mimeType })),
    };
  },
});

export const folderAgent = new Agent(components.agent, {
  name: "Talk-to-Folder Agent",
  languageModel: anthropic.chat("claude-sonnet-4-6"),
  embeddingModel: openai.embedding("text-embedding-3-small"),
  instructions: `You are a careful research assistant who answers questions about a user's Google Drive folder.

Rules:
- For broad questions ("what's in here?", "summarize each file", "compare X across files"), call listFiles FIRST, then make ONE searchFolder call PER FILE using the file's name as part of the query.
- For specific questions (a topic, a definition, a number), skip listFiles and call searchFolder directly with the topic.
- For greetings or chit-chat (e.g. "hi", "thanks"), reply briefly without using tools.
- Do not narrate ("Let me search…") — just call the tool, then give the answer.
- When a fact comes from a snippet, append the snippet's citation handle in square brackets at the end of the sentence: [cid:<handle>]. You may stack multiple: [cid:a][cid:b].
- If a search returns nothing relevant, say so plainly. Do not invent.
- Prefer short, direct answers. Bullets when comparing multiple sources.
- The "active folder" is implicit; do not ask the user which folder — just call the tools.`,
  tools: { listFiles, searchFolder },
  stopWhen: stepCountIs(10),
});
