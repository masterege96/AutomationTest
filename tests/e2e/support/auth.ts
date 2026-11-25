// Test users and sessions (task 3). Setup only: the sign-in flow under test is driven through the UI and Mailpit
// in the e2e specs. For API and abuse tests, a confirmed user and a real session are made with the local stack's
// admin API (service-role key from `npx supabase status`, memory only; no email is sent, so the 60 s resend limit
// and Mailpit are not involved). The session cookies are produced by @supabase/ssr itself, so they have exactly the
// name and format the app reads.
import { createHmac } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SUPABASE_URL, localStack, testEmail } from "./env";

export type SessionCookie = { name: string; value: string };

export type TestUser = {
  label: string;
  email: string;
  id: string;
  cookies: SessionCookie[];
  accessToken: string;
  refreshToken: string;
};

function adminClient() {
  return createClient(SUPABASE_URL(), localStack().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates a confirmed user (or reuses an existing one) without sending any email. */
export async function ensureConfirmedUser(email: string): Promise<string> {
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  const page = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = page.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`could not create test user (${created.error?.code ?? "unknown error"})`);
  return found.id;
}

/** Signs an existing confirmed user in and returns the @supabase/ssr session cookies. One /auth/v1/verify call. */
export async function sessionFor(email: string): Promise<Omit<TestUser, "label">> {
  const admin = adminClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data.properties?.email_otp;
  if (!otp) throw new Error(`generateLink gave no code (${link.error?.code ?? "unknown error"})`);
  const jar = new Map<string, string>();
  const client = createServerClient(SUPABASE_URL(), ANON_KEY(), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const c of list) {
          if (c.value) jar.set(c.name, c.value);
          else jar.delete(c.name);
        }
      },
    },
  });
  const { data, error } = await client.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error || !data.session || !data.user) throw new Error(`verifyOtp failed (${error?.code ?? "no session"})`);
  if (jar.size === 0) throw new Error("@supabase/ssr set no session cookie");
  return {
    email,
    id: data.user.id,
    cookies: [...jar].map(([name, value]) => ({ name, value })),
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/** A fresh confirmed user with a live session. `label` keeps emails readable in Mailpit / auth.users. */
export async function newUser(label: string): Promise<TestUser> {
  const email = testEmail(label);
  await ensureConfirmedUser(email);
  return { label, ...(await sessionFor(email)) };
}

export function cookieHeader(cookies: SessionCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** The @supabase/ssr storage cookie name for this Supabase URL (sb-<first host label>-auth-token). */
export function authCookieName(): string {
  return `sb-${new URL(SUPABASE_URL()).hostname.split(".")[0]}-auth-token`;
}

/** Decodes the (possibly chunked) @supabase/ssr session cookie back into the session JSON. */
export function sessionFromCookies(cookies: SessionCookie[]): { access_token?: string; refresh_token?: string } {
  const base = authCookieName();
  const single = cookies.find((c) => c.name === base);
  const chunks = cookies
    .filter((c) => c.name.startsWith(`${base}.`))
    .sort((a, b) => Number(a.name.slice(base.length + 1)) - Number(b.name.slice(base.length + 1)));
  const raw = single ? single.value : chunks.map((c) => c.value).join("");
  if (!raw) return {};
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : decodeURIComponent(raw);
  return JSON.parse(json) as { access_token?: string; refresh_token?: string };
}

function b64url(value: unknown): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

/**
 * Session cookies holding a forged access token (threat model T2). The cookie itself is well formed, so the app has
 * to reject the token, not the cookie format. `expires_at` is in the future so no refresh is attempted.
 */
export function forgedSessionCookies(kind: "wrong-key" | "alg-none" | "expired" | "random", sub: string): SessionCookie[] {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: "authenticated",
    role: "authenticated",
    sub,
    email: "forged@test.local",
    iss: `${SUPABASE_URL()}/auth/v1`,
    iat: now - 60,
    exp: kind === "expired" ? now - 30 : now + 3600,
    session_id: "00000000-0000-4000-8000-000000000000",
  };
  let token: string;
  if (kind === "random") {
    token = Buffer.from(Array.from({ length: 48 }, (_, i) => (i * 37 + now) % 256)).toString("base64url");
  } else if (kind === "alg-none") {
    token = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.`;
  } else {
    // "wrong-key": HS256 with a key the stack doesn't use. "expired": HS256 with the local JWT secret, already expired.
    const key = kind === "expired" ? localStack().jwtSecret : "qa-test-wrong-key-not-a-secret-0123456789";
    const head = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}`;
    token = `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
  }
  const session = {
    access_token: token,
    refresh_token: "qa-forged-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id: sub, aud: "authenticated", role: "authenticated", email: "forged@test.local" },
  };
  return [{ name: authCookieName(), value: `base64-${b64url(session)}` }];
}

/** POST /auth/v1/token?grant_type=refresh_token directly against Auth (AC8: the old refresh token must be revoked). */
export async function tryRefresh(refreshToken: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON_KEY(), "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  await res.arrayBuffer();
  return res.status;
}

/** Direct PostgREST call with the anon key and (optionally) a user's access token: AC23, AC30, AC39. */
export async function rest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  pathAndQuery: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    apikey: ANON_KEY(),
    "content-type": "application/json",
    prefer: "return=representation",
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${pathAndQuery}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: res.status, body };
}

/** Requests a sign-in code directly from Auth (used where the UI is not under test, e.g. AC27's metadata). */
export async function requestOtpDirect(email: string, data?: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY(), "content-type": "application/json" },
    body: JSON.stringify({ email, create_user: true, data }),
  });
  await res.arrayBuffer();
  return res.status;
}
