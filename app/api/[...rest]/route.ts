// Any /api/* path without its own route (e.g. /api/admin, /api/admin/todos) is a JSON 404 (AC20).
// Nothing here reads the session or the body.
import { apiError } from "@/lib/server/errors";

function notFound() {
  return apiError("not_found");
}

export const GET = notFound;
export const HEAD = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;
