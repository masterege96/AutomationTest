// Baseline row 8 (admin at signup / mass assignment): AC27-AC30.
import { test, expect } from "../support/fixtures";
import { RANDOM_UUID, expectError } from "../support/api";
import { requestOtpDirect, rest, sessionFor } from "../support/auth";
import { testEmail } from "../support/env";
import { authUsersByEmail, seedTodo, todoById, todosOf, todosWithTitle } from "../support/db";

test.describe("row 8: metadata at sign-up grants nothing (AC27)", () => {
  test("AC27: a code request with data {role: admin, is_admin: true} gives a normal user limited to own to-dos", async ({ api, userA }) => {
    const email = testEmail("ac27");
    expect(await requestOtpDirect(email, { role: "admin", is_admin: true })).toBe(200);
    const [row] = authUsersByEmail(email);
    expect(row, "user was created").toBeTruthy();
    const app = row.raw_app_meta_data ?? {};
    for (const key of ["role", "is_admin", "admin", "roles"]) expect(app, `raw_app_meta_data.${key}`).not.toHaveProperty(key);
    expect(JSON.stringify(app)).not.toMatch(/admin/i);

    const evil = await sessionFor(email);
    const victimTitle = `AC27 victim ${userA.id.slice(0, 8)}`;
    const x = seedTodo(userA.id, victimTitle);
    const before = todoById(x);
    const client = await api(evil.cookies);
    const list = await client.list();
    expect(list.status).toBe(200);
    expect(list.json).toEqual({ todos: [] });
    expectError(await client.get(x), 404, "not_found");
    expectError(await client.patch(x, { done: true }), 404, "not_found");
    expectError(await client.del(x), 404, "not_found");
    const restSel = await rest("GET", `todos?id=eq.${x}&select=*`, { token: evil.accessToken });
    expect(restSel.body).toEqual([]);
    expect(todoById(x)).toEqual(before);
  });
});

test.describe("row 8: strict field whitelist at the API (AC28, AC29)", () => {
  const PAST = "2000-01-01T00:00:00.000Z";

  test("AC28: create with any field besides title -> 400 and no row", async ({ api, userA, userB }) => {
    const a = await api(userA.cookies);
    const extras: [string, Record<string, unknown>][] = [
      ["user_id = B", { user_id: userB.id }],
      ["id", { id: RANDOM_UUID }],
      ["done = true", { done: true }],
      ["created_at", { created_at: PAST }],
      ["updated_at", { updated_at: PAST }],
      ["unknown field", { priority: 1 }],
      ["role", { role: "admin" }],
      ["__proto__", JSON.parse('{"__proto__":{"admin":true}}') as Record<string, unknown>],
    ];
    const beforeA = todosOf(userA.id).length;
    const beforeB = todosOf(userB.id).length;
    for (const [label, extra] of extras) {
      const title = `AC28 ${label}`;
      expectError(await a.create({ title, ...extra }), 400, "validation_failed");
      expect(todosWithTitle(title), label).toHaveLength(0);
    }
    expect(todosOf(userA.id)).toHaveLength(beforeA);
    expect(todosOf(userB.id)).toHaveLength(beforeB);
    expect(todoById(RANDOM_UUID)).toBeUndefined();
  });

  test("AC29: a change with user_id, id, created_at or unknown fields -> 400; X unchanged and still A's", async ({ api, userA, userB }) => {
    const x = seedTodo(userA.id, "AC29 target", { ageSeconds: 3600 });
    const before = todoById(x);
    const a = await api(userA.cookies);
    const bodies: [string, Record<string, unknown>][] = [
      ["user_id = B", { user_id: userB.id }],
      ["user_id = B + title", { user_id: userB.id, title: "AC29 moved" }],
      ["user_id = B + done", { user_id: userB.id, done: true }],
      ["id", { id: RANDOM_UUID }],
      ["id + done", { id: RANDOM_UUID, done: true }],
      ["created_at", { created_at: PAST }],
      ["created_at + title", { created_at: PAST, title: "AC29 renamed" }],
      ["updated_at", { updated_at: PAST }],
      ["unknown + done", { priority: 1, done: true }],
      ["unknown + title", { owner: "admin", title: "AC29 renamed" }],
    ];
    for (const [label, body] of bodies) {
      expectError(await a.patch(x, body), 400, "validation_failed");
      expect(todoById(x), label).toEqual(before);
    }
    expect(todosOf(userB.id).some((t) => t.id === x)).toBe(false);
  });
});

test.describe("row 8: the database refuses ownership changes (AC30)", () => {
  test("AC30: with A's token against Supabase REST, insert as B and update own to-do to B are rejected", async ({ userA, userB }) => {
    const title = `AC30 spoof ${userA.id.slice(0, 8)}`;
    const ins = await rest("POST", "todos", { token: userA.accessToken, body: { title, user_id: userB.id } });
    expect(ins.status).toBeGreaterThanOrEqual(400);
    expect(todosWithTitle(title)).toHaveLength(0);

    const x = seedTodo(userA.id, "AC30 own");
    const before = todoById(x);
    const upd = await rest("PATCH", `todos?id=eq.${x}`, { token: userA.accessToken, body: { user_id: userB.id } });
    expect(upd.status).toBeGreaterThanOrEqual(400);
    expect(todoById(x)).toEqual(before);
    expect(todoById(x)?.user_id).toBe(userA.id);
  });
});
