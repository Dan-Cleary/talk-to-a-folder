import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";

type Source =
  | { kind: "cid"; cid: string }
  | { kind: "file"; fileId: Id<"files"> };

type Props = {
  folderId: Id<"folders">;
  source: Source | null;
  onClose: () => void;
};

function parseCid(cid: string): { entryId: string; order: number } | null {
  const i = cid.lastIndexOf(":");
  if (i < 0) return null;
  const entryId = cid.slice(0, i);
  const order = parseInt(cid.slice(i + 1), 10);
  if (!entryId || isNaN(order)) return null;
  return { entryId, order };
}

export function CitationPanel({ folderId, source, onClose }: Props) {
  const token = readSession() ?? "";

  const cidParsed = useMemo(
    () => (source?.kind === "cid" ? parseCid(source.cid) : null),
    [source],
  );

  const citationData = useQuery(
    api.citations.resolve,
    source?.kind === "cid" && cidParsed && token
      ? {
          token,
          folderId,
          entryId: cidParsed.entryId,
          order: cidParsed.order,
        }
      : "skip",
  );

  const fileData = useQuery(
    api.citations.getFile,
    source?.kind === "file" && token
      ? { token, folderId, fileId: source.fileId }
      : "skip",
  );

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current
        ?.querySelector("mark")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => clearTimeout(t);
  }, [citationData, fileData]);

  if (!source) return null;

  const isCid = source.kind === "cid";
  const data = isCid ? citationData : fileData;
  const fileName = data?.fileName;

  return (
    <aside className="fixed inset-y-0 right-0 w-[min(520px,40vw)] bg-white border-l border-[var(--color-border)] shadow-xl flex flex-col z-50">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
            {isCid ? "Source" : "File"}
          </div>
          <div className="text-sm font-medium truncate">
            {fileName ?? "Loading…"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          aria-label="Close"
        >
          ✕
        </button>
      </header>
      <div
        ref={ref}
        className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap"
      >
        {!data ? (
          <p className="text-[var(--color-muted)]">Loading…</p>
        ) : !data.found ? (
          <p className="text-red-500">
            {isCid
              ? "Couldn't find that source."
              : "No extracted text for this file (still indexing or skipped)."}
          </p>
        ) : isCid ? (
          <CitationView data={citationData!} />
        ) : (
          <FileView text={(fileData as any).text ?? ""} />
        )}
      </div>
    </aside>
  );
}

function CitationView({ data }: { data: any }) {
  return (
    <>
      {data.before && (
        <span className="text-[var(--color-muted)]">{data.before}</span>
      )}
      <mark className="bg-yellow-200 px-0.5 py-0.5 rounded">
        {data.highlight}
      </mark>
      {data.after && (
        <span className="text-[var(--color-muted)]">{data.after}</span>
      )}
    </>
  );
}

function FileView({ text }: { text: string }) {
  return <>{text || <span className="text-[var(--color-muted)]">empty</span>}</>;
}
