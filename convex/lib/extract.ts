"use node";

import { extractText } from "unpdf";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MIN_USABLE_CHARS = 200;

export type ExtractResult = {
  text: string;
  /** True if we got something but think it's too thin to be useful. */
  thin: boolean;
  /** Optional structured detail for debugging. */
  meta?: Record<string, unknown>;
};

/**
 * Extract plain text from a file. Caller has already exported Google-native
 * formats to a supported MIME type (text/plain, text/csv, etc).
 */
export async function extractFromBytes(
  mimeType: string,
  data: ArrayBuffer,
): Promise<ExtractResult> {
  const text = await extractByMime(mimeType, data);
  return {
    text,
    thin: text.length < MIN_USABLE_CHARS,
  };
}

async function extractByMime(
  mimeType: string,
  data: ArrayBuffer,
): Promise<string> {
  // Plain text family
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return new TextDecoder().decode(data);
  }

  if (mimeType === "application/pdf") {
    const { text } = await extractText(new Uint8Array(data), {
      mergePages: true,
    });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(data),
    });
    return value;
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const wb = XLSX.read(data, { type: "array" });
    return wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `# Sheet: ${name}\n${csv}`;
    }).join("\n\n");
  }

  // PPTX: out of scope for v1. Caller marks as skipped.
  return "";
}

/**
 * Chunk text into ~1000-token chunks (rough char heuristic: 4 chars ≈ 1 token).
 * Returns array of { text, startChar, endChar } for span-level citation.
 */
export function chunkText(
  text: string,
  options: { targetChars?: number; overlapChars?: number } = {},
): Array<{ text: string; startChar: number; endChar: number }> {
  const target = options.targetChars ?? 4000;
  const overlap = options.overlapChars ?? 400;
  const out: Array<{ text: string; startChar: number; endChar: number }> = [];

  if (text.length <= target) {
    return text.trim()
      ? [{ text, startChar: 0, endChar: text.length }]
      : [];
  }

  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + target, text.length);
    // Prefer to break on a paragraph or sentence boundary near `end`.
    if (end < text.length) {
      const slice = text.slice(start, end);
      const para = slice.lastIndexOf("\n\n");
      const sent = slice.lastIndexOf(". ");
      const boundary = Math.max(para, sent);
      if (boundary > target * 0.5) {
        end = start + boundary + 1;
      }
    }
    const chunk = text.slice(start, end);
    if (chunk.trim()) out.push({ text: chunk, startChar: start, endChar: end });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}
