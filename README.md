# Talk to a Folder

Authenticate with Google, paste (or pick) a Drive folder, and have a real conversation with everything inside it. Answers stream in with footnote-style citations that open the source document scrolled to the exact span the agent cited.

Built for Tenex as a take-home. The bar was "ship a system, not a demo" — so the pipeline is durable, the live-updates are real (not polled), the search is vector-based, and the citations are span-level.

**Live (preview):** _(add Vercel URL once deployed)_

**Demo video:** _(add YouTube link)_

---

## What it does

1. **Sign in with Google.** OAuth with PKCE, `drive.readonly` scope, refresh-token persistence on the server. No client-side token handling.
2. **Pick a folder.** Search your Drive folders inline, or paste any folder share link.
3. **Watch indexing live.** Files cycle through `queued → downloading → extracting → embedding → indexed` via Convex's reactive sync engine. Open the app in two tabs and they stay in lock-step.
4. **Chat.** Streaming responses from Claude Sonnet 4.6 with a `searchFolder` tool over a per-folder RAG namespace.
5. **Click a citation.** A side panel opens the source file scrolled to the exact span that supported the claim, highlighted.
6. **Re-index automatically.** A Drive `changes.watch` webhook fires when a file is added, modified, or deleted, and the indexing workflow picks up just the affected files.

## Architecture

```
React SPA  ──►  Convex (one backend, no Vercel functions)
                │
                ├─ Auth: custom Google OAuth flow (PKCE) — see decisions.md D1
                ├─ Workflow: durable indexFolderWorkflow
                │    ├─ for each file (parallelism 5):
                │    │     download → File Storage → extract → chunk → embed
                │    └─ rate-limited at Drive + OpenAI boundaries
                ├─ Agent: Claude Sonnet 4.6 + searchFolder tool over RAG
                ├─ HTTP: /auth/google/{start,callback}, /drive/webhook
                ├─ Cron: daily channel-renewal sweep (the ONLY cron)
                └─ Components: workflow / rag / agent / rate-limiter
```

### Stack

