// API response helpers. Error format (the person, 2026-11-25): {"error":{"code","message"}}.
// Messages are fixed text: they never repeat the input and never contain a stack, SQL, constraint names or ids.

export const NO_STORE = "private, no-store";

const ERRORS = {
  invalid_json: { status: 400, message: "Request body must be valid JSON." },
  invalid_id: { status: 400, message: "Invalid to-do id." },
  validation_failed: { status: 400, message: "Request body is not valid." },
  unauthorized: { status: 401, message: "Sign in required." },
  forbidden_origin: { status: 403, message: "Cross-origin request refused." },
  not_found: { status: 404, message: "Not found." },
  method_not_allowed: { status: 405, message: "Method not allowed." },
  payload_too_large: { status: 413, message: "Request body is larger than 10 KB." },
  unsupported_media_type: { status: 415, message: "Content-Type must be application/json." },
  internal_error: { status: 500, message: "Something went wrong." },
} as const;

export type ErrorCode = keyof typeof ERRORS;

export function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": NO_STORE, ...headers } });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": NO_STORE } });
}

export function apiError(code: ErrorCode, headers?: Record<string, string>): Response {
  const { status, message } = ERRORS[code];
  return jsonResponse({ error: { code, message } }, status, headers);
}

export function methodNotAllowed(allow: string): Response {
  return apiError("method_not_allowed", { Allow: allow });
}

/**
 * Logs a server-side failure by operation and error code only (never the body, cookies, tokens or the
 * error message, which can quote input), and returns the generic 500.
 */
export function internalError(op: string, err: unknown): Response {
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : err instanceof Error
        ? err.name
        : "unknown";
  console.error(`api ${op} failed: ${code}`);
  return apiError("internal_error");
}
