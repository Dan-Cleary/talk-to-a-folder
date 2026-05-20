import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Props = {
  token: string;
  folderId: Id<"folders">;
  onFileClick?: (fileId: Id<"files">) => void;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "queued",
  downloading: "loading",
  extracting: "parsing",
  embedding: "embedding",
  indexed: "✓",
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

export function FilesList({ token, folderId, onFileClick }: Props) {
  const files = useQuery(api.folders.filesByFolder, { token, folderId });

  if (!files) {
    return (
      <p className="text-sm text-[var(--color-muted)] p-4">Loading…</p>
    );
  }
  if (files.length === 0) {
    return <p className="text-sm text-[var(--color-muted)] p-4">No files.</p>;
  }

  return (
    <div>
      <ul>
        {files.map((f) => {
          const clickable = onFileClick && f.status === "indexed";
          return (
            <li
              key={f._id}
              onClick={
                clickable ? () => onFileClick!(f._id as Id<"files">) : undefined
              }
              className={`px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2 text-sm ${
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
    </div>
  );
}
