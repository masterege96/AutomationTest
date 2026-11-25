// Request body reading for JSON endpoints (row 5): JSON content type (415), hard 10 KB limit counted in bytes
// while streaming (413, also for chunked bodies without Content-Length), valid UTF-8 and JSON (400).
import { apiError } from "./errors";

export const MAX_BODY_BYTES = 10 * 1024;

export type BodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

export function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  return value.split(";")[0].trim().toLowerCase() === "application/json";
}

/** Reads the body up to `limit` bytes; returns null as soon as it is larger (the rest is not read). */
async function readLimited(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Content type, size and JSON checks, in that order. Call after the Origin check and getUser(). */
export async function readJsonBody(request: Request): Promise<BodyResult> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { ok: false, response: apiError("unsupported_media_type") };
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("payload_too_large") };
  }
  let bytes: Uint8Array | null;
  try {
    bytes = await readLimited(request, MAX_BODY_BYTES);
  } catch {
    return { ok: false, response: apiError("invalid_json") };
  }
  if (bytes === null) return { ok: false, response: apiError("payload_too_large") };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: apiError("invalid_json") };
  }
}
