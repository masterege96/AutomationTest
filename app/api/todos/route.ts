// GET /api/todos (list, newest first) and POST /api/todos (create). Contract: tasks/3/TASK_BRIEF.md,
// backend-dev Option A. Order: Origin (mutations) -> getUser() -> 415 -> 413 -> 400 -> query (RLS) -> response.
import { readJsonBody } from "@/lib/server/body";
import { apiError, internalError, jsonResponse, methodNotAllowed } from "@/lib/server/errors";
import { guardRequest } from "@/lib/server/todo-api";
import { createTodoSchema, TODO_COLUMNS } from "@/lib/server/todo-schemas";

const ALLOW = "GET, HEAD, POST";

export async function GET(request: Request) {
  const g = await guardRequest(request, { mutation: false });
  if (!g.ok) return g.response;

  const { data, error } = await g.supabase
    .from("todos")
    .select(TODO_COLUMNS)
    .eq("user_id", g.user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) return internalError("todos.list", error);
  return jsonResponse({ todos: data });
}

export async function POST(request: Request) {
  const g = await guardRequest(request, { mutation: true });
  if (!g.ok) return g.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createTodoSchema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed");

  // Only the title is sent: user_id, id, done and timestamps come from column defaults (schema.md 5).
  const { data, error } = await g.supabase.from("todos").insert({ title: parsed.data.title }).select(TODO_COLUMNS);
  if (error || !data || data.length !== 1) return internalError("todos.create", error);
  return jsonResponse({ todo: data[0] }, 201);
}

export function PUT() {
  return methodNotAllowed(ALLOW);
}
export function PATCH() {
  return methodNotAllowed(ALLOW);
}
export function DELETE() {
  return methodNotAllowed(ALLOW);
}
