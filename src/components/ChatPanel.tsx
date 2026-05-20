import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";

type Props = {
  folderId: Id<"folders">;
  folderName: string;
};

export function ChatPanel({ folderId, folderName }: Props) {
  const token = readSession() ?? "";
  const createChat = useAction(api.chats.create);
  const ask = useAction(api.chats.ask);

  const [threadId, setThreadId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<Id<"chats"> | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create a thread the first time the user opens chat for this folder.
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
      .catch((e) => !cancelled && setError((e as Error).message));
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

  const uiMessages = useMemo(
    () => toUIMessages(messagesQuery.results ?? []),
    [messagesQuery.results],
  );

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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col border border-[var(--color-border)] rounded-md overflow-hidden h-[600px]">
      <header className="px-4 py-2 border-b border-[var(--color-border)] bg-gray-50">
        <h3 className="text-sm font-medium">
          Chat with <span className="font-semibold">{folderName}</span>
        </h3>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {uiMessages.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">
            Ask a question about the files in this folder.
          </p>
        )}
        {uiMessages.map((m) => (
          <MessageBubble key={m.id ?? m.key} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="px-4 py-2 text-sm text-red-500 border-t border-[var(--color-border)]">
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="flex gap-2 p-3 border-t border-[var(--color-border)]"
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

function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === "user";
  // Extract text from parts (UIMessage shape).
  const text = (message.parts ?? [])
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("");

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-[var(--color-accent)] text-white"
            : "bg-gray-100 text-[var(--color-fg)]"
        }`}
      >
        {renderWithCitations(text)}
        {message.status === "streaming" && (
          <span className="inline-block w-2 h-4 bg-current opacity-50 animate-pulse ml-1" />
        )}
      </div>
    </div>
  );
}

/**
 * Replace [cid:<entryId>:<order>] markers with a clickable chip.
 * For now the chip is non-interactive; Task #6 wires up the side panel.
 */
function renderWithCitations(text: string) {
  const parts: Array<string | { cid: string; index: number }> = [];
  const re = /\[cid:([^\]]+)\]/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ cid: m[1], index: ++i });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, idx) =>
    typeof p === "string" ? (
      <span key={idx}>{p}</span>
    ) : (
      <sup
        key={idx}
        title={p.cid}
        className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded bg-white/30 text-[10px] font-medium cursor-help"
      >
        {p.index}
      </sup>
    ),
  );
}
