/**
 * Map raw Convex/Drive errors to messages a user should actually see.
 * Convex prepends a server-error envelope we want to strip.
 */
const FRIENDLY: Array<[RegExp, string]> = [
  [/Couldn't find a folder ID/i, "That doesn't look like a Drive folder link. Paste the URL from a folder (drive.google.com/drive/folders/…)."],
  [/Drive: .*401/i, "Your Google session expired. Sign out and back in."],
  [/Drive: .*403/i, "Google denied that request — you may not have access to this folder, or the Drive API quota was hit."],
  [/Drive: .*404/i, "That folder couldn't be found. It may be deleted or you no longer have access."],
  [/Not signed in/i, "Your session expired. Sign in again."],
  [/Folder not found/i, "That folder isn't yours or no longer exists."],
];

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Strip Convex's "[Request ID: ...] Server Error\nUncaught Error: " prefix.
  const stripped = raw
    .replace(/^.*Server Error\s*/s, "")
    .replace(/^Uncaught Error:\s*/, "")
    .replace(/\s+at handler.*$/s, "")
    .trim();
  for (const [pat, msg] of FRIENDLY) {
    if (pat.test(stripped)) return msg;
  }
  return stripped || "Something went wrong.";
}
