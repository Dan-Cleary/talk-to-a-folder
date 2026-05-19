import { useEffect, useState } from "react";
import { captureSessionFromUrl } from "./lib/session";
import { signOut, startGoogleSignIn, useCurrentUser } from "./lib/auth";

export default function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    captureSessionFromUrl();
    setBooted(true);
  }, []);

  if (!booted) return null;
  return <Home />;
}

function Home() {
  const { user, loading } = useCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--color-border)] px-6 py-3 flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">Talk to a Folder</h1>
        <div className="text-sm">
          {loading ? (
            <span className="text-[var(--color-muted)]">…</span>
          ) : user ? (
            <div className="flex items-center gap-3">
              <span className="text-[var(--color-muted)]">{user.email}</span>
              <button
                onClick={signOut}
                className="text-[var(--color-muted)] hover:text-[var(--color-fg)]"
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

      <main className="flex-1 flex items-center justify-center p-8">
        {user ? (
          <FolderEntry />
        ) : (
          <div className="max-w-xl text-center space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight">
              Chat with any Drive folder.
            </h2>
            <p className="text-[var(--color-muted)]">
              Paste a Google Drive folder link. We&rsquo;ll index it and answer
              questions with citations.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function FolderEntry() {
  return (
    <div className="max-w-xl w-full space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        Folder paste UI lands next. Auth works.
      </p>
    </div>
  );
}
