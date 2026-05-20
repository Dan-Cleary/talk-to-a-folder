import { useState } from "react";
import { createPortal } from "react-dom";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AddFolderDialog } from "./AddFolderDialog";
import { friendlyError } from "../lib/errors";
import { useToast } from "../lib/toast";
import { Tooltip } from "./Tooltip";

type Folder = {
  _id: Id<"folders">;
  driveFolderId: string;
  name: string;
  status: "pending" | "indexing" | "ready" | "error";
  error?: string;
};

type Props = {
  token: string;
  folders: Folder[];
  activeFolderId: Id<"folders"> | null;
  onSelect: (id: Id<"folders">) => void;
};

const STATUS_TOOLTIP: Record<Folder["status"], string> = {
  ready: "Indexed and ready to chat",
  indexing: "Indexing files…",
  pending: "Queued for indexing",
  error: "Indexing failed",
};

export function FolderSidebar({
  token,
  folders,
  activeFolderId,
  onSelect,
}: Props) {
  const reindex = useAction(api.folders.reindex);
  const remove = useAction(api.folders.remove);
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Id<"folders"> | null>(
    null,
  );
  const [pendingRemove, setPendingRemove] = useState<Id<"folders"> | null>(
    null,
  );

  const onReindex = async (folderId: Id<"folders">) => {
    try {
      await reindex({ token, folderId });
      toast.push("info", "Re-indexing started.");
    } catch (e) {
      toast.push("error", friendlyError(e));
    }
  };

  const onRemove = async (folderId: Id<"folders">) => {
    setPendingRemove(folderId);
    try {
      await remove({ token, folderId });
      if (activeFolderId === folderId) {
        // Picking a different one happens via the auto-select effect.
      }
      toast.push("info", "Folder removed.");
    } catch (e) {
      toast.push("error", friendlyError(e));
    } finally {
      setPendingRemove(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Folders
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-[var(--color-accent)] hover:underline font-medium"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {folders.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--color-muted)] mb-2">
              No folders yet.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Add your first folder →
            </button>
          </div>
        ) : (
          <ul>
            {folders.map((f) => (
              <li key={f._id} className="group">
                <div
                  className={`relative w-full text-sm flex items-center gap-2 ${
                    activeFolderId === f._id
                      ? "bg-[var(--color-accent-bg)]"
                      : "hover:bg-gray-100"
                  } ${pendingRemove === f._id ? "opacity-50" : ""}`}
                >
                  <button
                    onClick={() => onSelect(f._id)}
                    className={`flex-1 text-left px-4 py-2 truncate ${
                      activeFolderId === f._id
                        ? "text-[var(--color-accent)] font-medium"
                        : ""
                    }`}
                  >
                    {f.name}
                  </button>
                  <div className="flex items-center gap-1 pr-2">
                    <Tooltip label={STATUS_TOOLTIP[f.status]}>
                      <StatusDot status={f.status} />
                    </Tooltip>
                    <Tooltip label="Re-sync from Drive">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void onReindex(f._id);
                        }}
                        className="text-[var(--color-muted)] hover:text-[var(--color-fg)] p-1.5 rounded-md hover:bg-white transition-colors"
                        aria-label="Re-sync from Drive"
                      >
                        <RefreshIcon />
                      </button>
                    </Tooltip>
                    <Tooltip label="Remove folder">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(f._id);
                        }}
                        className="text-[var(--color-muted)] hover:text-red-500 p-1.5 rounded-md hover:bg-white transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="Remove folder"
                      >
                        <TrashIcon />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddFolderDialog
          token={token}
          existingDriveIds={new Set(folders.map((f) => f.driveFolderId))}
          onClose={() => setShowAdd(false)}
          onAdded={(folderId) => {
            onSelect(folderId);
            setShowAdd(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Remove folder?"
          body="This deletes the folder and its indexed files from this app. It doesn't touch anything in your Google Drive."
          confirmLabel="Remove"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => onRemove(confirmDelete)}
        />
      )}
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
  return <span className={`w-2 h-2 rounded-full ${color} block`} />;
}

function RefreshIcon() {
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
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4"
      style={{ height: "100dvh" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-sm font-semibold mb-1">{title}</h2>
          <p className="text-sm text-[var(--color-muted)]">{body}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm rounded-md font-medium text-white ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--color-accent)] hover:opacity-90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
