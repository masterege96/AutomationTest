// Baseline row 1 (type /admin): AC20, AC21 and threat model T1 (proxy-bypass headers), T2 (forged tokens).
// Every to-do API must authorize itself; the proxy is never the check.
import { test, expect } from "../support/fixtures";
import { RANDOM_UUID, expectError } from "../support/api";
import { forgedSessionCookies } from "../support/auth";
import { seedTodo, todoById, todosWithTitle } from "../support/db";
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
  ["rsc", "1"],
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
