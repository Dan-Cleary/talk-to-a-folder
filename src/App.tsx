import { useEffect, useState } from "react";
import { captureSessionFromUrl } from "./lib/session";
import { signOut, startGoogleSignIn, useCurrentUser } from "./lib/auth";
import { Workspace } from "./components/Workspace";

export default function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    captureSessionFromUrl();
    setBooted(true);
  }, []);

  if (!booted) return null;
  return <Shell />;
}

function Shell() {
  const { user, loading } = useCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--color-border)] px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--color-accent)] flex items-center justify-center text-white text-xs font-bold">
            ⌘
          </div>
          <h1 className="text-base font-semibold tracking-tight">
            Talk to a Folder
          </h1>
        </div>
        <div className="text-sm">
          {loading ? (
            <span className="text-[var(--color-muted)]">…</span>
          ) : user ? (
            <div className="flex items-center gap-3">
              <span className="text-[var(--color-muted)] text-xs">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-[var(--color-muted)] hover:text-[var(--color-fg)] text-xs"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={startGoogleSignIn}
              className="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex">
        {user ? (
          <Workspace />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-xl text-center space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">
                Chat with any Drive folder.
              </h2>
              <p className="text-[var(--color-muted)]">
                Sign in with Google. Pick a folder. Ask anything — get answers
                with citations that link straight to the source.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
