import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createTodo, deleteTodo, listTodos, updateTodo } from "./api";

function mockFetch(response: Response) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("to-do API client", () => {
  it("lists with GET, same-origin credentials and no JSON content type", async () => {
    const fetchMock = mockFetch(Response.json({ todos: [] }));
    await expect(listTodos()).resolves.toEqual([]);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/todos");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("creates with a JSON body containing only the title", async () => {
    const todo = { id: "1", title: "Buy milk", done: false, created_at: "2026-11-25T00:00:00Z" };
    const fetchMock = mockFetch(Response.json({ todo }, { status: 201 }));
    await expect(createTodo("Buy milk")).resolves.toEqual(todo);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ title: "Buy milk" }));
  });

  it("patches by encoded id and deletes with a JSON content type", async () => {
    const todo = { id: "a/b", title: "x", done: true, created_at: "2026-11-25T00:00:00Z" };
    let fetchMock = mockFetch(Response.json({ todo }));
    await updateTodo("a/b", { done: true });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/todos/a%2Fb");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");

    fetchMock = mockFetch(new Response(null, { status: 204 }));
    await expect(deleteTodo("x")).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("maps the error format to ApiError", async () => {
    mockFetch(Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 }));
    const error = await listTodos().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "not_found", message: "Not found." });
  });

  it("falls back to a generic error for non-JSON bodies", async () => {
    mockFetch(new Response("<html>oops</html>", { status: 500 }));
    await expect(listTodos()).rejects.toMatchObject({ status: 500, code: "unknown" });
  });
});
