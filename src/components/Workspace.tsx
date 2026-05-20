import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { readSession } from "../lib/session";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { CitationPanel } from "./CitationPanel";
import { FilesList } from "./FilesList";
import { FolderPicker } from "./FolderPicker";

export function Workspace() {
  const token = readSession() ?? "";
  const folders = useQuery(api.folders.list, token ? { token } : "skip");
  const [activeFolderId, setActiveFolderId] = useState<Id<"folders"> | null>(
    null,
  );
  const [openCid, setOpenCid] = useState<string | null>(null);

  // Auto-select the most recent folder once it loads.
  useEffect(() => {
    if (!activeFolderId && folders && folders.length > 0) {
      setActiveFolderId(folders[0]._id);
    }
  }, [folders, activeFolderId]);

  const activeFolder = folders?.find((f) => f._id === activeFolderId) ?? null;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden bg-gray-50/50">
        <FolderPicker
          token={token}
          folders={folders ?? []}
          activeFolderId={activeFolderId}
          onSelect={setActiveFolderId}
        />
      </aside>

      {/* Main content */}
      <section className="flex-1 flex flex-col overflow-hidden">
        {activeFolder ? (
          <>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{activeFolder.name}</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  Status: {activeFolder.status}
                </p>
              </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-72 flex-shrink-0 border-r border-[var(--color-border)] overflow-y-auto">
                <FilesList token={token} folderId={activeFolder._id} />
              </div>
              <div className="flex-1 flex overflow-hidden">
                <ChatPanel
                  folderId={activeFolder._id}
                  folderName={activeFolder.name}
                  onCitationOpen={setOpenCid}
                  openCid={openCid}
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
          cid={openCid}
          onClose={() => setOpenCid(null)}
        />
      )}
    </div>
  );
}