- **Frontend:** React 19 + Vite + Tailwind v4 + TypeScript. No Next.js — Convex is the entire backend, including HTTP webhooks.
- **Backend:** Convex with these components:
  - [`@convex-dev/workflow`](https://www.convex.dev/components/workflow) — durable, retryable indexing pipeline
  - [`@convex-dev/rag`](https://www.convex.dev/components/rag) — vector embeddings + retrieval per folder namespace
  - [`@convex-dev/agent`](https://www.convex.dev/components/agent) — chat thread storage, streaming, tool orchestration
  - [`@convex-dev/rate-limiter`](https://www.convex.dev/components/rate-limiter) — token bucket on Drive + OpenAI calls
- **AI:**
  - Claude Sonnet 4.6 via `@ai-sdk/anthropic` (chat agent)
  - OpenAI `text-embedding-3-small` (1536 dims, cheap, plenty for folder scale)
- **Extraction:** `unpdf` for PDFs, `mammoth` for .docx, `xlsx` (SheetJS) for spreadsheets, Drive's `files.export` for Google-native formats, plus a LlamaParse fallback for thin/failed native extractions (scanned PDFs, image-heavy docs).

### Key design decisions

See `decisions.md` for the full log. Highlights:

- **D1 — Custom Google OAuth (not `@convex-dev/auth`).** Convex Auth consumes provider tokens internally; this app's entire value is calling Drive on the user's behalf, so we need persistent access. Custom flow is ~150 lines of HTTP actions.
- **D4 — Webhooks, not polling.** One `changes.watch` channel per user feeds real-time change notifications to a Convex HTTP route. The only cron is a daily channel-renewal sweep (Drive channels max at ~7 days).
- **D5 — Hybrid extraction.** Native libraries handle ~80% of files for free. LlamaParse is only invoked when native extraction returns less than 200 chars or throws.

---

## Run locally

### Prerequisites

- Node.js 20+
- A Convex account (free tier is fine)
- A Google Cloud project with the Drive API enabled and an OAuth 2.0 Web Application credential
- An OpenAI API key (for embeddings)
- An Anthropic API key (for the chat agent)
- Optional: a LlamaParse API key for the scanned-PDF fallback

### Google Cloud setup

1. Create a project at https://console.cloud.google.com
2. **APIs & Services → Library:** enable **Google Drive API**
3. **OAuth consent screen:** External user type, add your test email(s), add the scope `https://www.googleapis.com/auth/drive.readonly`
4. **Credentials → Create OAuth client ID → Web application:**
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `https://<your-convex-deployment>.convex.site/auth/google/callback` (you'll get the exact URL after `npx convex dev` provisions the deployment)

### Install + deploy

```bash
# clone + install
git clone https://github.com/Dan-Cleary/talk-to-a-folder.git
cd talk-to-a-folder
npm install

# provision Convex dev (first run will create a new project + .env.local)
npx convex dev
# (now copy the convex.site URL into Google Cloud's authorized redirect URIs)

# push secrets to Convex
npx convex env set SITE_URL "http://localhost:5173"
npx convex env set GOOGLE_CLIENT_ID    "<your client id>"
npx convex env set GOOGLE_CLIENT_SECRET "<your client secret>"
npx convex env set OPENAI_API_KEY      "<your openai key>"
npx convex env set ANTHROPIC_API_KEY   "<your anthropic key>"

# optional: LlamaParse fallback for scanned PDFs / hard files
npx convex env set LLAMA_CLOUD_API_KEY "<your llama cloud key>"

# run the SPA
npm run dev
# open http://localhost:5173, click Sign in with Google
```

### Testing

```bash
npx tsc -b        # typecheck end-to-end
npm run lint      # ESLint
```

The included `gstack browse` headless-browser harness (in `.claude/skills/`) was used to do an automated end-to-end test of the OAuth → folder pick → chat → citation flow during development.

---

## Deploy

### Convex (backend)

```bash
npx convex deploy --prod
```

Then mirror your dev env vars onto the prod deployment:

```bash
npx convex env set --prod SITE_URL "https://<your-vercel-url>"
npx convex env set --prod GOOGLE_CLIENT_ID    "..."
npx convex env set --prod GOOGLE_CLIENT_SECRET "..."
npx convex env set --prod OPENAI_API_KEY      "..."
npx convex env set --prod ANTHROPIC_API_KEY   "..."
```

Add `https://<prod-convex-deployment>.convex.site/auth/google/callback` to your Google OAuth client's Authorized Redirect URIs.

### Vercel (frontend)

```bash
vercel --prod
# Set VITE_CONVEX_URL and VITE_CONVEX_SITE_URL to your prod Convex deployment.
```

---

## What's intentionally not in here

- **No SSR.** Vite builds a static SPA. Convex is the backend; there's no `/api/*` to render.
- **Edits to Drive files.** The OAuth scope is read-only by design.
- **Sharing chats between users.** A chat is scoped to its creator.
- **OCR for scanned PDFs without a LlamaParse key.** Falls back to "skipped with reason."

## Known limitations and what I'd do next

- The agent searches once per question with a single query. For "summarize each file" style prompts it sometimes only sees the top-ranked file. Fix: a second tool that lists entries in the folder and a system-prompt rule to fan out per file when the user asks across the folder.
- Removing a file in Drive currently deletes its row but leaves the RAG entry behind (orphaned vector). Adding a `rag.delete(namespace, key)` call on delete is a one-line follow-up.
- The webhook handler trusts `X-Goog-Channel-ID` without verifying the `X-Goog-Channel-Token` shared secret it stores. The secret already gets generated and stashed; the verification step is the missing piece.
- Multi-folder chat is wired in the schema (one chat could span N folders) but the UI only exposes one folder per chat.
