import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";

type Props = {
  folderId: Id<"folders">;
  cid: string | null;
  onClose: () => void;
};

/**
 * cid format: `<entryId>:<order>` where entryId is the RAG entry id (a string)
 * and order is the chunk index within the file. We resolve the entryId to our
 * file row to fetch the file's display name and chunk spans for highlighting.
 */
function parseCid(cid: string): { entryId: string; order: number } | null {
  const i = cid.lastIndexOf(":");
  if (i < 0) return null;
  const entryId = cid.slice(0, i);
  const order = parseInt(cid.slice(i + 1), 10);
  if (!entryId || isNaN(order)) return null;
  return { entryId, order };
}

export function CitationPanel({ folderId, cid, onClose }: Props) {
  const token = readSession() ?? "";
  const parsed = useMemo(() => (cid ? parseCid(cid) : null), [cid]);

  const data = useQuery(
    api.citations.resolve,
    cid && parsed && token
      ? { token, folderId, entryId: parsed.entryId, order: parsed.order }
      : "skip",
  );

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll to highlight when data loads.
    const t = setTimeout(() => {
      ref.current
        ?.querySelector("mark")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => clearTimeout(t);
  }, [data]);

  if (!cid) return null;
  return (
    <aside className="fixed inset-y-0 right-0 w-[min(520px,40vw)] bg-white border-l border-[var(--color-border)] shadow-xl flex flex-col z-50">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
            Source
          </div>
          <div className="text-sm font-medium truncate">
            {data?.fileName ?? "Loading…"}
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
      <div ref={ref} className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap">
        {!data ? (
          <p className="text-[var(--color-muted)]">Loading…</p>
        ) : !data.found ? (
          <p className="text-red-500">Couldn&rsquo;t find that source.</p>
        ) : (
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
        )}
      </div>
    </aside>
  );
}
