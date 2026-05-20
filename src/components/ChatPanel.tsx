import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";
import { MessageContent } from "./MessageContent";
import { friendlyError } from "../lib/errors";
import { useToast } from "../lib/toast";

type Props = {
  folderId: Id<"folders">;
  folderName: string;
  onCitationOpen: (cid: string) => void;
};

export function ChatPanel({ folderId, folderName, onCitationOpen }: Props) {
  const token = readSession() ?? "";
  const createChat = useAction(api.chats.create);
  const ask = useAction(api.chats.ask);
  const toast = useToast();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<Id<"chats"> | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThreadId(null);
    setChatId(null);
    createChat({ token, folderId })
      .then((r) => {
        if (cancelled) return;
        setThreadId(r.threadId);
        setChatId(r.chatId);
      })
      .catch((e) => !cancelled && setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const messagesQuery = useThreadMessages(
    api.chats.listThreadMessages,
    threadId ? { token, threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const uiMessages = useMemo(() => {
    const all = toUIMessages(messagesQuery.results ?? []);
    // Skip assistant messages that have no rendered text yet — the typing
    // indicator covers that state without an empty grey bubble.
    return all.filter((m: any) => {
      if (m.role !== "assistant") return true;
      const text = (m.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");
      return text.trim().length > 0;
    });
  }, [messagesQuery.results]);

  const lastMessageIsLiveAssistant = useMemo(() => {
    const last = uiMessages[uiMessages.length - 1];
    if (!last || last.role !== "assistant") return false;
    return (last as any).status === "streaming";
  }, [uiMessages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [uiMessages.length, uiMessages[uiMessages.length - 1]?.parts?.length]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId || !input.trim() || busy) return;
    setError(null);
    setBusy(true);
    const prompt = input;
    setInput("");
    try {
      await ask({ token, chatId, prompt });
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      toast.push("error", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {uiMessages.length === 0 && (
          <div className="text-center text-[var(--color-muted)] mt-12 space-y-2">
            <p className="text-sm">Ask anything about {folderName}.</p>
            <p className="text-xs">
              Try: <em>"What's in here?"</em> or <em>"Summarize each file."</em>
            </p>
          </div>
        )}
        {uiMessages.map((m) => (
          <MessageBubble
            key={m.id ?? m.key}
            message={m}
            onCitationClick={onCitationOpen}
          />
        ))}
        {busy && !lastMessageIsLiveAssistant && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="px-6 py-2 text-sm text-red-500 border-t border-[var(--color-border)]">
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="flex gap-2 p-4 border-t border-[var(--color-border)]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={threadId ? "Ask a question…" : "Starting chat…"}
          disabled={!threadId || busy}
          className="flex-1 px-3 py-2 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={!threadId || busy || !input.trim()}
          className="px-4 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-100 rounded-lg px-3 py-2.5 flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)] animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)] animate-bounce"
          style={{ animationDelay: "120ms" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)] animate-bounce"
          style={{ animationDelay: "240ms" }}
        />
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onCitationClick,
}: {
  message: any;
  onCitationClick: (cid: string) => void;
}) {
  const isUser = message.role === "user";
  const text = (message.parts ?? [])
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("");

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-[var(--color-accent)] text-white"
            : "bg-gray-100 text-[var(--color-fg)]"
        }`}
      >
        <MessageContent
          text={text}
          variant={isUser ? "user" : "assistant"}
          onCitationClick={onCitationClick}
        />
        {message.status === "streaming" && (
          <span className="inline-block w-2 h-4 bg-current opacity-50 animate-pulse ml-1" />
        )}
      </div>
    </div>
  );
}
