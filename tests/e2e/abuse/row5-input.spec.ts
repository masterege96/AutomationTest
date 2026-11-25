// Baseline row 5 (bad input): AC16-AC19 at the API, AC26 (every invalid case to every to-do API), threat model T5.
import { test, expect } from "../support/fixtures";
import { expectError, type Todo } from "../support/api";
import { rest, type TestUser } from "../support/auth";
import { seedTodo, todoById, todosOf } from "../support/db";

const EMOJI = "\u{1F600}";

// AC17: invalid titles. [label, value]; `undefined` = field missing.
const INVALID_TITLES: [string, unknown][] = [
  ["empty", ""],
  ["spaces only", "   "],
  ["tabs only", "\t\t"],
  ["newlines only", "\n\n"],
  ["mixed whitespace only", " \t\n\r "],
  ["201 characters", "a".repeat(201)],
  ["201 characters after trimming", `  ${"a".repeat(201)}  `],
  ["201 emoji (code points)", EMOJI.repeat(201)],
  ["a number", 42],
  ["null", null],
  ["true", true],
  ["an array", ["Buy milk"]],
  ["an object", { text: "Buy milk" }],
  ["missing", undefined],
];

// AC18: done values that aren't booleans.
const INVALID_DONE: [string, unknown][] = [
  ['"true"', "true"],
  ['"false"', "false"],
  ["1", 1],
  ["0", 0],
  ["null", null],
];

// AC18: ids that aren't uuids (the id column is uuid, schema.md section 1).
const INVALID_IDS = ["123", "not-a-uuid", "00000000-0000-0000-0000-00000000000g", "7b0c1e2a9f4d4c3b8a6e0d5f4e3c2b1a0", "' or '1'='1"];

function snapshot(user: TestUser) {
  return JSON.stringify(todosOf(user.id));
}

test.describe("row 5: titles at the API (AC16, AC17, AC26)", () => {
  test("AC16: 1 char, 200 chars, 200 emoji and '  Buy milk  ' are accepted on create and edit and stored trimmed", async ({ api, userA: user }) => {
    const a = await api(user.cookies);
    const cases: [string, string][] = [
      ["z", "z"],
      ["c".repeat(200), "c".repeat(200)],
      [EMOJI.repeat(200), EMOJI.repeat(200)],
      ["  Buy milk  ", "Buy milk"],
    ];
    for (const [input, stored] of cases) {
      const created = await a.create({ title: input });
      expect(created.status, `create ${JSON.stringify(input.slice(0, 12))}`).toBe(201);
      const todo = (created.json as { todo: Todo }).todo;
      expect(todo.title).toBe(stored);
      expect(todo.done).toBe(false);
      expect(todoById(todo.id)?.title).toBe(stored);
      expect(todoById(todo.id)?.user_id).toBe(user.id);
    }
    const id = seedTodo(user.id, "Edit target");
    for (const [input, stored] of cases) {
      const edited = await a.patch(id, { title: input });
      expect(edited.status, `edit ${JSON.stringify(input.slice(0, 12))}`).toBe(200);
      expect((edited.json as { todo: Todo }).todo.title).toBe(stored);
      expect(todoById(id)?.title).toBe(stored);
    }
  });

  for (const [label, value] of INVALID_TITLES) {
    test(`AC17/AC26: create with a title that is ${label} -> 400, no row`, async ({ api, userA }) => {
      const before = snapshot(userA);
      const a = await api(userA.cookies);
      const r = await a.create(value === undefined ? {} : { title: value });
      expectError(r, 400, "validation_failed");
      if (typeof value === "string" && value.length > 20) expect(r.text.includes(value), "input echoed").toBe(false);
      expect(snapshot(userA)).toBe(before);
    });

    test(`AC17/AC26: edit with a title that is ${label} -> 400, row unchanged`, async ({ api, userA }) => {
      const id = seedTodo(userA.id, `AC17 edit ${label}`);
      const before = todoById(id);
      const a = await api(userA.cookies);
      const r = await a.patch(id, value === undefined ? {} : { title: value });
      expectError(r, 400, "validation_failed");
      expect(todoById(id)).toEqual(before);
      // The same with a valid done alongside: still rejected, nothing changes.
      if (value !== undefined) {
        expectError(await a.patch(id, { title: value, done: true }), 400, "validation_failed");
        expect(todoById(id)).toEqual(before);
      }
    });
  }
});

