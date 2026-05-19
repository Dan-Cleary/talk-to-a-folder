import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";

export function FolderEntry() {
  const token = readSession() ?? "";
  const folders = useQuery(api.folders.list, token ? { token } : "skip");
  const add = useAction(api.folders.add);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { folderId } = await add({ token, input });
      setActiveFolderId(folderId);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl w-full space-y-6">
      <form onSubmit={onSubmit} className="space-y-2">
        <label className="text-sm text-[var(--color-muted)] block">
          Paste a Google Drive folder link
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 px-3 py-2 rounded-md border border-[var(--color-border)] bg-transparent text-sm focus:outline-none focus:border-[var(--color-accent)]"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="px-4 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Indexing…" : "Add folder"}
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>

      {folders && folders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--color-muted)]">
            Your folders
          </h3>
          <ul className="space-y-1">
            {folders.map((f) => (
              <li
                key={f._id}
                className={`px-3 py-2 rounded-md border cursor-pointer ${
                  activeFolderId === f._id
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)]"
                    : "border-[var(--color-border)]"
                }`}
                onClick={() => setActiveFolderId(f._id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{f.name}</span>
                  <StatusBadge status={f.status} />
                </div>
                {f.error && (
                  <p className="text-xs text-red-500 mt-1">{f.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeFolderId && (
        <FileList token={token} folderId={activeFolderId as any} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ready"
      ? "text-green-600"
      : status === "error"
        ? "text-red-500"
        : "text-[var(--color-muted)]";
  return <span className={`text-xs uppercase tracking-wide ${color}`}>{status}</span>;
}

function FileList({ token, folderId }: { token: string; folderId: any }) {
  const files = useQuery(api.folders.filesByFolder, { token, folderId });
  if (!files) return <p className="text-sm text-[var(--color-muted)]">Loading files…</p>;
  if (files.length === 0)
    return <p className="text-sm text-[var(--color-muted)]">No files yet.</p>;

  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-[var(--color-muted)]">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k}>
            {v} {k}
          </span>
        ))}
      </div>
      <ul className="max-h-80 overflow-y-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
        {files.map((f) => (
          <li
            key={f._id}
            className="px-3 py-2 flex items-center justify-between text-sm"
          >
            <span className="truncate">{f.name}</span>
            <StatusBadge status={f.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
