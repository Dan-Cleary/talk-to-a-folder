import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../lib/errors";
import { useToast } from "../lib/toast";

type DriveFolder = { id: string; name: string; modifiedTime?: string };

type Props = {
  token: string;
  existingDriveIds: Set<string>;
  onAdded: (folderId: Id<"folders">) => void;
  onClose: () => void;
};

export function AddFolderDialog({
  token,
  existingDriveIds,
  onAdded,
  onClose,
}: Props) {
  const add = useAction(api.folders.add);
  const browse = useAction(api.folders.browseDriveFolders);
  const toast = useToast();

  const [pasteInput, setPasteInput] = useState("");
  const [search, setSearch] = useState("");
  const [drive, setDrive] = useState<DriveFolder[] | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Initial fetch + debounced search.
  useEffect(() => {
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

  // ESC to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addFolder = async (input: string) => {
    setBusy(input);
    setPasteError(null);
    try {
      const { folderId } = await add({ token, input });
      onAdded(folderId);
    } catch (e) {
      const msg = friendlyError(e);
      setPasteError(msg);
      toast.push("error", msg);
    } finally {
      setBusy(null);
    }
  };

  const filtered = drive?.filter((f) => !existingDriveIds.has(f.id)) ?? null;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Add a folder</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-fg)] text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Paste link */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
              Paste a Drive link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pasteInput.trim() && !busy) {
                    void addFolder(pasteInput.trim());
                  }
                }}
                placeholder="drive.google.com/drive/folders/…"
                disabled={busy !== null}
                className="flex-1 px-3 py-2 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
                autoFocus
              />
              <button
                onClick={() => pasteInput.trim() && addFolder(pasteInput.trim())}
                disabled={!pasteInput.trim() || busy !== null}
                className="px-3 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {pasteError && (
              <p className="text-xs text-red-500">{pasteError}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">
              Or browse Drive
            </span>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          {/* Browse */}
          <div className="space-y-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your Drive folders…"
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
            <div className="border border-[var(--color-border)] rounded-md max-h-72 overflow-y-auto">
              {browseError && (
                <p className="text-xs text-red-500 px-3 py-2">{browseError}</p>
              )}
              {browseLoading && !drive ? (
                <p className="text-sm text-[var(--color-muted)] px-3 py-4">
                  Loading…
                </p>
              ) : filtered && filtered.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)] px-3 py-4">
                  {!search.trim()
                    ? drive && drive.length > 0
                      ? "All your Drive folders are already added here."
                      : "No folders in your Drive yet."
                    : drive && drive.length > 0
                      ? `Folders matching "${search}" are already added.`
                      : `No Drive folders matching "${search}".`}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {filtered?.map((f) => {
                    const loading = busy === f.id;
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => void addFolder(f.id)}
                          disabled={loading || busy !== null}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm truncate">{f.name}</div>
                            {f.modifiedTime && (
                              <div className="text-[11px] text-[var(--color-muted)]">
                                modified{" "}
                                {new Date(f.modifiedTime).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-[var(--color-muted)]">
                            {loading ? "…" : "Add"}
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
      </div>
    </div>
  );
}