test.describe("row 5: other bad input (AC18, AC26)", () => {
  test("AC18: a body that isn't JSON -> 400 invalid_json on create and edit; DB unchanged", async ({ api, userA }) => {
    const id = seedTodo(userA.id, "AC18 json target");
    const before = snapshot(userA);
    const a = await api(userA.cookies);
    for (const body of ["not json", "{", '{"title":"x",}', "", "'title'"]) {
      expectError(await a.call("POST", "/api/todos", { body, headers: { "content-type": "application/json" } }), 400, "invalid_json");
      expectError(await a.call("PATCH", `/api/todos/${id}`, { body, headers: { "content-type": "application/json" } }), 400, "invalid_json");
    }
    expect(snapshot(userA)).toBe(before);
  });

  test("AC18: a body over 10 KB -> 413 on create and edit; DB unchanged", async ({ api, userA }) => {
    const id = seedTodo(userA.id, "AC18 size target");
    const before = snapshot(userA);
    const a = await api(userA.cookies);
    const big = JSON.stringify({ title: "a".repeat(10_241) });
    expectError(await a.call("POST", "/api/todos", { body: big }), 413, "payload_too_large");
    expectError(await a.call("PATCH", `/api/todos/${id}`, { body: big }), 413, "payload_too_large");
    // Multi-byte: 3,500 x a 3-byte character is 10,500 bytes but only 3,500 characters.
    const wide = JSON.stringify({ title: "€".repeat(3_500) });
    expectError(await a.call("POST", "/api/todos", { body: wide }), 413, "payload_too_large");
    expect(snapshot(userA)).toBe(before);
  });

  test("AC18: an id that isn't a uuid -> 400 invalid_id on read, edit and delete; DB unchanged", async ({ api, userA }) => {
    seedTodo(userA.id, "AC18 id bystander");
    const before = snapshot(userA);
    const a = await api(userA.cookies);
    for (const bad of INVALID_IDS) {
      expectError(await a.get(bad), 400, "invalid_id");
      expectError(await a.patch(bad, { done: true }), 400, "invalid_id");
      expectError(await a.del(bad), 400, "invalid_id");
    }
    expect(snapshot(userA)).toBe(before);
  });

  for (const [label, value] of INVALID_DONE) {
    test(`AC18/AC26: done = ${label} -> 400; row unchanged`, async ({ api, userA }) => {
      const id = seedTodo(userA.id, `AC18 done ${label}`);
      const before = todoById(id);
      const a = await api(userA.cookies);
      expectError(await a.patch(id, { done: value }), 400, "validation_failed");
      expectError(await a.patch(id, { done: value, title: "Valid title" }), 400, "validation_failed");
      expect(todoById(id)).toEqual(before);
    });
  }

  test("AC18/AC26: an empty change body {} -> 400; row unchanged", async ({ api, userA }) => {
    const id = seedTodo(userA.id, "AC18 empty patch");
    const before = todoById(id);
    const a = await api(userA.cookies);
    expectError(await a.patch(id, {}), 400, "validation_failed");
    for (const body of [[], "x", 5, null]) expectError(await a.patch(id, body), 400, "validation_failed");
    expect(todoById(id)).toEqual(before);
  });

  test("AC26: a create body that is an array, string, number or null -> 400; no row", async ({ api, userA }) => {
    const before = snapshot(userA);
    const a = await api(userA.cookies);
    for (const body of [[{ title: "x" }], "x", 5, null]) expectError(await a.create(body), 400, "validation_failed");
    expect(snapshot(userA)).toBe(before);
  });
});

test.describe("row 5: characters Postgres can't store (T5)", () => {
  for (const [label, title] of [
    ["NUL", "a\u0000b"],
    ["lone high surrogate", "a\uD800b"],
    ["lone low surrogate", "\uDFFFz"],
  ] as const) {
    test(`T5: a title with a ${label} is rejected with 400 or stored exactly, never 500`, async ({ api, userA }) => {
      const before = snapshot(userA);
      const a = await api(userA.cookies);
      const r = await a.create({ title });
      expect([201, 400], `status (never 500)`).toContain(r.status);
      if (r.status === 400) {
        expectError(r, 400);
        expect(snapshot(userA)).toBe(before);
      } else {
        const id = (r.json as { todo: Todo }).todo.id;
        expect(todoById(id)?.title).toBe(title);
      }
      const id = seedTodo(userA.id, `T5 edit target ${label}`);
      const e = await a.patch(id, { title });
      expect([200, 400], `edit status (never 500)`).toContain(e.status);
      if (e.status === 400) expect(todoById(id)?.title).toBe(`T5 edit target ${label}`);
    });
  }
});

test.describe("row 5: the database enforces the title rule too (AC19)", () => {
  test("AC19: with A's token directly against Supabase REST, '', '   ' and 201 chars are rejected on insert and update", async ({ userA }) => {
    const id = seedTodo(userA.id, "AC19 target");
    const before = todoById(id);
    const count = todosOf(userA.id).length;
    for (const title of ["", "   ", "d".repeat(201)]) {
      const ins = await rest("POST", "todos", { token: userA.accessToken, body: { title } });
      expect(ins.status, `insert ${JSON.stringify(title.slice(0, 5))}`).toBeGreaterThanOrEqual(400);
      const upd = await rest("PATCH", `todos?id=eq.${id}`, { token: userA.accessToken, body: { title } });
      expect(upd.status, `update ${JSON.stringify(title.slice(0, 5))}`).toBeGreaterThanOrEqual(400);
    }
    expect(todosOf(userA.id)).toHaveLength(count);
    expect(todoById(id)).toEqual(before);
  });
});
