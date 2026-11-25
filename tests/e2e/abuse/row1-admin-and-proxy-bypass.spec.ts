// Baseline row 1 (type /admin): AC20, AC21 and threat model T1 (proxy-bypass headers), T2 (forged tokens).
// Every to-do API must authorize itself; the proxy is never the check.
import { test, expect } from "../support/fixtures";
import { RANDOM_UUID, expectError, type Result } from "../support/api";
import { forgedSessionCookies } from "../support/auth";
import { seedTodo, todoById, todosOf, todosWithTitle } from "../support/db";
import { APP_ORIGIN } from "../support/env";
import { LIST_PATH } from "../support/ui";

test.describe("row 1: no admin surface (AC20)", () => {
  for (const signedIn of [false, true]) {
    test(`AC20: /admin, /api/admin, /api/admin/todos return 404 and no data (${signedIn ? "signed in as A" : "signed out"})`, async ({ api, userA }) => {
      const title = `AC20 private ${userA.id.slice(0, 8)}`;
      seedTodo(userA.id, title);
      const client = await api(signedIn ? userA.cookies : undefined);
      const page = await client.call("GET", "/admin");
      expect(page.status, "/admin").toBe(404);
      expect(page.text).not.toContain(title);
      for (const path of ["/api/admin", "/api/admin/todos"]) {
        for (const method of ["GET", "POST", "DELETE"]) {
          const r = await client.call(method, path, method === "POST" ? { json: { title: "x" } } : {});
          expectError(r, 404, "not_found");
          expect(r.text).not.toContain(title);
        }
      }
    });
  }
});

// Threat model 2, row 1, T1: one header at a time. `<A's id>` is filled in per test.
const BYPASS_HEADERS: [string, string][] = [
  ["x-middleware-subrequest", "middleware"],
  ["x-middleware-subrequest", "proxy"],
  ["x-middleware-subrequest", "middleware:middleware:middleware:middleware:middleware"],
  ["x-middleware-subrequest", "proxy:proxy:proxy:proxy:proxy"],
  ["x-middleware-subrequest", "src/middleware"],
  ["x-middleware-prefetch", "1"],
  ["next-router-prefetch", "1"],
  ["purpose", "prefetch"],
  ["sec-purpose", "prefetch"],
  ["x-nextjs-data", "1"],
  ["x-user-id", "<A's id>"],
];

test.describe("row 1: the API checks the session itself (AC21, T1)", () => {
  for (const [name, rawValue] of BYPASS_HEADERS) {
    test(`AC21/T1: no session + ${name}: ${rawValue} -> every to-do API 401, list page has no data, DB unchanged`, async ({ api, userA }) => {
      const value = rawValue === "<A's id>" ? userA.id : rawValue;
      const title = `T1 private ${userA.id.slice(0, 8)}`;
      const id = todosWithTitle(title)[0]?.id ?? seedTodo(userA.id, title);
      const before = todoById(id);
      const created = `T1 must not exist ${name} ${rawValue}`;
      const client = await api();
      const headers = { [name]: value };

      for (const r of [
        await client.list({ headers }),
        await client.get(id, { headers }),
        await client.create({ title: created }, { headers }),
        await client.patch(id, { done: true, title: "T1 changed" }, { headers }),
        await client.del(id, { headers }),
      ]) {
        expectError(r, 401, "unauthorized");
        expect(r.text).not.toContain(title);
      }
      const page = await client.call("GET", LIST_PATH, { headers });
      expect(page.status, "list page is not served with data").not.toBe(500);
      expect(page.text).not.toContain(title);
      expect(todoById(id)).toEqual(before);
      expect(todosWithTitle(created)).toHaveLength(0);
    });
  }
});

