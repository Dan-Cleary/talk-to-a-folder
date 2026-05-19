# Architectural decisions

Running log of non-obvious calls. Each entry: what we chose, what we rejected, why.

## D1 — Custom Google OAuth flow (not @convex-dev/auth)

**Chose:** Hand-rolled OAuth in Convex HTTP actions (~150 lines, PKCE, refresh-token aware).

**Rejected:** `@convex-dev/auth` with Google provider.

**Why:** convex-auth consumes the provider's `access_token` / `refresh_token` internally and does not expose them to user callbacks. Our entire app's value is calling Drive on the user's behalf — we *need* persistent Drive tokens. The alternatives are (a) stack convex-auth's flow plus a *second* OAuth round-trip just for Drive (two user clicks, more code, more failure modes), or (b) own the flow. Owning it is fewer lines, fewer abstractions in the way, and the auth story becomes legible end-to-end in the video walkthrough.

**Trade-off accepted:** We give up convex-auth's session refresh machinery. Mitigation: 30-day sessions, single random token, server-side validation. The Google access-token refresh is the only thing we have to handle ourselves, and we have the refresh_token to do it.

## D2 — Session token via localStorage + query arg (not httpOnly cookie)

**Chose:** Random 64-char session token returned in the redirect URL, persisted to `localStorage`, passed as an argument to any Convex query/mutation that needs user context.

**Rejected:** httpOnly cookies + `ctx.auth.getUserIdentity()` via a minted JWT.

**Why:** httpOnly cookies don't reach Convex queries/mutations — they're available to HTTP actions only. Going JWT means standing up our own JWT issuer in `auth.config.ts`, signing tokens with JWKS, and keeping that infra correct. For a take-home where the threat model is "one user, one browser tab," the localStorage token is the right complexity floor. XSS is the relevant risk; we mitigate by not rendering untrusted HTML and by scoping the token's authority to read-only queries plus user-owned mutations.

**Revisit if:** multi-tab logout coherence becomes a UX problem, or we ship to anyone other than the take-home reviewer.

## D3 — Multi-folder data model from day one, single-folder UI for now

Schema supports N folders per user and N folders per chat (`chats.folderIds: Id<"folders">[]`). UI flow is one-folder-at-a-time until the base is solid; flipping to multi-select is a frontend change only.

## D4 — Drive change detection: webhooks first, weekly cron only to renew watch channels

`files.watch` channels POST to `/drive/webhook`. Channels expire after ~7 days, so one cron renews them. No polling for changes — polling is what we explicitly didn't want.

## D5 — Extraction: hybrid DIY → LlamaParse fallback

Native libs (`unpdf`, `mammoth`, `xlsx`, Drive exports) handle the 80% case for free. If extraction returns <200 chars or throws, re-queue to LlamaParse. Best of both: free for the common case, robust for scanned PDFs and ugly tables.
