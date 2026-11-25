// Fetch wrapper for the to-do API (route handlers, backend-dev's Option A contract in tasks/3/TASK_BRIEF.md).
// Errors arrive as {"error":{"code","message"}} and are thrown as ApiError. Messages are shown as text only.

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const FALLBACK_MESSAGE = "Something went wrong. Try again.";

async function readError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error: unknown }).error;
      if (error && typeof error === "object") {
        const { code, message } = error as { code?: unknown; message?: unknown };
        return new ApiError(
          response.status,
          typeof code === "string" ? code : "unknown",
          typeof message === "string" && message ? message : FALLBACK_MESSAGE,
        );
      }
    }
  } catch {
    // Not JSON: fall through to the generic error.
  }
  return new ApiError(response.status, "unknown", FALLBACK_MESSAGE);
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Every state-changing request is sent as JSON (the API answers 415 otherwise; threat model section 5).
  if (method !== "GET") headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listTodos(): Promise<Todo[]> {
  const data = await request<{ todos: Todo[] }>("GET", "/api/todos");
  return data.todos;
}

export async function createTodo(title: string): Promise<Todo> {
  const data = await request<{ todo: Todo }>("POST", "/api/todos", { title });
  return data.todo;
}

export async function updateTodo(id: string, patch: { title?: string; done?: boolean }): Promise<Todo> {
  const data = await request<{ todo: Todo }>("PATCH", `/api/todos/${encodeURIComponent(id)}`, patch);
  return data.todo;
}

export async function deleteTodo(id: string): Promise<void> {
  await request<void>("DELETE", `/api/todos/${encodeURIComponent(id)}`);
}
