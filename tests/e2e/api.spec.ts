// Task 3, the to-do API contract (backend-dev Option A) and duplicate / rapid actions at the API: AC43, AC44, AC45.
import { test, expect } from "./support/fixtures";
import { expectError, type Todo } from "./support/api";
import { newUser } from "./support/auth";
import { isUuid, lit, rows, seedTodo, todoById, todosOf, uuidLit } from "./support/db";

test.describe("API contract (Option A)", () => {
  test("list, create, read, change and delete as the owner return the documented shapes", async ({ api }) => {
    const user = await newUser("contract");
    const a = await api(user.cookies);

    const empty = await a.list();
    expect(empty.status).toBe(200);
    expect(empty.json).toEqual({ todos: [] });

    const created = await a.create({ title: "Contract one" });
    expect(created.status).toBe(201);
    const todo = (created.json as { todo: Todo }).todo;
    expect(Object.keys(todo).sort()).toEqual(["created_at", "done", "id", "title"]);
    expect(isUuid(todo.id)).toBe(true);
    expect(todo).toMatchObject({ title: "Contract one", done: false });

    const read = await a.get(todo.id);
    expect(read.status).toBe(200);
    expect(read.json).toEqual({ todo });

    const changed = await a.patch(todo.id, { done: true });
    expect(changed.status).toBe(200);
    expect((changed.json as { todo: Todo }).todo).toEqual({ ...todo, done: true });

    const list = await a.list();
    expect((list.json as { todos: Todo[] }).todos).toEqual([{ ...todo, done: true }]);

    const deleted = await a.del(todo.id);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe("");
    expect(todoById(todo.id)).toBeUndefined();
  });

  test("list order is newest first (created_at desc, id desc)", async ({ api }) => {
    const user = await newUser("order");
    for (let i = 0; i < 4; i++) seedTodo(user.id, `Order ${i}`, { ageSeconds: 400 - i * 100 });
    const r = await (await api(user.cookies)).list();
    expect((r.json as { todos: Todo[] }).todos.map((t) => t.title)).toEqual(["Order 3", "Order 2", "Order 1", "Order 0"]);
    expect((r.json as { todos: Todo[] }).todos.map((t) => t.id)).toEqual(todosOf(user.id).map((t) => t.id));
  });

  test("unsupported methods give 405 in the error format", async ({ api, userA }) => {
    const a = await api(userA.cookies);
    const id = seedTodo(userA.id, "Method target");
    expectError(await a.call("PUT", "/api/todos", { json: { title: "x" } }), 405, "method_not_allowed");
    expectError(await a.call("DELETE", "/api/todos"), 405, "method_not_allowed");
    expectError(await a.call("POST", `/api/todos/${id}`, { json: { title: "x" } }), 405, "method_not_allowed");
    expectError(await a.call("PUT", `/api/todos/${id}`, { json: { title: "x" } }), 405, "method_not_allowed");
  });
});

test.describe("duplicate and rapid actions at the API (AC43-AC45)", () => {
  for (const target of [true, false]) {
    test(`AC43: two 'done = ${target}' requests, sequential and parallel, both succeed and X stays ${target}`, async ({ api, userA }) => {
      const x = seedTodo(userA.id, `AC43 ${target}`, { done: !target });
      const a = await api(userA.cookies);
      for (const r of [await a.patch(x, { done: target }), await a.patch(x, { done: target })]) {
        expect(r.status).toBe(200);
        expect((r.json as { todo: Todo }).todo.done).toBe(target);
      }
      expect(todoById(x)?.done).toBe(target);
      const parallel = await Promise.all([a.patch(x, { done: target }), a.patch(x, { done: target })]);
      for (const r of parallel) expect(r.status).toBe(200);
      expect(todoById(x)?.done).toBe(target);
    });
  }

  test("AC44: after X is deleted, toggling, editing, reading or deleting X again returns 404 and creates no row", async ({ api, userA }) => {
    const x = seedTodo(userA.id, "AC44 gone");
    const a = await api(userA.cookies);
    expect((await a.del(x)).status).toBe(204);
    const count = todosOf(userA.id).length;
    expectError(await a.patch(x, { done: true }), 404, "not_found");
    expectError(await a.patch(x, { title: "AC44 resurrected" }), 404, "not_found");
    expectError(await a.get(x), 404, "not_found");
    expectError(await a.del(x), 404, "not_found");
    expect(todoById(x)).toBeUndefined();
    expect(todosOf(userA.id)).toHaveLength(count);
    expect(rows(`select 1 from public.todos where title = 'AC44 resurrected'`)).toEqual([]);
  });

  test("AC45: 20 parallel creates give exactly 20 rows, each with its own title, all owned by the user", async ({ api }) => {
    const user = await newUser("ac45");
    const a = await api(user.cookies);
    // Titles carry this user's id, so rows from earlier runs on the shared stack never count as "another user".
    const tag = `Parallel ${user.id}`;
    const titles = Array.from({ length: 20 }, (_, i) => `${tag} ${String(i).padStart(2, "0")}`);
    const results = await Promise.all(titles.map((title) => a.create({ title })));
    for (const r of results) expect(r.status).toBe(201);
    const stored = todosOf(user.id);
    expect(stored).toHaveLength(20);
    expect(stored.map((t) => t.title).sort()).toEqual(titles);
    const elsewhere = rows<{ n: number }>(
      `select count(*)::int as n from public.todos where starts_with(title, ${lit(tag)}) and user_id <> ${uuidLit(user.id)}`,
    );
    expect(elsewhere[0].n, "rows for any other user").toBe(0);
  });
});
