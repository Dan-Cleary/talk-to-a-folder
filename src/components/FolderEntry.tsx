import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";

type DriveFolder = { id: string; name: string; modifiedTime?: string };

export function FolderEntry() {
  const token = readSession() ?? "";
  const folders = useQuery(api.folders.list, token ? { token } : "skip");
  const add = useAction(api.folders.add);
  const browse = useAction(api.folders.browseDriveFolders);
  const reindex = useAction(api.folders.reindex);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [drive, setDrive] = useState<DriveFolder[] | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Auto-load the first page of folders once on mount.
  useEffect(() => {
    let cancelled = false;
    setBrowseLoading(true);
    browse({ token })
      .then((r) => {
        if (!cancelled) setDrive(r);
      })
      .catch((e) => {
        if (!cancelled) setBrowseError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBrowseLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search → re-query Drive.
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => {
      setBrowseLoading(true);
      browse({ token, search: search || undefined })
        .then((r) => setDrive(r))
        .catch((e) => setBrowseError((e as Error).message))
        .finally(() => setBrowseLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, token, browse]);

  const addFolder = async (input: string) => {
    setError(null);
    setBusy(input);
    try {
      const { folderId } = await add({ token, input });
      setActiveFolderId(folderId);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) void addFolder(input.trim());
  };

  const indexedIds = new Set(folders?.map((f) => f.driveFolderId) ?? []);

  return (
    <div className="max-w-3xl w-full space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wide">
          Pick a folder
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your Drive folders…"
          className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
        {browseError && <p className="text-sm text-red-500">{browseError}</p>}
        <div className="border border-[var(--color-border)] rounded-md max-h-72 overflow-y-auto">
          {browseLoading && !drive ? (
            <p className="px-3 py-4 text-sm text-[var(--color-muted)]">Loading…</p>
          ) : drive && drive.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--color-muted)]">
              No folders match.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {drive?.map((f) => {
                const already = indexedIds.has(f.id);
                const loading = busy === f.id;
                return (
                  <li
                    key={f.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      {f.modifiedTime && (
                        <div className="text-xs text-[var(--color-muted)]">
                          modified {new Date(f.modifiedTime).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => !already && void addFolder(f.id)}
                      disabled={already || loading || busy !== null}
                      className="ml-3 px-3 py-1 rounded-md text-xs font-medium border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {already ? "Added" : loading ? "Adding…" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wide">
          Or paste a link
        </h2>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 px-3 py-2 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
            disabled={busy !== null}
          />
          <button
            type="submit"
            disabled={busy !== null || !input.trim()}
            className="px-4 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy === input ? "Adding…" : "Add"}
          </button>
        </form>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </section>

      {folders && folders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wide">
            Your indexed folders
          </h2>
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate flex-1">
                    {f.name}
                  </span>
                  <StatusBadge status={f.status} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void reindex({ token, folderId: f._id });
                    }}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                    title="Re-index this folder"
                  >
                    ↻
                  </button>
                </div>
                {f.error && (
                  <p className="text-xs text-red-500 mt-1">{f.error}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
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
  return (
    <span className={`text-xs uppercase tracking-wide ${color}`}>{status}</span>
  );
}

function FileList({ token, folderId }: { token: string; folderId: any }) {
  const files = useQuery(api.folders.filesByFolder, { token, folderId });
  if (!files)
    return <p className="text-sm text-[var(--color-muted)]">Loading files…</p>;
  if (files.length === 0)
    return <p className="text-sm text-[var(--color-muted)]">No files yet.</p>;

  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="space-y-2">
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
    </section>
  );
}
