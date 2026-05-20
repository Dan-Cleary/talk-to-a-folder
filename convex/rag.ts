import { RAG } from "@convex-dev/rag";
import { openai } from "@ai-sdk/openai";
import { components } from "./_generated/api";

/**
 * Shared RAG instance. One namespace per folder (`folderId` string).
 * Filters let us scope a query to a single file when the agent wants
 * to "read" a specific document.
 */
export const rag = new RAG<{ fileId: string }>(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: 1536,
  filterNames: ["fileId"],
});
