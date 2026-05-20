import { useEffect, useRef, useState } from "react";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!folders) return;
    const stillExists = folders.some((f) => f._id === activeFolderId);
    if (!stillExists) {
      setActiveFolderId(folders[0]?._id ?? null);
      setSource(null);
    }
  }, [folders, activeFolderId]);

  const activeFolder = folders?.find((f) => f._id === activeFolderId) ?? null;

  const files = useQuery(
    api.folders.filesByFolder,
    activeFolder && token
      ? { token, folderId: activeFolder._id }
      : "skip",
  );

  const fileCountCache = useRef<Map<string, number>>(new Map());
  if (files && activeFolder) {
    fileCountCache.current.set(activeFolder._id, files.length);
  }
  const displayedFileCount = activeFolder
    ? files?.length ?? fileCountCache.current.get(activeFolder._id) ?? null
    : null;

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          flex flex-col overflow-hidden border-r border-[var(--color-border)]
          fixed md:relative inset-y-0 left-0 z-40 w-72
          bg-white md:bg-gray-50/50
          transition-transform duration-200
          ${mobileSidebarOpen ? "translate-x-0 shadow-2xl md:shadow-none" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <FolderSidebar
          token={token}
          folders={folders ?? []}
          activeFolderId={activeFolderId}
          onSelect={(id) => {
            setActiveFolderId(id);
            setSource(null);
            setMobileSidebarOpen(false);
          }}
        />
      </aside>

      <section className="flex-1 flex flex-col overflow-hidden min-w-0">
        {activeFolder ? (
          <>
            <div className="px-4 md:px-8 py-3 md:py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="md:hidden p-1.5 rounded hover:bg-gray-100"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base md:text-lg font-semibold truncate">
                    {activeFolder.name}
                  </h2>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    {activeFolder.status === "ready"
                      ? "Ready"
                      : `Indexing — ${countByStatus(files, "indexed")} of ${files?.length ?? 0} files`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSource({ kind: "list" })}
                className="flex-shrink-0 text-sm px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                {displayedFileCount === null
                  ? "Files"
                  : `${displayedFileCount} ${displayedFileCount === 1 ? "file" : "files"}`}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                folderId={activeFolder._id}
                folderName={activeFolder.name}
                onCitationOpen={(cid) => setSource({ kind: "cid", cid })}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-3">
              <p className="text-[var(--color-muted)] text-sm">
                Add a folder to get started.
              </p>
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden text-sm text-[var(--color-accent)] underline"
              >
                Open menu
              </button>
            </div>
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

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function countByStatus(files: any[] | undefined, status: string): number {
  if (!files) return 0;
  return files.filter((f) => f.status === status).length;
}
