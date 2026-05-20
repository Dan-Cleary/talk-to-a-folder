import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Folder = {
  _id: Id<"folders">;
  driveFolderId: string;
  name: string;
  status: "pending" | "indexing" | "ready" | "error";
  error?: string;
};

type DriveFolder = { id: string; name: string; modifiedTime?: string };

type Props = {
  token: string;
  folders: Folder[];
  activeFolderId: Id<"folders"> | null;
  onSelect: (id: Id<"folders">) => void;
};

export function FolderPicker({ token, folders, activeFolderId, onSelect }: Props) {
  const add = useAction(api.folders.add);
  const browse = useAction(api.folders.browseDriveFolders);
  const reindex = useAction(api.folders.reindex);

  const [search, setSearch] = useState("");
  const [drive, setDrive] = useState<DriveFolder[] | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setBrowseLoading(true);
      browse({ token, search: search || undefined })
        .then((r) => !cancelled && setDrive(r))
        .catch((e) => !cancelled && setBrowseError((e as Error).message))
        .finally(() => !cancelled && setBrowseLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, token, browse]);

  const indexedDriveIds = new Set(folders.map((f) => f.driveFolderId));
  // Hide already-added folders from the picker — they live in the
  // "Your folders" section above. Avoids the same name appearing twice.
  const driveFiltered = drive?.filter((f) => !indexedDriveIds.has(f.id)) ?? null;

  const addFolder = async (input: string) => {
    setBusy(input);
    setPasteError(null);
    try {
      const { folderId } = await add({ token, input });
      onSelect(folderId);
      setPasteInput("");
    } catch (e) {
      setPasteError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Indexed folders */}
      {folders.length > 0 && (
        <div className="border-b border-[var(--color-border)] py-2 px-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] px-2 mb-1">
            Your folders
          </h3>
          <ul>
            {folders.map((f) => (
              <li key={f._id}>
                <button
                  onClick={() => onSelect(f._id)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center justify-between gap-2 ${
                    activeFolderId === f._id
                      ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="flex items-center gap-1">
                    <StatusDot status={f.status} />
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        void reindex({ token, folderId: f._id });
                      }}
                      className="text-[var(--color-muted)] hover:text-[var(--color-fg)] text-xs cursor-pointer"
                      title="Re-index"
                    >
                      ↻
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add folder */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] px-2">
            Add a folder
          </h3>
          <input
            type="text"
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pasteInput.trim() && !busy) {
                void addFolder(pasteInput.trim());
              }
            }}
            placeholder="Paste a Drive link…"
            disabled={busy !== null}
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
          {pasteError && (
            <p className="text-xs text-red-500">{pasteError}</p>
          )}
          <div className="text-[10px] text-center text-[var(--color-muted)]">— or browse —</div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your Drive folders…"
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {browseError && (
            <p className="text-xs text-red-500 px-2 py-1">{browseError}</p>
          )}
          {browseLoading && !drive ? (
            <p className="text-xs text-[var(--color-muted)] px-2 py-2">Loading…</p>
          ) : driveFiltered && driveFiltered.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] px-2 py-2">
              {drive && drive.length > 0
                ? "Everything matching is already added."
                : "No matches."}
            </p>
          ) : (
            <ul>
              {driveFiltered?.map((f) => {
                const loading = busy === f.id;
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => void addFolder(f.id)}
                      disabled={loading || busy !== null}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-sm">{f.name}</span>
                      <span className="text-[10px] text-[var(--color-muted)]">
                        {loading ? "…" : "+"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Folder["status"] }) {
  const color =
    status === "ready"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}
