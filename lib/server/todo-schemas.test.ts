import { describe, expect, it } from "vitest";
import { createTodoSchema, todoIdSchema, updateTodoSchema } from "./todo-schemas";

const ok = (v: unknown) => createTodoSchema.safeParse(v).success;

describe("createTodoSchema", () => {
  it.each([
    ["a", "a"],
    ["a".repeat(200), "a".repeat(200)],
    ["\u{1F600}".repeat(200), "\u{1F600}".repeat(200)],
    ["  Buy milk  ", "Buy milk"],
    ["\t\n 　﻿x ", "x"],
    ["<script>window.__xss=1</script>", "<script>window.__xss=1</script>"],
  ])("accepts %j and stores %j", (title, stored) => {
    const r = createTodoSchema.safeParse({ title });
    expect(r.success).toBe(true);
    expect(r.data?.title).toBe(stored);
  });

  it.each([
    "",
    "   ",
    "\t",
    "\n\r",
    "a".repeat(201),
    ` ${"a".repeat(201)} `,
    "\u{1F600}".repeat(201),
    "a\u0000b",
    "a\ud800b",
  ])("rejects title %j", (title) => {
    expect(ok({ title })).toBe(false);
  });

  it.each([1, null, true, [], {}, undefined])("rejects non-string title %j", (title) => {
    expect(ok({ title })).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(ok({})).toBe(false);
  });

  it.each([
    { user_id: "22222222-2222-2222-2222-222222222222" },
    { id: "11111111-1111-1111-1111-111111111111" },
    { done: true },
    { created_at: "2020-01-01T00:00:00Z" },
    { extra: 1 },
  ])("rejects extra field %j", (extra) => {
    expect(ok({ title: "x", ...extra })).toBe(false);
  });

  it.each([null, [], "x", 1])("rejects body %j", (b) => {
    expect(ok(b)).toBe(false);
  });
});

describe("updateTodoSchema", () => {
  const p = (v: unknown) => updateTodoSchema.safeParse(v);

  it("accepts title, done, or both", () => {
    expect(p({ title: " x " }).data).toEqual({ title: "x" });
    expect(p({ done: true }).data).toEqual({ done: true });
    expect(p({ title: "x", done: false }).data).toEqual({ title: "x", done: false });
  });

  it.each([
    {},
    { done: "true" },
    { done: 1 },
    { done: null },
    { title: "" },
    { title: "x", user_id: "a" },
    { id: "x", done: true },
    { created_at: "x" },
  ])("rejects %j", (v) => {
    expect(p(v).success).toBe(false);
  });
});

describe("todoIdSchema", () => {
  it.each([
    "3f1c2b9e-8d7a-4c6b-9a5e-1f2e3d4c5b6a",
    "11111111-1111-1111-1111-111111111111",
    "3F1C2B9E-8D7A-4C6B-9A5E-1F2E3D4C5B6A",
  ])("accepts %s", (id) => {
    expect(todoIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(["", "1", "not-a-uuid", "3f1c2b9e8d7a4c6b9a5e1f2e3d4c5b6a", "3f1c2b9e-8d7a-4c6b-9a5e-1f2e3d4c5b6a'", "../admin"])(
    "rejects %j",
    (id) => {
      expect(todoIdSchema.safeParse(id).success).toBe(false);
    },
  );
});
