/**
 * Extract a Drive folder ID from any of the URL shapes a user might paste.
 *
 * Supported:
 *   https://drive.google.com/drive/folders/<ID>
 *   https://drive.google.com/drive/folders/<ID>?usp=sharing
 *   https://drive.google.com/drive/u/0/folders/<ID>
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/drive/u/0/my-drive  → null (not a folder URL)
 *   bare ID: <ID>
 */
export function parseFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare ID — Drive IDs are 25-50ish chars, alnum + dashes/underscores.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;

  // /drive/folders/<ID> or /drive/u/0/folders/<ID>
  const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  // /open?id=<ID>
  if (url.pathname === "/open" || url.pathname.endsWith("/open")) {
    const id = url.searchParams.get("id");
    if (id) return id;
  }

  return null;
}
