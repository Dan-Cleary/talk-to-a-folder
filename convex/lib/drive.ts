import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

/**
 * MIME types we attempt to index. Everything else is marked `skipped`.
 * Google native formats are exported via the export endpoint.
 */
export const SUPPORTED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
};

export type DriveFolderMeta = {
  id: string;
  name: string;
  mimeType: string;
};

export class DriveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "DriveError";
  }
}

/**
 * Returns a valid access_token, refreshing it via the refresh_token if needed.
 * Persists the refreshed token back to the user row.
 */
export async function getFreshAccessToken(
  ctx: ActionCtx,
  user: Doc<"users">,
): Promise<string> {
  const now = Date.now();
  // 60s safety margin
  if (user.googleTokenExpiresAt > now + 60_000) {
    return user.googleAccessToken;
  }
  if (!user.googleRefreshToken) {
    throw new DriveError(
      401,
      "Access token expired and no refresh token available. Sign in again.",
    );
  }
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new DriveError(
      res.status,
      `Token refresh failed: ${await res.text()}`,
    );
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = Date.now() + data.expires_in * 1000;
  await ctx.runMutation(internal.auth.updateAccessToken, {
    userId: user._id as Id<"users">,
    googleAccessToken: data.access_token,
    googleTokenExpiresAt: expiresAt,
  });
  return data.access_token;
}

/**
 * For Google native formats, return the export MIME type we'll convert to.
 * For everything else, returns null (caller uses alt=media binary download).
 */
export function exportMimeFor(driveMime: string): string | null {
  switch (driveMime) {
    case "application/vnd.google-apps.document":
      return "text/plain";
    case "application/vnd.google-apps.spreadsheet":
      return "text/csv";
    case "application/vnd.google-apps.presentation":
      return "text/plain";
    default:
      return null;
  }
}

/**
 * Download a file's bytes. Handles both Google-native exports and
 * regular binary downloads via alt=media.
 * Returns { bytes, mimeType } where mimeType reflects post-export type.
 */
export async function downloadFile(
  accessToken: string,
  driveFileId: string,
  driveMime: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const exportMime = exportMimeFor(driveMime);
  const url = exportMime
    ? `/files/${driveFileId}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `/files/${driveFileId}?alt=media&supportsAllDrives=true`;
  const res = await driveFetch(accessToken, url);
  if (!res.ok) {
    throw new DriveError(res.status, `downloadFile: ${await res.text()}`);
  }
  const bytes = await res.arrayBuffer();
  return { bytes, mimeType: exportMime ?? driveMime };
}

/**
 * Get the current `startPageToken` for the user's drive. Used as the cursor
 * for `changes.list` when we start watching.
 */
export async function getStartPageToken(accessToken: string): Promise<string> {
  const res = await driveFetch(
    accessToken,
    "/changes/startPageToken?supportsAllDrives=true",
  );
  if (!res.ok) {
    throw new DriveError(
      res.status,
      `getStartPageToken: ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { startPageToken: string };
  return data.startPageToken;
}

/**
 * Open a `changes.watch` notification channel. Google POSTs to `address`
 * whenever the user's drive changes. Channel expires after ~7 days.
 */
