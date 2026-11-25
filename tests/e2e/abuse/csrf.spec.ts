// Cross-site requests (threat model section 5): C1 foreign Origin, C2 missing / null Origin, C3 non-JSON content
// type. Each with A's valid session cookies, on create, change and delete. C4 (cookie flags) is in auth.spec.ts.
// C5 (post-login return path) applies only if frontend-dev adds a return path; see specs/3/test-plan.md.
import { test, expect } from "../support/fixtures";
import { expectError, type Api, type CallOpts } from "../support/api";
import { seedTodo, todoById, todosWithTitle } from "../support/db";

const ops = (a: Api, id: string, title: string): [string, (o: CallOpts) => ReturnType<Api["call"]>][] => [
  ["create", (o) => a.create({ title }, o)],
  ["change", (o) => a.patch(id, { title, done: true }, o)],
  ["delete", (o) => a.del(id, o)],
];

test.describe("CSRF: Origin check and JSON-only (C1-C3)", () => {
  for (const [label, origin] of [
    ["C1: Origin https://evil.example", "https://evil.example"],
    ["C1: Origin http://127.0.0.1:3001 (other port)", "http://127.0.0.1:3001"],
    ["C1: Origin http://localhost:3000 (other host name)", "http://localhost:3000"],
    ["C2: no Origin header", null],
    ["C2: Origin null", "null"],
  ] as const) {
    test(`${label} -> 403 forbidden_origin on create, change and delete; DB unchanged`, async ({ api, userA }) => {
      const id = seedTodo(userA.id, `CSRF target ${label}`);
      const before = todoById(id);
      const title = `CSRF must not exist ${label}`;
      const a = await api(userA.cookies);
      for (const [op, run] of ops(a, id, title)) {
        const r = await run({ headers: { origin: origin } });
        expectError(r, 403, "forbidden_origin");
        expect(r.headers["access-control-allow-origin"], `${op}: no CORS header`).toBeUndefined();
      }
      expect(todoById(id)).toEqual(before);
      expect(todosWithTitle(title)).toHaveLength(0);
    });
  }

  for (const contentType of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", null]) {
    test(`C3: same-origin request with Content-Type ${contentType ?? "(none)"} and a JSON body -> 415; DB unchanged`, async ({ api, userA }) => {
      const id = seedTodo(userA.id, `C3 target ${contentType}`);
      const before = todoById(id);
      const title = `C3 must not exist ${contentType}`;
      const a = await api(userA.cookies);
      const headers = { "content-type": contentType };
      expectError(await a.call("POST", "/api/todos", { body: JSON.stringify({ title }), headers }), 415, "unsupported_media_type");
      expectError(await a.call("PATCH", `/api/todos/${id}`, { body: JSON.stringify({ done: true }), headers }), 415, "unsupported_media_type");
      expect(todoById(id)).toEqual(before);
      expect(todosWithTitle(title)).toHaveLength(0);
    });
  }

  test("C1: a CORS preflight from a foreign origin gets no Access-Control-Allow-* headers", async ({ api, userA }) => {
    const a = await api(userA.cookies);
    const r = await a.call("OPTIONS", "/api/todos", {
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    for (const name of Object.keys(r.headers)) expect(name.startsWith("access-control-allow-"), name).toBe(false);
  });
});
