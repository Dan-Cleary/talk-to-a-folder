import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Props = {
  token: string;
  folderId: Id<"folders">;
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
  downloading: "text-blue-500 animate-pulse",
  extracting: "text-blue-500 animate-pulse",
  embedding: "text-blue-500 animate-pulse",
  indexed: "text-green-600",
  skipped: "text-[var(--color-muted)]",
  error: "text-red-500",
};

export function FilesList({ token, folderId }: Props) {
  const files = useQuery(api.folders.filesByFolder, { token, folderId });

  if (!files) {
    return (
      <p className="text-sm text-[var(--color-muted)] p-4">Loading…</p>
    );
  }
  if (files.length === 0) {
    return <p className="text-sm text-[var(--color-muted)] p-4">No files.</p>;
  }

  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--color-border)] flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k}>
            {v} {k}
          </span>
        ))}
      </div>
      <ul>
        {files.map((f) => (
          <li
            key={f._id}
            className="px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2 text-sm"
          >
            <span className="truncate flex-1" title={f.name}>
              {f.name}
            </span>
            <span
              className={`text-[11px] uppercase tracking-wide ${
                STATUS_COLOR[f.status] ?? "text-[var(--color-muted)]"
              }`}
              title={f.error || undefined}
            >
              {STATUS_LABEL[f.status] ?? f.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
