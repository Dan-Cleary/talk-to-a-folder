import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AddFolderDialog } from "./AddFolderDialog";

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

export function FolderSidebar({
  token,
  folders,
  activeFolderId,
  onSelect,
}: Props) {
  const reindex = useAction(api.folders.reindex);
  const [showAdd, setShowAdd] = useState(false);

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
              <li key={f._id}>
                <button
                  onClick={() => onSelect(f._id)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 ${
                    activeFolderId === f._id
                      ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="flex items-center gap-1.5">
                    <StatusDot status={f.status} />
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        void reindex({ token, folderId: f._id });
                      }}
                      className="text-[var(--color-muted)] hover:text-[var(--color-fg)] text-xs cursor-pointer leading-none"
                      title="Re-index"
                    >
                      ↻
                    </span>
                  </span>
                </button>
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
