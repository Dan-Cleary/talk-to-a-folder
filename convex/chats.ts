import { v } from "convex/values";
import {
  action,
  internalMutation,
  query,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { folderAgent } from "./agent";

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
    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getChat = query({
  args: { token: v.string(), chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== user._id) throw new Error("Chat not found");
    return chat;
  },
});

/**
 * Create a chat scoped to one folder. Returns the chat row id and the
 * underlying Agent thread id (for streaming subscriptions).
 */
export const create = action({
  args: { token: v.string(), folderId: v.id("folders") },
  handler: async (
    ctx,
    args,
  ): Promise<{ chatId: Id<"chats">; threadId: string }> => {
    const user = await ctx.runQuery(internal.auth.getUserBySession, {
      token: args.token,
    });
    if (!user) throw new Error("Not signed in");

    // Create thread first so we can persist its id atomically with the chat.
    const { threadId } = await folderAgent.createThread(ctx, {
      userId: user._id,
    });

    const chatId = await ctx.runMutation(internal.chats.insertChat, {
      userId: user._id,
      folderId: args.folderId,
      threadId,
      title: "New chat",
    });
    return { chatId, threadId };
  },
});

export const insertChat = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    threadId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chats", args);
  },
});

/**
 * Send a user message and stream the assistant response. The Agent
 * component handles message persistence, streaming deltas, and tool calls.
 * We inject `folderId` onto the ctx so the agent's tools know which RAG
 * namespace to search.
 */
export const ask = action({
  args: {
    token: v.string(),
    chatId: v.id("chats"),
    prompt: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.runQuery(internal.auth.getUserBySession, {
      token: args.token,
    });
    if (!user) throw new Error("Not signed in");
    const chat = await ctx.runQuery(internal.chats.getChatInternal, {
      chatId: args.chatId,
    });
    if (!chat || chat.userId !== user._id) throw new Error("Chat not found");

    // Attach folderId to ctx so tools can read it.
    const ctxWithFolder = Object.assign({}, ctx, { folderId: chat.folderId });
    await folderAgent.streamText(
      ctxWithFolder as any,
      { threadId: chat.threadId },
      { prompt: args.prompt },
      { saveStreamDeltas: true },
    );

    // If this is the first user message, set the chat title from it.
    if (chat.title === "New chat") {
      const title = args.prompt.slice(0, 80);
      await ctx.runMutation(internal.chats.setChatTitle, {
        chatId: args.chatId,
        title,
      });
    }
  },
});

export const getChatInternal = internalQuery({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => ctx.db.get(args.chatId),
});

export const setChatTitle = internalMutation({
  args: { chatId: v.id("chats"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, { title: args.title });
  },
});

/**
 * List messages for the active thread, merging stream deltas. Shape is
 * dictated by Agent's `useThreadMessages` hook: top-level threadId +
 * paginationOpts + optional streamArgs.
 */
export const listThreadMessages = query({
  args: {
    token: v.string(),
    threadId: v.string(),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
    streamArgs: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (!chat || chat.userId !== user._id) throw new Error("Chat not found");

    const result = await folderAgent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = args.streamArgs
      ? await folderAgent.syncStreams(ctx, {
          threadId: args.threadId,
          streamArgs: args.streamArgs,
        })
      : undefined;
    return { ...result, streams };
  },
});
