import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";
import { MessageContent } from "./MessageContent";
import { friendlyError } from "../lib/errors";
import { useToast } from "../lib/toast";
import { Tooltip } from "./Tooltip";

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
  // Optimistic user message shown immediately on submit, cleared once the
  // server-side message appears in the stream.
  const [pendingUserPrompt, setPendingUserPrompt] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setThreadId(null);
    setChatId(null);
    setPendingUserPrompt(null);
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
    return all.filter((m: any) => {
      if (m.role !== "assistant") return true;
      const text = (m.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");
      return text.trim().length > 0;
    });
  }, [messagesQuery.results]);

  // Clear the optimistic prompt once the server confirms a user message
  // with matching text (avoids duplicate render).
  useEffect(() => {
    if (!pendingUserPrompt) return;
    const haveMatchingServerMsg = uiMessages.some((m: any) => {
      if (m.role !== "user") return false;
      const text = (m.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");
      return text === pendingUserPrompt;
    });
    if (haveMatchingServerMsg) setPendingUserPrompt(null);
  }, [uiMessages, pendingUserPrompt]);

  const lastMessageIsLiveAssistant = useMemo(() => {
    const last = uiMessages[uiMessages.length - 1];
    if (!last || last.role !== "assistant") return false;
    return (last as any).status === "streaming";
  }, [uiMessages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    uiMessages.length,
    uiMessages[uiMessages.length - 1]?.parts?.length,
    pendingUserPrompt,
  ]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatId || !input.trim() || busy) return;
    setError(null);
    const prompt = input.trim();
    setInput("");
    setPendingUserPrompt(prompt);
    setBusy(true);
    // reset textarea height
    requestAnimationFrame(autoSize);
    try {
      await ask({ token, chatId, prompt });
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      toast.push("error", msg);
      setPendingUserPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {uiMessages.length === 0 && !pendingUserPrompt && (
            <div className="text-center text-[var(--color-muted)] mt-12 space-y-2">
              <p className="text-sm">Ask anything about {folderName}.</p>
              <p className="text-xs">
                Try: <em>"What's in here?"</em> or{" "}
                <em>"Summarize each file."</em>
              </p>
            </div>
          )}
          {uiMessages.map((m: any) => (
            <MessageRow
              key={m.id ?? m.key}
              role={m.role}
              text={(m.parts ?? [])
                .filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("")}
              streaming={m.status === "streaming"}
              onCitationClick={onCitationOpen}
            />
          ))}
          {pendingUserPrompt && (
            <MessageRow
              role="user"
              text={pendingUserPrompt}
              streaming={false}
              onCitationClick={onCitationOpen}
            />
          )}
          {busy && !lastMessageIsLiveAssistant && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <p className="px-6 py-2 text-sm text-red-500">{error}</p>
      )}

      <div className="px-4 pb-4 pt-2">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 border border-[var(--color-border)] rounded-3xl px-4 py-2.5 bg-white shadow-sm focus-within:border-[var(--color-accent)] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoSize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSubmit();
                }
              }}
              placeholder={threadId ? `Ask anything…` : "Starting chat…"}
              disabled={!threadId}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm focus:outline-none placeholder:text-[var(--color-muted)] max-h-[200px] py-1.5"
            />
            <button
              type="submit"
              disabled={!threadId || busy || !input.trim()}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-[var(--color-fg)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-[11px] text-center text-[var(--color-muted)] mt-2">
            Answers reference the indexed files only. Click a citation to see
            the exact source.
          </p>
        </form>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2">
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
  );
}

function MessageRow({
  role,
  text,
  streaming,
  onCitationClick,
}: {
  role: "user" | "assistant" | "system";
  text: string;
  streaming: boolean;
  onCitationClick: (cid: string) => void;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl px-4 py-2 bg-gray-100 text-[var(--color-fg)] text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }
  // Assistant — no bubble, just text. Matches the ChatGPT pattern.
  return (
    <div className="group/msg text-sm leading-relaxed text-[var(--color-fg)]">
      <MessageContent
        text={text}
        variant="assistant"
        onCitationClick={onCitationClick}
      />
      {streaming && (
        <span className="inline-block w-1.5 h-4 bg-[var(--color-fg)] opacity-50 animate-pulse ml-1 align-middle" />
      )}
      {!streaming && text.trim() && (
        <div className="mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
          <CopyButton text={text} />
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  // Strip our citation markers from the copied text — those are app-internal.
  const cleanText = text.replace(/\[cid:[^\]]+\]/g, "").trim();
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore — clipboard API can fail in non-secure contexts.
    }
  };
  return (
    <Tooltip label={copied ? "Copied" : "Copy"}>
      <button
        onClick={onCopy}
        aria-label="Copy message"
        className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-gray-100 transition-colors"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </Tooltip>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgb(22, 163, 74)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
