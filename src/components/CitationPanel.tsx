import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";

export type Source =
  | { kind: "cid"; cid: string }
  | { kind: "file"; fileId: Id<"files"> }
  | { kind: "list" };

type Props = {
  folderId: Id<"folders">;
  source: Source | null;
  onClose: () => void;
  onPickFile: (fileId: Id<"files">) => void;
};

function parseCid(cid: string): { entryId: string; order: number } | null {
  const i = cid.lastIndexOf(":");
  if (i < 0) return null;
  const entryId = cid.slice(0, i);
  const order = parseInt(cid.slice(i + 1), 10);
  if (!entryId || isNaN(order)) return null;
  return { entryId, order };
}

const STATUS_LABEL: Record<string, string> = {
  queued: "queued",
  downloading: "loading",
  extracting: "parsing",
  embedding: "embedding",
  indexed: "indexed",
  skipped: "skipped",
  error: "error",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "text-[var(--color-muted)]",
  downloading: "text-blue-500",
  extracting: "text-blue-500",
  embedding: "text-blue-500",
  indexed: "text-green-600",
  skipped: "text-[var(--color-muted)]",
  error: "text-red-500",
};

export function CitationPanel({
  folderId,
  source,
  onClose,
  onPickFile,
}: Props) {
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

  const fileList = useQuery(
    api.folders.filesByFolder,
    source?.kind === "list" && token ? { token, folderId } : "skip",
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

  const titles: Record<Source["kind"], string> = {
    cid: "Source",
    file: "File",
    list: "Files",
  };
  const heading =
    source.kind === "cid"
      ? citationData?.fileName ?? "Loading…"
      : source.kind === "file"
        ? fileData?.fileName ?? "Loading…"
        : `${fileList?.length ?? 0} ${fileList?.length === 1 ? "file" : "files"}`;

  return (
    <aside className="fixed inset-y-0 right-0 w-[min(520px,40vw)] bg-white border-l border-[var(--color-border)] shadow-xl flex flex-col z-50">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
            {titles[source.kind]}
          </div>
          <div className="text-sm font-medium truncate">{heading}</div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div ref={ref} className="flex-1 overflow-y-auto">
        {source.kind === "list" ? (
          <FileListView files={fileList} onPick={onPickFile} />
        ) : source.kind === "cid" ? (
          !citationData ? (
            <p className="text-[var(--color-muted)] p-4">Loading…</p>
          ) : !citationData.found ? (
            <p className="text-red-500 p-4">Couldn't find that source.</p>
          ) : (
            <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
              <CitationView data={citationData} />
            </div>
          )
        ) : !fileData ? (
          <p className="text-[var(--color-muted)] p-4">Loading…</p>
        ) : !fileData.found ? (
          <p className="text-red-500 p-4">
            No extracted text for this file (still indexing or skipped).
          </p>
        ) : (
          <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
            <FileView text={(fileData as any).text ?? ""} />
          </div>
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

function FileListView({
  files,
  onPick,
}: {
  files: any[] | undefined;
  onPick: (id: Id<"files">) => void;
}) {
  if (!files) {
    return <p className="text-[var(--color-muted)] p-4">Loading…</p>;
  }
  if (files.length === 0) {
    return <p className="text-[var(--color-muted)] p-4">No files.</p>;
  }
  return (
    <ul>
      {files.map((f) => {
        const clickable = f.status === "indexed";
        return (
          <li
            key={f._id}
            onClick={clickable ? () => onPick(f._id as Id<"files">) : undefined}
            className={`px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 text-sm ${
              clickable
                ? "cursor-pointer hover:bg-[var(--color-accent-bg)]"
                : ""
            }`}
          >
            <span className="truncate flex-1" title={f.name}>
              {f.name}
            </span>
            <span
              className={`text-[11px] uppercase tracking-wide ${
                STATUS_COLOR[f.status] ?? "text-[var(--color-muted)]"
              } ${["downloading", "extracting", "embedding"].includes(f.status) ? "animate-pulse" : ""}`}
              title={f.error || undefined}
            >
              {STATUS_LABEL[f.status] ?? f.status}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
