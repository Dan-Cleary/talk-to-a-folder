import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { CitationPanel, type Source } from "./CitationPanel";
import { FolderSidebar } from "./FolderSidebar";

export function Workspace() {
  const token = readSession() ?? "";
  const folders = useQuery(api.folders.list, token ? { token } : "skip");
  const [activeFolderId, setActiveFolderId] = useState<Id<"folders"> | null>(
    null,
  );
  const [source, setSource] = useState<Source | null>(null);

  useEffect(() => {
    if (!activeFolderId && folders && folders.length > 0) {
      setActiveFolderId(folders[0]._id);
    }
  }, [folders, activeFolderId]);

  const activeFolder = folders?.find((f) => f._id === activeFolderId) ?? null;

  // Load file count for the header badge (cheap, reactive).
  const files = useQuery(
    api.folders.filesByFolder,
    activeFolder && token
      ? { token, folderId: activeFolder._id }
      : "skip",
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-72 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden bg-gray-50/50">
        <FolderSidebar
          token={token}
          folders={folders ?? []}
          activeFolderId={activeFolderId}
          onSelect={(id) => {
            setActiveFolderId(id);
            setSource(null);
          }}
        />
      </aside>

      <section className="flex-1 flex flex-col overflow-hidden">
        {activeFolder ? (
          <>
            <div className="px-8 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{activeFolder.name}</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  {activeFolder.status === "ready"
                    ? "Ready"
                    : `Indexing — ${countByStatus(files, "indexed")} of ${files?.length ?? 0} files`}
                </p>
              </div>
              <button
                onClick={() => setSource({ kind: "list" })}
                className="text-sm px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                {files?.length ?? 0} {files?.length === 1 ? "file" : "files"}
              </button>
            </div>
            <div className="flex-1 flex justify-center overflow-hidden">
              <div className="w-full max-w-3xl flex">
                <ChatPanel
                  folderId={activeFolder._id}
                  folderName={activeFolder.name}
                  onCitationOpen={(cid) => setSource({ kind: "cid", cid })}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-[var(--color-muted)] text-sm">
              Add a folder on the left to get started.
            </p>
          </div>
        )}
      </section>

      {activeFolder && (
        <CitationPanel
          folderId={activeFolder._id}
          source={source}
          onClose={() => setSource(null)}
          onPickFile={(fileId) => setSource({ kind: "file", fileId })}
        />
      )}
    </div>
  );
}

function countByStatus(files: any[] | undefined, status: string): number {
  if (!files) return 0;
  return files.filter((f) => f.status === status).length;
}
