// Shared first steps of every to-do endpoint (threat model 5, 3.3): Origin check for mutations (403), then the
// user verified by the Auth server (401). Runs before the body is read and before any DB call.
import type { User } from "@supabase/supabase-js";
import { apiError, internalError } from "./errors";
import { isSameOrigin } from "./origin";
import { createClient, getVerifiedUser, type ServerClient } from "./supabase";

export type Guarded = { ok: true; supabase: ServerClient; user: User } | { ok: false; response: Response };

export async function guardRequest(request: Request, opts: { mutation: boolean }): Promise<Guarded> {
  if (opts.mutation && !isSameOrigin(request.headers)) {
    return { ok: false, response: apiError("forbidden_origin") };
  }
  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    return { ok: false, response: internalError("client", err) };
  }
  const user = await getVerifiedUser(supabase);
  if (!user) return { ok: false, response: apiError("unauthorized") };
  return { ok: true, supabase, user };
}
