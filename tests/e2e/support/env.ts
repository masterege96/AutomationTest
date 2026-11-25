// Environment for the Playwright suites (task 3). No value is ever written to a file, log, trace or report.
//
// - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, MAILPIT_URL: exported by the caller (CI or the local
//   command in tasks/3/TASK_BRIEF.md, devops-cicd Handoff). playwright.config.ts refuses to start without them.
// - Test-only local values (service-role key for creating test users, JWT secret for forged-token tests, and the
//   secret values the AC25 scan looks for) are read from `npx supabase status -o env` at run time, kept in this
//   process's memory only, and never put into process.env (so the app server never sees them).
import { execSync } from "node:child_process";

export const APP_ORIGIN = "http://127.0.0.1:3000";

export function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "MAILPIT_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See playwright.config.ts for how to export it.`);
  return value;
}

export const SUPABASE_URL = (): string => requiredEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
export const ANON_KEY = (): string => requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const MAILPIT_URL = (): string => requiredEnv("MAILPIT_URL").replace(/\/+$/, "");

export type LocalStack = {
  serviceRoleKey: string;
  jwtSecret: string;
  publishableKey: string | undefined;
  /** Values that must never appear in any browser request or response (AC25). Name -> value. */
  secrets: { name: string; value: string }[];
};

let cached: LocalStack | undefined;

function parseStatusEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    out.set(m[1], m[2].replace(/^"(.*)"$/, "$1"));
  }
  return out;
}

/** Reads the running local stack's test-only values. Throws (without printing any value) if something is missing. */
export function localStack(): LocalStack {
  if (cached) return cached;
  let text: string;
  try {
    text = execSync("npx supabase status -o env", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("`npx supabase status -o env` failed: is the local Supabase stack running (`npx supabase start`)?");
  }
  const env = parseStatusEnv(text);
  const need = (name: string): string => {
    const v = env.get(name);
    if (!v) throw new Error(`\`npx supabase status -o env\` has no ${name}`);
    return v;
  };
  const apiUrl = need("API_URL").replace(/\/+$/, "");
  if (apiUrl !== SUPABASE_URL()) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL does not point at the running local stack's API_URL");
  }
  const secrets: { name: string; value: string }[] = [];
  for (const name of ["SERVICE_ROLE_KEY", "SECRET_KEY", "JWT_SECRET", "S3_PROTOCOL_ACCESS_KEY_SECRET"]) {
    const v = env.get(name);
    if (v) secrets.push({ name, value: v });
  }
  // The local DB password is the stack default, the dictionary word "postgres", which legitimately appears in
  // client code (e.g. supabase-js / PostgREST strings). It is only scanned for if it is a real secret: at least
  // 16 characters (observed 2026-11-25 integration run: "postgres" matched a JS chunk, a false positive).
  const dbUrl = env.get("DB_URL");
  if (dbUrl) {
    try {
      const password = decodeURIComponent(new URL(dbUrl).password);
      if (password.length >= 16) secrets.push({ name: "database password", value: password });
    } catch {
      // not a URL: nothing to add
    }
  }
  cached = {
    serviceRoleKey: need("SERVICE_ROLE_KEY"),
    jwtSecret: need("JWT_SECRET"),
    publishableKey: env.get("PUBLISHABLE_KEY"),
    secrets,
  };
  return cached;
}

/** A per-run id so test emails and titles never collide with earlier runs on the shared local stack. */
export const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function testEmail(label: string): string {
  return `qa3-${label}-${RUN_ID}@test.local`.toLowerCase();
}
