// Task 3 static checks on the app code (no server needed). From specs/3/threat-model.md:
//   T3 (row 1/8)  no code reads user_metadata / raw_user_meta_data
//   T4 (row 3)    no service-role / secret key reference; process.env reads only the two NEXT_PUBLIC_* names and NODE_ENV
//   3.3           getSession() is never used on the server; getClaims() only in proxy.ts
//   4.3 / AC32    no app-owned code verification: verifyOtp only in browser code, never under app/api or lib/server
//   6.1 / 6.4     proxy.ts (not middleware.ts) with the exact matcher and no has/missing conditions
//   AC34          no dangerouslySetInnerHTML (verify.sh checks it too)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CODE_DIRS = ["app", "lib", "components"];
const ROOT_FILES = ["proxy.ts", "middleware.ts"];
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p)));
    else if (EXT.test(name)) out.push(relative(ROOT, p).split(sep).join("/"));
  }
  return out;
}

const files = [...CODE_DIRS.flatMap(walk), ...ROOT_FILES.filter((f) => existsSync(join(ROOT, f)))];
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
// Comments are stripped so a rule may be explained in a comment without failing the check.
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function offenders(pattern: RegExp, only: (f: string) => boolean = () => true): string[] {
  return files.filter(only).filter((f) => pattern.test(code(f)));
}

describe("app code static checks (task 3 threat model)", () => {
  it("the to-do slice exists (guards the scans below from passing on an empty tree)", () => {
    expect(files).toContain("proxy.ts");
    expect(files.some((f) => f.startsWith("app/api/todos/"))).toBe(true);
    expect(files).toContain("lib/server/csp.ts");
  });

  it("T3: no code reads user_metadata or raw_user_meta_data", () => {
    expect(offenders(/user_metadata|raw_user_meta_data|userMetadata/)).toEqual([]);
  });

  it("T4: no service-role or secret key reference", () => {
    expect(offenders(/SERVICE_ROLE|service_role|sb_secret|SUPABASE_SECRET/i)).toEqual([]);
  });

  it("T4: process.env reads only NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and NODE_ENV", () => {
    const allowed = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NODE_ENV"]);
    const bad: string[] = [];
    for (const f of files) {
      const c = code(f);
      for (const m of c.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) if (!allowed.has(m[1])) bad.push(`${f}: ${m[1]}`);
      if (/process\.env\s*\[/.test(c)) bad.push(`${f}: dynamic process.env[...]`);
      if (/(const|let|var)\s*\{[^}]*\}\s*=\s*process\.env\b/.test(c)) bad.push(`${f}: destructured process.env`);
    }
    expect(bad).toEqual([]);
  });

  it("3.3: getSession() is not used in server code (app/api, lib/server, proxy.ts, server components)", () => {
    const isServer = (f: string) =>
      f.startsWith("app/api/") || f.startsWith("lib/server/") || f === "proxy.ts" || (f.startsWith("app/") && !/^\s*["']use client["']/m.test(read(f)));
    expect(offenders(/\bgetSession\s*\(/, isServer)).toEqual([]);
  });

  it("3.3: getClaims() is used only in proxy.ts", () => {
    expect(offenders(/\bgetClaims\s*\(/, (f) => f !== "proxy.ts")).toEqual([]);
  });

  it("4.3/AC32: no app-owned code verification (verifyOtp / auth verify only in browser code)", () => {
    const serverSide = (f: string) => f.startsWith("app/api/") || f.startsWith("lib/server/") || f === "proxy.ts";
    expect(offenders(/verifyOtp|\/auth\/v1\/verify|signInWithOtp/, serverSide)).toEqual([]);
  });

  it("6.1: proxy.ts exists and middleware.ts does not", () => {
    expect(existsSync(join(ROOT, "proxy.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "middleware.ts"))).toBe(false);
  });

  it("6.4/3.5: proxy matcher is exactly the threat model's, with no has/missing conditions and no runtime export", () => {
    const c = code("proxy.ts");
    expect(c).toContain('"/((?!_next/static|_next/image|favicon.ico).*)"');
    expect(c).not.toMatch(/\b(has|missing)\s*:/);
    expect(c).not.toMatch(/export\s+const\s+runtime\b/);
    expect(c).toMatch(/export\s+(async\s+)?function\s+proxy\b|export\s+\{[^}]*\bproxy\b/);
  });

  it("AC34: no dangerouslySetInnerHTML anywhere in app code", () => {
    expect(offenders(/dangerouslySetInnerHTML/)).toEqual([]);
  });
});