export async function startChangesWatch(
  accessToken: string,
  args: {
    pageToken: string;
    channelId: string;
    address: string;
    token?: string;
    ttlSeconds?: number;
  },
): Promise<{ resourceId: string; expiration: number }> {
  const params = new URLSearchParams({
    pageToken: args.pageToken,
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const body: Record<string, unknown> = {
    id: args.channelId,
    type: "web_hook",
    address: args.address,
  };
  if (args.token) body.token = args.token;
  if (args.ttlSeconds) body.params = { ttl: String(args.ttlSeconds) };
  const res = await driveFetch(accessToken, `/changes/watch?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new DriveError(res.status, `startChangesWatch: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    resourceId: string;
    expiration?: string;
  };
  return {
    resourceId: data.resourceId,
    expiration: data.expiration ? parseInt(data.expiration, 10) : Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Stop a watch channel. Best-effort.
 */
export async function stopWatchChannel(
  accessToken: string,
  args: { channelId: string; resourceId: string },
): Promise<void> {
  const res = await fetch(`${DRIVE_API}/channels/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: args.channelId, resourceId: args.resourceId }),
  });
  if (!res.ok && res.status !== 404) {
    // Swallow errors — stale channels are harmless and expire on their own.
    console.warn("stopWatchChannel failed", res.status, await res.text());
  }
}

/**
 * Drain the changes feed since `pageToken`. Returns the new token plus the
 * list of changed/removed file IDs (with their current parents).
 */
export async function listChanges(
  accessToken: string,
  pageToken: string,
): Promise<{
  newPageToken: string;
  changes: Array<{
    fileId: string;
    removed: boolean;
    file?: {
      id: string;
      name?: string;
      mimeType?: string;
      modifiedTime?: string;
      parents?: string[];
      trashed?: boolean;
    };
  }>;
}> {
  const allChanges: Array<{
    fileId: string;
    removed: boolean;
    file?: any;
  }> = [];
  let token: string | undefined = pageToken;
  let newPageToken = pageToken;
  while (token) {
    const params = new URLSearchParams({
      pageToken: token,
      fields:
        "newStartPageToken,nextPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,parents,trashed))",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      includeRemoved: "true",
    });
    const res = await driveFetch(accessToken, `/changes?${params}`);
    if (!res.ok) {
      throw new DriveError(res.status, `listChanges: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      changes: any[];
      nextPageToken?: string;
      newStartPageToken?: string;
    };
    for (const c of data.changes ?? []) {
      allChanges.push({
        fileId: c.fileId,
        removed: !!c.removed,
        file: c.file,
      });
    }
    if (data.newStartPageToken) {
      newPageToken = data.newStartPageToken;
      token = undefined;
    } else {
      token = data.nextPageToken;
    }
  }
  return { newPageToken, changes: allChanges };
}

async function driveFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${DRIVE_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    throw new DriveError(401, "Drive returned 401 — token expired or revoked.");
  }
  if (res.status === 403) {
    throw new DriveError(
      403,
      "Drive returned 403 — permission denied or quota exceeded.",
    );
  }
  if (res.status === 404) {
    throw new DriveError(404, "Drive resource not found.");
  }
  return res;
}

/**
 * List the user's Drive folders, most-recently-modified first.
 * Optional search query matches folder names (Drive's `name contains` filter).
 */
export async function listMyFolders(
  accessToken: string,
  search?: string,
  limit = 50,
): Promise<Array<{ id: string; name: string; modifiedTime?: string }>> {
  const qParts = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (search?.trim()) {
    // Drive's search syntax requires escaping single quotes.
    const escaped = search.replace(/'/g, "\\'");
    qParts.push(`name contains '${escaped}'`);
  }
  const params = new URLSearchParams({
    q: qParts.join(" and "),
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: String(limit),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await driveFetch(accessToken, `/files?${params}`);
  if (!res.ok) {
    throw new DriveError(res.status, `listMyFolders: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    files: Array<{ id: string; name: string; modifiedTime?: string }>;
  };
  return data.files;
}

export async function getFolderMetadata(
  accessToken: string,
  folderId: string,
): Promise<DriveFolderMeta> {
  const res = await driveFetch(
    accessToken,
    `/files/${folderId}?fields=id,name,mimeType&supportsAllDrives=true`,
  );
  if (!res.ok) {
    throw new DriveError(res.status, `getFolderMetadata: ${await res.text()}`);
  }
  const data = (await res.json()) as DriveFolderMeta;
  if (data.mimeType !== "application/vnd.google-apps.folder") {
    throw new DriveError(400, `Not a folder: ${data.mimeType}`);
  }
  return data;
}

/**
 * Recursively walks a folder, returning every non-folder file.
 * Uses Drive's pagination. Skips trashed files.
 */
export async function listFolderFilesRecursive(
  accessToken: string,
  folderId: string,
  maxFiles = 1000,
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  const stack: string[] = [folderId];
  const seen = new Set<string>();

  while (stack.length && out.length < maxFiles) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${current}' in parents and trashed = false`,
        fields:
          "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)",
        pageSize: "100",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await driveFetch(accessToken, `/files?${params}`);
      if (!res.ok) {
        throw new DriveError(res.status, `listFiles: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        files: Array<DriveFile & { parents?: string[] }>;
        nextPageToken?: string;
      };
      for (const f of data.files) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          stack.push(f.id);
        } else {
          out.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : undefined,
            modifiedTime: f.modifiedTime,
          });
          if (out.length >= maxFiles) break;
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken && out.length < maxFiles);
  }

  return out;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