// Threat model 3.7: `rsc: 1` on the API is a documented exception (option (a)). Next answers 307 to
// `<same path>?_rsc` before any handler runs; following it must reach the handler, whose getUser() gives 401.
// This is the exact assertion from 3.7. The page case of T1 is unchanged.
test.describe("row 1: rsc: 1 on the API, documented exception (AC21/T1, threat model 3.7)", () => {
  type Op = { op: string; method: string; path: (id: string) => string; json?: unknown };
  const OPS: Op[] = [
    { op: "list", method: "GET", path: () => "/api/todos" },
    { op: "create", method: "POST", path: () => "/api/todos", json: { title: "T1 rsc must not exist" } },
    { op: "read", method: "GET", path: (id) => `/api/todos/${id}` },
    { op: "change", method: "PATCH", path: (id) => `/api/todos/${id}`, json: { done: true, title: "T1 rsc changed" } },
    { op: "delete", method: "DELETE", path: (id) => `/api/todos/${id}` },
  ];
  const snapshot = (userId: string) =>
    JSON.stringify(todosOf(userId).map((t) => ({ id: t.id, title: t.title, done: t.done, updated_at: t.updated_at })));
  const setCookies = (r: Result) =>
    r.response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
  const sbSetsValue = (c: string) => /^sb-[^=]*=[^;]+/.test(c) && !/^sb-[^=]*=;/.test(c);
  const isDeletion = (c: string) => /^[^=]+=(;|$)/.test(c) && (/max-age=0(;|$)/i.test(c) || /expires=[^;]*19[67]\d/i.test(c));

  function expectRscRedirect(r: Result, path: string): string {
    expect(r.status, `first status (body: ${r.text.slice(0, 100)})`).toBe(307);
    const location = r.headers["location"] ?? "";
    const target = new URL(location, APP_ORIGIN);
    expect(target.origin, "Location origin").toBe(APP_ORIGIN);
    expect(target.pathname, "Location path").toBe(path);
    expect(target.search, "Location query").toMatch(/^\?_rsc(=[^&]*)?$/);
    expect(r.text, "307 body").toBe("");
    return target.pathname + target.search;
  }

  for (const o of OPS) {
    test(`AC21/T1: no session + rsc: 1 on ${o.op} -> 307 to ?_rsc (empty, no Set-Cookie), followed -> 401; A's rows unchanged`, async ({ api, userA }) => {
      const title = `T1 private ${userA.id.slice(0, 8)}`;
      const id = todosWithTitle(title)[0]?.id ?? seedTodo(userA.id, title);
      const before = snapshot(userA.id);
      const client = await api();
      const headers = { rsc: "1", origin: APP_ORIGIN, "content-type": "application/json" };
      const path = o.path(id);
      const first = await client.call(o.method, path, { headers, json: o.json });
      const next = expectRscRedirect(first, path);
      expect(setCookies(first), "Set-Cookie on the 307").toEqual([]);

      const followed = await client.call(o.method, next, { headers, json: o.json });
      expectError(followed, 401, "unauthorized");
      for (const leak of [title, id, userA.id, '"title"', '"done"']) expect(followed.text.includes(leak), `401 body contains ${leak}`).toBe(false);
      expect(setCookies(followed).filter(sbSetsValue), "non-empty sb-* Set-Cookie on the 401").toEqual([]);

      expect(snapshot(userA.id), "A's rows").toBe(before);
      expect(todosWithTitle("T1 rsc must not exist")).toHaveLength(0);
    });
  }

  test("AC21/T1: no session + rsc: 1 on the list page -> no to-do data (page case unchanged)", async ({ api, userA }) => {
    const title = `T1 private ${userA.id.slice(0, 8)}`;
    if (todosWithTitle(title).length === 0) seedTodo(userA.id, title);
    const client = await api();
    const page = await client.call("GET", LIST_PATH, { headers: { rsc: "1" } });
    expect(page.status, "list page is not served with data").not.toBe(500);
    expect(page.text).not.toContain(title);
  });

  test("AC21/T1: rsc: 1 with a forged session cookie -> 307 whose Set-Cookie may only delete; A's rows unchanged", async ({ api, userA }) => {
    const title = `T1 private ${userA.id.slice(0, 8)}`;
    const id = todosWithTitle(title)[0]?.id ?? seedTodo(userA.id, title);
    const before = snapshot(userA.id);
    const client = await api(forgedSessionCookies("alg-none", userA.id));
    const headers = { rsc: "1", origin: APP_ORIGIN, "content-type": "application/json" };
    for (const o of OPS) {
      const path = o.path(id);
      const first = await client.call(o.method, path, { headers, json: o.json });
      expectRscRedirect(first, path);
      for (const c of setCookies(first)) {
        expect(sbSetsValue(c), `${o.op}: Set-Cookie sets a non-empty sb-* value`).toBe(false);
        expect(isDeletion(c), `${o.op}: Set-Cookie on the 307 only deletes`).toBe(true);
      }
    }
    expect(snapshot(userA.id), "A's rows").toBe(before);
  });
});

test.describe("row 1: forged session tokens (T2)", () => {
  for (const kind of ["wrong-key", "alg-none", "expired", "random"] as const) {
    test(`T2: a ${kind} access token in the session cookie gets 401 on every to-do API, DB unchanged`, async ({ api, userA }) => {
      const title = `T2 private ${userA.id.slice(0, 8)}`;
      const id = todosWithTitle(title)[0]?.id ?? seedTodo(userA.id, title);
      const before = todoById(id);
      const created = `T2 must not exist ${kind}`;
      const client = await api(forgedSessionCookies(kind, userA.id));
      for (const r of [
        await client.list(),
        await client.get(id),
        await client.create({ title: created }),
        await client.patch(id, { done: true }),
        await client.del(id),
        await client.del(RANDOM_UUID),
      ]) {
        expectError(r, 401, "unauthorized");
        expect(r.text).not.toContain(title);
      }
      expect(todoById(id)).toEqual(before);
      expect(todosWithTitle(created)).toHaveLength(0);
    });
  }
});
