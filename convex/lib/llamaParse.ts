"use node";

/**
 * Thin LlamaParse client. We use it as a fallback when the native
 * extractors (unpdf, mammoth, xlsx) return less than ~200 chars — which
 * usually means the file is a scanned PDF, image-heavy, or has tables
 * that defeat plain text extraction.
 *
 * Flow:
 *   1. POST /api/parsing/upload     → job id
 *   2. GET  /api/parsing/job/{id}   → status (poll)
 *   3. GET  /api/parsing/job/{id}/result/markdown → text
 */

const BASE = "https://api.cloud.llamaindex.ai/api/parsing";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export class LlamaParseError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "LlamaParseError";
  }
}

export function isLlamaParseConfigured(): boolean {
  return !!process.env.LLAMA_CLOUD_API_KEY;
}

export async function parseWithLlama(
  bytes: ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) {
    throw new LlamaParseError("LLAMA_CLOUD_API_KEY not configured");
  }

  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), filename);
  // Keep tables as markdown; cheap; sufficient for our use case.
  formData.append("parsing_instruction", "Extract text faithfully. Preserve tables as markdown.");

  const upload = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!upload.ok) {
    throw new LlamaParseError(
      `upload failed: ${await upload.text()}`,
      upload.status,
    );
  }
  const { id } = (await upload.json()) as { id: string };

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await fetch(`${BASE}/job/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!status.ok) {
      throw new LlamaParseError(
        `status check failed: ${await status.text()}`,
        status.status,
      );
    }
    const data = (await status.json()) as { status: string };
    if (data.status === "SUCCESS") {
      const result = await fetch(`${BASE}/job/${id}/result/markdown`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!result.ok) {
        throw new LlamaParseError(
          `result fetch failed: ${await result.text()}`,
          result.status,
        );
      }
      const { markdown } = (await result.json()) as { markdown: string };
      return markdown;
    }
    if (data.status === "ERROR") {
      throw new LlamaParseError("LlamaParse job errored");
    }
  }
  throw new LlamaParseError("LlamaParse job timed out");
}
