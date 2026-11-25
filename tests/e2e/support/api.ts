// Calls the app's to-do API (backend-dev's Option A contract, tasks/3/TASK_BRIEF.md Handoff) over real HTTP.
// Each Api uses its own request context with no stored cookies: the only session it sends is the explicit Cookie
// header, so one test's session can never leak into another call.
import { expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";
import { APP_ORIGIN } from "./env";
import { cookieHeader, type SessionCookie } from "./auth";

export type Todo = { id: string; title: string; done: boolean; created_at: string };
export type ErrorBody = { error: { code: string; message: string } };

export type CallOpts = {
  /** Override or drop (`null`) headers. Defaults: Origin = app origin, Content-Type = application/json (with a body). */
  headers?: Record<string, string | null>;
  /** Raw body text. If `json` is given instead, it is JSON.stringify'd. */
  body?: string;
  json?: unknown;
};

export type Result = { status: number; text: string; json: unknown; headers: Record<string, string>; response: APIResponse };

export class Api {
  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly cookies: SessionCookie[] | undefined,
  ) {}

  static async create(cookies?: SessionCookie[]): Promise<Api> {
    const ctx = await request.newContext({ baseURL: APP_ORIGIN, maxRedirects: 0 });
    return new Api(ctx, cookies);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  async call(method: string, path: string, opts: CallOpts = {}): Promise<Result> {
    const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
    const headers: Record<string, string | null> = {};
    if (method !== "GET" && method !== "HEAD") headers.origin = APP_ORIGIN;
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookies && this.cookies.length > 0) headers.cookie = cookieHeader(this.cookies);
    for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v;
    const finalHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) if (v !== null) finalHeaders[k] = v;
    // Always a Buffer: with a JSON content type, Playwright JSON-encodes a string `data` that isn't valid JSON
    // (playwright-core coreBundle.js, isJsonContentType + isJsonParsable), so `not json` would arrive as
    // `"not json"`. A Buffer is sent byte for byte.
    const data = body === undefined ? undefined : Buffer.from(body, "utf8");
    const response = await this.ctx.fetch(path, { method, headers: finalHeaders, data, failOnStatusCode: false });
    const text = await response.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: response.status(), text, json, headers: response.headers(), response };
  }

  list(opts?: CallOpts) {
    return this.call("GET", "/api/todos", opts);
  }
  get(id: string, opts?: CallOpts) {
    return this.call("GET", `/api/todos/${encodeURIComponent(id)}`, opts);
  }
  create(json: unknown, opts?: CallOpts) {
    return this.call("POST", "/api/todos", { json, ...opts });
  }
  patch(id: string, json: unknown, opts?: CallOpts) {
    return this.call("PATCH", `/api/todos/${encodeURIComponent(id)}`, { json, ...opts });
  }
  del(id: string, opts?: CallOpts) {
    return this.call("DELETE", `/api/todos/${encodeURIComponent(id)}`, opts);
  }
}

/** Asserts the error format `{"error":{"code","message"}}` with the given status and (optionally) code. */
export function expectError(r: Result, status: number, code?: string): ErrorBody {
  expect(r.status, `status (body: ${r.text.slice(0, 200)})`).toBe(status);
  const body = r.json as ErrorBody;
  expect(body, "error body is JSON").toBeTruthy();
  expect(Object.keys(body)).toEqual(["error"]);
  expect(typeof body.error.code).toBe("string");
  expect(typeof body.error.message).toBe("string");
  if (code) expect(body.error.code).toBe(code);
  expectNoLeak(r.text);
  return body;
}

/** Error responses never carry a stack trace, SQL / Postgres details or constraint names (brief, AC preamble). */
export function expectNoLeak(text: string): void {
  for (const bad of [/\bat \S+ \(/, /stack/i, /postgres/i, /sqlstate/i, /todos_title_/, /violates/i, /\bselect\b.*\bfrom\b/i, /42501|23514|23502|22P02/]) {
    expect(bad.test(text), `response leaks ${bad}`).toBe(false);
  }
}

export const RANDOM_UUID = "7b0c1e2a-9f4d-4c3b-8a6e-0d5f4e3c2b1a";
