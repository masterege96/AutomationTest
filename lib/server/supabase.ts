// Server Supabase client for route handlers and Server Components: anon key + the user's session cookies,
// so RLS applies to every query. No service role anywhere (threat model row 2, row 3).
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/client/cookie-options";
import type { Database } from "@/types/database";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env not set");
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies can't be set: proxy.ts refreshes the session.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in user, verified by the Auth server (getUser(), never getSession()/getClaims(): threat model 3.3),
 * or null. Any failure (no cookie, forged or expired token, signed-out session, Auth unreachable) is null.
 */
export async function getVerifiedUser(supabase: ServerClient): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
