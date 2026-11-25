// GET / PATCH / DELETE /api/todos/[id]. Contract: tasks/3/TASK_BRIEF.md, backend-dev Option A.
// Not-yours and not-found are the same: RLS returns 0 rows, which is 404 with the same body (AC22, AC44).
import { isJsonContentType, readJsonBody } from "@/lib/server/body";
import { apiError, internalError, jsonResponse, methodNotAllowed, noContent } from "@/lib/server/errors";
import { guardRequest } from "@/lib/server/todo-api";
import { todoIdSchema, TODO_COLUMNS, updateTodoSchema } from "@/lib/server/todo-schemas";

const ALLOW = "GET, HEAD, PATCH, DELETE";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  const parsed = todoIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request, ctx: Ctx) {
  const g = await guardRequest(request, { mutation: false });
  if (!g.ok) return g.response;

  const id = await parseId(ctx);
  if (!id) return apiError("invalid_id");

  const { data, error } = await g.supabase
    .from("todos")
    .select(TODO_COLUMNS)
    .eq("id", id)
    .eq("user_id", g.user.id);
  if (error) return internalError("todos.read", error);
  if (data.length === 0) return apiError("not_found");
  return jsonResponse({ todo: data[0] });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guardRequest(request, { mutation: true });
  if (!g.ok) return g.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const id = await parseId(ctx);
  if (!id) return apiError("invalid_id");
  const parsed = updateTodoSchema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed");

  // Only title and/or done (column grants allow nothing else). Setting done is idempotent (AC43).
  const patch: { title?: string; done?: boolean } = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.done !== undefined) patch.done = parsed.data.done;

  const { data, error } = await g.supabase
    .from("todos")
    .update(patch)
    .eq("id", id)
    .eq("user_id", g.user.id)
    .select(TODO_COLUMNS);
  if (error) return internalError("todos.update", error);
  if (data.length === 0) return apiError("not_found");
  return jsonResponse({ todo: data[0] });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guardRequest(request, { mutation: true });
  if (!g.ok) return g.response;
  // JSON content type on every state-changing request (threat model 5: forces a CORS preflight cross-site).
  // DELETE has no body, so nothing is read or parsed.
  if (!isJsonContentType(request.headers.get("content-type"))) return apiError("unsupported_media_type");

  const id = await parseId(ctx);
  if (!id) return apiError("invalid_id");

  const { data, error } = await g.supabase
    .from("todos")
    .delete()
    .eq("id", id)
    .eq("user_id", g.user.id)
    .select("id");
  if (error) return internalError("todos.delete", error);
  if (data.length === 0) return apiError("not_found");
  return noContent();
}

export function POST() {
  return methodNotAllowed(ALLOW);
}
export function PUT() {
  return methodNotAllowed(ALLOW);
}
