// Baseline row 14 (query your database): AC38 (RLS on, owner policies) and AC39 (anon key alone gets nothing),
// checked live on the local stack. pgTAP (supabase/tests/03_todos_test.sql, db-builder) covers the same rows in
// depth; AC40 grants and AC41 (no SQL from strings) are pgTAP and code review.
import { test, expect } from "../support/fixtures";
import { rest } from "../support/auth";
import { rows, seedTodo, todoById, todosWithTitle } from "../support/db";

test("AC38: public.todos has RLS enabled and four owner-only policies for authenticated", async () => {
  const [t] = rows<{ rls: boolean }>(
    `select relrowsecurity as rls from pg_class where oid = 'public.todos'::regclass`,
  );
  expect(t.rls).toBe(true);
  const policies = rows<{ name: string; cmd: string; roles: string[]; qual: string | null; check: string | null }>(
    `select polname as name, polcmd::text as cmd,
            array(select rolname::text from pg_roles where oid = any(polroles)) as roles,
            pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as check
       from pg_policy where polrelid = 'public.todos'::regclass order by polname`,
  );
  expect(policies.map((p) => p.cmd).sort()).toEqual(["a", "d", "r", "w"]);
  for (const p of policies) {
    expect(p.roles, p.name).toEqual(["authenticated"]);
    for (const expr of [p.qual, p.check]) if (expr !== null) expect(expr, p.name).toContain("auth.uid()");
  }
  // Every table in public has RLS on (the same rule verify.sh checks statically).
  const off = rows<{ name: string }>(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
  );
  expect(off).toEqual([]);
});

test("AC39: the anon key without a user token can't read, insert, update or delete to-dos", async ({ userA }) => {
  const title = `AC39 private ${userA.id.slice(0, 8)}`;
  const x = seedTodo(userA.id, title);
  const before = todoById(x);

  const sel = await rest("GET", "todos?select=*");
  expect(sel.status === 200 ? sel.body : [], "select returns nothing").toEqual([]);
  expect(JSON.stringify(sel.body)).not.toContain(title);

  const ins = await rest("POST", "todos", { body: { title: "AC39 anon insert" } });
  expect(ins.status).toBeGreaterThanOrEqual(400);
  expect(todosWithTitle("AC39 anon insert")).toHaveLength(0);

  const upd = await rest("PATCH", `todos?id=eq.${x}`, { body: { done: true } });
  expect(upd.status === 200 ? upd.body : [], "update affects nothing").toEqual([]);
  const del = await rest("DELETE", `todos?id=eq.${x}`);
  expect(del.status === 200 ? del.body : [], "delete affects nothing").toEqual([]);
  expect(todoById(x)).toEqual(before);
});
