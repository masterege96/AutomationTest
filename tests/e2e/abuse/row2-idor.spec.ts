// Baseline row 2 (IDOR): AC22 through the app's API, AC23 directly against Supabase REST with A's token.
import { test, expect } from "../support/fixtures";
import { RANDOM_UUID, expectError } from "../support/api";
import { rest } from "../support/auth";
import { seedTodo, todoById } from "../support/db";

test.describe("row 2: A cannot touch B's to-do", () => {
  test("AC22: A's read, toggle, edit and delete of B's to-do return the same 404 as a missing id; X unchanged", async ({ api, userA, userB }) => {
    const title = `B secret ${userB.id.slice(0, 8)}`;
    const x = seedTodo(userB.id, title, { ageSeconds: 3600 });
    const before = todoById(x)!;
    const a = await api(userA.cookies);

    const pairs: [string, () => ReturnType<typeof a.get>, () => ReturnType<typeof a.get>][] = [
      ["read", () => a.get(x), () => a.get(RANDOM_UUID)],
      ["toggle", () => a.patch(x, { done: true }), () => a.patch(RANDOM_UUID, { done: true })],
      ["edit", () => a.patch(x, { title: "Hijacked" }), () => a.patch(RANDOM_UUID, { title: "Hijacked" })],
      ["edit + toggle", () => a.patch(x, { title: "Hijacked", done: true }), () => a.patch(RANDOM_UUID, { title: "Hijacked", done: true })],
      ["delete", () => a.del(x), () => a.del(RANDOM_UUID)],
    ];
    for (const [what, onX, onMissing] of pairs) {
      const rx = await onX();
      const rm = await onMissing();
      expectError(rx, 404, "not_found");
      expectError(rm, 404, "not_found");
      expect(rx.json, `${what}: same body as a missing id`).toEqual(rm.json);
      for (const field of [title, before.created_at, userB.id, userB.email]) {
        expect(rx.text.includes(field), `${what}: a field of X is in the response`).toBe(false);
      }
    }
    // The list shows none of B's to-dos.
    const list = await a.list();
    expect(list.status).toBe(200);
    expect(list.text).not.toContain(title);
    expect(todoById(x)).toEqual(before);
  });

  test("AC23: with A's token, Supabase REST select/update/delete of B's to-do affect 0 rows", async ({ userA, userB }) => {
    const title = `B rest secret ${userB.id.slice(0, 8)}`;
    const x = seedTodo(userB.id, title, { ageSeconds: 3600 });
    const before = todoById(x)!;
    const q = `todos?id=eq.${x}`;
    const sel = await rest("GET", `${q}&select=*`, { token: userA.accessToken });
    expect(sel.status).toBe(200);
    expect(sel.body).toEqual([]);
    const upd = await rest("PATCH", q, { token: userA.accessToken, body: { done: true, title: "Hijacked" } });
    expect(upd.status).toBe(200);
    expect(upd.body).toEqual([]);
    const del = await rest("DELETE", q, { token: userA.accessToken });
    expect(del.status).toBe(200);
    expect(del.body).toEqual([]);
    const all = await rest("GET", "todos?select=user_id", { token: userA.accessToken });
    expect((all.body as { user_id: string }[]).every((r) => r.user_id === userA.id), "A sees only own rows").toBe(true);
    expect(todoById(x)).toEqual(before);
  });
});
