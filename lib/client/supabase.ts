import { createBrowserClient } from "@supabase/ssr";
import { cookieOptions } from "@/lib/client/cookie-options";

// Browser Supabase client (anon key only). Used for sign-in (signInWithOtp, verifyOtp) and sign-out,
// called from the browser so Supabase's per-IP auth limits see the user's own IP
// (specs/3/threat-model.md 3.1, 4.3). To-do data goes through /api/todos (lib/client/api.ts), never here.
// Created lazily inside event handlers; createBrowserClient reuses one instance in the browser.
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured.");
  }
  return createBrowserClient(url, anonKey, { cookieOptions });
}
