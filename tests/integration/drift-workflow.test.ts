// Task 4e: drift check with a read-only DB role (L13, S26, S27, L12). Brief: tasks/4e/TASK_BRIEF.md (definitions,
// ACs, devops-cicd "contract for qa-test" Handoff entry, orchestrator decision L4e.1: concurrency on jobs.drift).
//
// Static ACs read the text of .github/workflows/drift.yml, supabase/production/drift-role.sql and
// roles/devops-cicd.md (no YAML library, as tests/integration/gate-spoof.test.ts). Behaviour ACs run
// scripts/ci/drift-url-check.sh and scripts/ci/drift-judge.sh, and the drift.yml `run:` blocks of the head guard,
// the require step and the diff step (with a fake `npx`), in temp dirs outside the worktree. No network, Docker or
// GitHub call; nothing touches a database.
//
// Fake values only: every ref and password is generated at run time from random bytes (gitleaks scans history), and
// URLs are assembled from parts so the source never holds one with a user and password before a host.
// Windows: Git Bash is called explicitly (a plain `bash` may be WSL). Stubs (grep, sha256sum, npx) are put first on
// PATH (chmod-unreadable files don't work on Windows, contract entry).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BASH =
  process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe") : "bash";
const posix = (p: string) => p.split("\\").join("/");
const URL_CHECK = posix(join(ROOT, "scripts", "ci", "drift-url-check.sh"));
const JUDGE = posix(join(ROOT, "scripts", "ci", "drift-judge.sh"));
const TIMEOUT = 120_000;

const readLF = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");
const WF = readLF(".github", "workflows", "drift.yml");
const WF_LINES = WF.split("\n");
const ROLE = readLF("supabase", "production", "drift-role.sql");
const ROLE_CONTRACT = readLF("roles", "devops-cicd.md");

// ---------- fixed texts (brief ACs, contract entry) ----------
const URL_OK = "URL check: session pooler URL for drift_reader (format OK)";
const urlErr = (part: string, hint: string) =>
  `::error::drift check broken: SUPABASE_DRIFT_DB_URL ${part} is not in the expected format (${hint})`;
const H = {
  value: "no spaces or line breaks",
  empty: "set the session pooler URL",
  scheme: "postgresql://",
  user: "drift_reader.<project ref>",
  ref: "20 lowercase letters (Project Settings > General > Reference ID)",
  password: "password required",
  host: "session pooler host aws-<n>-<region>.pooler.supabase.com (GitHub runners have no IPv6)",
  port: "port 5432 (session mode)",
  database: "database postgres",
  query: "only sslmode=...",
};
const MISSING_SECRET =
  "::error::Drift check not configured. Missing GitHub Secret: SUPABASE_DRIFT_DB_URL (production environment)";
const NO_DRIFT = "No drift.";
const DRIFT_ERR = "::error::Drift: production differs from supabase/migrations";
const cliErr = (code: string) => `::error::drift check broken: supabase db diff exited ${code}`;
const readErr = (reason: string) => `::error::drift check broken: diff output could not be read (${reason})`;
const EMPTY_SHA12 = "e3b0c44298fc";
const OLD_SECRETS = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID"];
const MAIN_PINS = [
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0",
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2",
  "actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0",
];

// ---------- fake values (generated at run time, never committed) ----------
function randomFrom(alphabet: string, n: number): string {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[b[i] % alphabet.length];
  return s;
}
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const ALNUM = LOWER + LOWER.toUpperCase() + "0123456789";
const REF = randomFrom(LOWER, 20);
const PASSWORD = randomFrom(ALNUM, 32);
const HOST0 = "aws-0-eu-west-1.pooler.supabase.com";
const HOST1 = "aws-1-eu-west-1.pooler.supabase.com";
type UrlParts = { scheme?: string; user?: string; pw?: string | null; host?: string; port?: string | null; path?: string };
/** Assembles a URL from parts (default: the good form). pw/port null = left out with its separator. */
function makeUrl(p: UrlParts = {}): string {
  const scheme = p.scheme ?? "postgresql:" + "//";
  const user = p.user ?? `drift_reader.${REF}`;
  const pw = p.pw === undefined ? PASSWORD : p.pw;
  const host = p.host ?? HOST0;
  const port = p.port === undefined ? "5432" : p.port;
  const path = p.path ?? "/postgres";
  return scheme + user + (pw === null ? "" : ":" + pw) + "@" + host + (port === null ? "" : ":" + port) + path;
}

// ---------- temp dirs and env ----------
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
/** process.env without GitHub/drift/Supabase vars (CI sets GITHUB_OUTPUT), plus extra vars and optional PATH stubs. */
function cleanEnv(extra: Record<string, string> = {}, stubDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(GITHUB_|DRIFT_|SUPABASE_|RUNNER_|HAS_DRIFT|CHECK_HEAD|RUN_SHA)/i.test(k)) delete env[k];
  }
  // Put first on PATH by the wrapper in bash(): Git for Windows' bin\bash.exe prepends /usr/bin to PATH, which
  // would hide a grep/sha256sum stub given through the Windows PATH.
  if (stubDir) env.QA4E_STUBS = stubDir;
  return { ...env, ...extra };
}
function writeExecutable(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}
/** A dir holding one bash stub per given command name. */
function stubs(cmds: Record<string, string>): string {
  const d = tempDir("qa4e-stub-");
  for (const [name, body] of Object.entries(cmds)) writeExecutable(join(d, name), `#!/usr/bin/env bash\n${body}\n`);
  return d;
}

type Run = { code: number | null; out: string; stdout: string; stderr: string };
/**
 * Runs `bash <args>` through a small wrapper: the arguments travel in env vars (a newline inside a command-line
 * argument is split on Windows), and the QA4E_STUBS dir, if set, goes first on PATH inside bash.
 */
const WRAPPER = [
  'if [ -n "${QA4E_STUBS:-}" ]; then d=$QA4E_STUBS; if command -v cygpath >/dev/null 2>&1; then d=$(cygpath -u "$d"); fi; PATH="$d:$PATH"; export PATH; fi',
  'n=$QA4E_ARGC; set --; i=0; while [ "$i" -lt "$n" ]; do v="QA4E_ARG_$i"; set -- "$@" "${!v}"; unset "$v"; i=$((i+1)); done',
  'unset QA4E_STUBS QA4E_ARGC; exec bash "$@"',
].join("\n");
function bash(args: string[], env: NodeJS.ProcessEnv, cwd: string): Run {
  const argEnv: Record<string, string> = { QA4E_ARGC: String(args.length) };
  args.forEach((a, i) => (argEnv[`QA4E_ARG_${i}`] = a));
  const r = spawnSync(BASH, ["-c", WRAPPER], { cwd, env: { ...env, ...argEnv }, encoding: "utf8", timeout: TIMEOUT });
  const stdout = (r.stdout ?? "").replace(/\r\n/g, "\n");
  const stderr = (r.stderr ?? "").replace(/\r\n/g, "\n");
  return { code: r.status, out: stdout + stderr, stdout, stderr };
}
const lines = (s: string) => s.split("\n").filter((l) => l !== "");

// ---------- URL check runner ----------
function urlCheck(url: string | undefined, args: string[] = [], extra: Record<string, string> = {}) {
  const cwd = tempDir("qa4e-url-");
  const env = url === undefined ? cleanEnv(extra) : cleanEnv({ DRIFT_DB_URL: url, ...extra });
  return { ...bash([URL_CHECK, ...args], env, cwd), cwd };
}
/** AC13: none of the URL's parts appear in the output. */
function expectNoLeak(out: string, url: string, parts: string[]) {
  const forbidden = [url, url.trim(), PASSWORD, REF, `drift_reader.${REF}`, HOST0, HOST1, ...parts].filter(
    (s) => s.length >= 4,
  );
  for (const f of forbidden) expect(out.includes(f), `output must not contain a URL part (${f.length} chars)`).toBe(false);
}

// ---------- judge runner ----------
type JudgeIn = { rc?: string; diff?: string | null; err?: string | null; diffIsDir?: boolean; diffPath?: string };
function judge(i: JudgeIn, stubDir?: string, opts: { noOutput?: boolean; args?: string[] } = {}) {
  const d = tempDir("qa4e-judge-");
  const out = join(d, "github_output");
  writeFileSync(out, "");
  const diffPath = i.diffPath ?? posix(join(d, "diff.sql"));
  if (i.diffIsDir) mkdirSync(join(d, "diff.sql"));
  else if (i.diff !== null && i.diff !== undefined) writeFileSync(join(d, "diff.sql"), i.diff);
  const errPath = posix(join(d, "diff.err"));
  if (i.err !== null && i.err !== undefined) writeFileSync(join(d, "diff.err"), i.err);
  const env = cleanEnv(opts.noOutput ? {} : { GITHUB_OUTPUT: posix(out) }, stubDir);
  const args = opts.args ?? [i.rc ?? "0", diffPath, errPath];
  const r = bash([JUDGE, ...args], env, d);
  return { ...r, gh: readFileSync(out, "utf8").replace(/\r\n/g, "\n") };
}

// ---------- drift.yml text helpers ----------
const indentOf = (l: string) => l.length - l.trimStart().length;
/** Lines of the block that starts at the line matching `header` (exact), until a non-empty line at <= its indent. */
function block(all: string[], header: string): string[] {
  const i = all.indexOf(header);
  if (i < 0) return [];
  const ind = indentOf(header);
  const out: string[] = [];
  for (let k = i + 1; k < all.length; k++) {
    if (all[k].trim() !== "" && indentOf(all[k]) <= ind) break;
    out.push(all[k]);
  }
  return out;
}
const JOB = block(WF_LINES, "  drift:");
const STEPS_AT = JOB.indexOf("    steps:");
const JOB_HEAD = JOB.slice(0, STEPS_AT); // job-level keys before steps
const STEPS: string[][] = (() => {
  const s: string[][] = [];
  for (const l of JOB.slice(STEPS_AT + 1)) {
    if (/^ {6}- /.test(l)) s.push([l]);
    else if (s.length) s[s.length - 1].push(l);
  }
  return s;
})();
const stepField = (st: string[], key: string) => {
  for (const l of st) {
    const m = new RegExp(`^ {6}(?:- | {2})${key}: (.*)$`).exec(l);
    if (m) return m[1];
  }
  return undefined;
};
const stepEnv = (st: string[]) => {
  const i = st.findIndex((l) => l === "        env:");
  if (i < 0) return [] as string[];
  const out: string[] = [];
  for (let k = i + 1; k < st.length && (st[k].trim() === "" || indentOf(st[k]) > 8); k++) out.push(st[k]);
  return out;
};
/** The `run: |` script of a step, dedented (a one-line `run:` is returned as is). */
function stepRun(st: string[]): string {
  const i = st.findIndex((l) => /^ {8}run: /.test(l));
  if (i < 0) return "";
  const v = st[i].replace(/^ {8}run: /, "");
  if (v !== "|") return v;
  const out: string[] = [];
  for (let k = i + 1; k < st.length && (st[k].trim() === "" || indentOf(st[k]) >= 10); k++) out.push(st[k].slice(10));
  return out.join("\n").trimEnd() + "\n";
}
const stepById = (id: string) => STEPS.find((s) => stepField(s, "id") === id)!;
const stepByName = (n: string) => STEPS.find((s) => stepField(s, "name") === n)!;
const REQUIRE = stepByName("Require the drift connection secret");
const URLSTEP = STEPS.find((s) => stepRun(s).includes("drift-url-check.sh"))!;
const HEAD = stepById("head");
const DIFF = stepById("diff");
const ISSUE = stepByName("Open or update the drift issue");
const UPLOAD = stepByName("Upload the raw diff (manual opt-in only)");
/** GitHub's default `run:` shell on Linux: bash --noprofile --norc -eo pipefail {0}. */
function runStep(script: string, cwd: string, env: NodeJS.ProcessEnv): Run {
  const f = join(cwd, "step.sh");
  writeFileSync(f, script);
  return bash(["--noprofile", "--norc", "-eo", "pipefail", posix(f)], env, cwd);
}

// ---------- role file helpers ----------
const ROLE_LINES = ROLE.split("\n");
/** Executable SQL: the role file without `--` line comments and `/* *\/` block comments (Definitions). */
const EXEC_SQL = ROLE.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");
const ROLLBACK_AT = ROLE_LINES.findIndex((l) => /^--\s*rollback/i.test(l));

// =====================================================================================================
describe("A. read-only role file (supabase/production/drift-role.sql)", () => {
  it("AC1: the role file lives at supabase/production/, no migration/test/seed mentions drift_reader", () => {
    expect(existsSync(join(ROOT, "supabase", "production", "drift-role.sql"))).toBe(true);
    const scan = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? scan(join(dir, e.name)) : [join(dir, e.name)],
          )
        : [];
    const files = [...scan(join(ROOT, "supabase", "migrations")), ...scan(join(ROOT, "supabase", "tests"))];
    if (existsSync(join(ROOT, "supabase", "seed.sql"))) files.push(join(ROOT, "supabase", "seed.sql"));
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/drift_reader/i);
  });

  it("AC1: header comment: the person runs it once in the Dashboard SQL editor, agents never, why not a migration", () => {
    const header = ROLE_LINES.slice(0, ROLE_LINES.findIndex((l) => l.trim() !== "" && !l.startsWith("--"))).join("\n");
    expect(header).toMatch(/the person, once, in the production Supabase Dashboard SQL editor/);
    expect(header).toMatch(/Agents never run this file against production \(AGENT_RULES 12\)/);
    expect(header).toMatch(/Why this is not a migration/);
    expect(header).toMatch(/can't hold the password/);
  });

  it("AC2: creates drift_reader with LOGIN and every NO* attribute, connection limit <= 3, read-only default, timeout", () => {
    const create = /create\s+role\s+drift_reader\b([\s\S]*?);/i.exec(EXEC_SQL);
    expect(create).not.toBeNull();
    const attrs = create![1].toLowerCase();
    for (const a of ["login", "nosuperuser", "nocreatedb", "nocreaterole", "noinherit", "noreplication", "nobypassrls"])
      expect(attrs, a).toMatch(new RegExp(`\\b${a}\\b`));
    const limits = [...EXEC_SQL.matchAll(/connection\s+limit\s+(-?\d+)/gi)].map((m) => Number(m[1]));
    expect(limits.length).toBeGreaterThan(0);
    for (const n of limits) expect(n >= 1 && n <= 3, `connection limit ${n}`).toBe(true);
    expect(EXEC_SQL).toMatch(/alter\s+role\s+drift_reader\s+set\s+default_transaction_read_only\s*(=|to)\s*on\s*;/i);
    expect(EXEC_SQL).toMatch(/alter\s+role\s+drift_reader\s+set\s+statement_timeout\s*(=|to)\s*'?\d+\w*'?\s*;/i);
    // Re-applying attributes never turns one of them on (no SUPERUSER / CREATEDB / ... without the NO prefix).
    expect(EXEC_SQL).not.toMatch(/\b(?<!no)(superuser|createdb|createrole|replication|bypassrls)\b(?!\s*=)/i);
  });

  it("AC3: no object grant, no default privileges, no role membership; only GRANT CONNECT ON DATABASE postgres", () => {
    const grants = [...EXEC_SQL.matchAll(/\bgrant\b[\s\S]*?;/gi)].map((m) => m[0].replace(/\s+/g, " ").toLowerCase());
    for (const g of grants) expect(g).toBe("grant connect on database postgres to drift_reader;");
    expect(EXEC_SQL).not.toMatch(/alter\s+default\s+privileges/i);
    expect(EXEC_SQL).not.toMatch(/\bin\s+schema\b/i);
    expect(EXEC_SQL).not.toMatch(/pg_read_all_data|pg_write_all_data|service_role|\bauthenticated\b|\banon\b/i);
    expect(EXEC_SQL).not.toMatch(/\bin\s+role\b|\brole\s+\w+\s*,|\badmin\s+\w+/i); // CREATE ROLE ... IN ROLE / ADMIN
  });

  it("AC4: no PASSWORD in executable SQL; no password value, ref, pooler host or credential URL on any line", () => {
    expect(EXEC_SQL).not.toMatch(/password/i);
    // Only the placeholder may follow `password` in a comment.
    for (const m of ROLE.matchAll(/password\s+'([^']*)'/gi)) expect(m[1]).toBe("<typed in the SQL editor, never saved>");
    expect(ROLE).not.toMatch(/[.@:][a-z]{20}(?![a-z])|(?<![a-z])[a-z]{20}[.@:]/);
    expect(ROLE).not.toMatch(/pooler\.supabase\.com|aws-\d+-[a-z]{2}-[a-z]+-\d+/i);
    expect(ROLE).not.toMatch(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]*:[^\s/@]*@/i);
    expect(ROLE).not.toMatch(/\bpostgres(ql)?:\/\//i);
  });

  it("AC5 (static part): role creation is guarded by a pg_roles existence check, settings re-applied outside it", () => {
    expect(EXEC_SQL).toMatch(
      /if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+(pg_catalog\.)?pg_roles\s+where\s+rolname\s*=\s*'drift_reader'\s*\)\s*then\s+create\s+role\s+drift_reader/i,
    );
    const afterGuard = EXEC_SQL.slice(EXEC_SQL.search(/end\s+if\s*;/i));
    expect(afterGuard).toMatch(/alter\s+role\s+drift_reader\s+set\s+default_transaction_read_only/i);
    expect(afterGuard).toMatch(/alter\s+role\s+drift_reader\s+set\s+statement_timeout/i);
  });

  it("AC6: ends with a rollback section where every line is a comment, in order terminate, revoke, drop, secret note", () => {
    expect(ROLLBACK_AT).toBeGreaterThan(0);
    const rb = ROLE_LINES.slice(ROLLBACK_AT);
    for (const l of rb) expect(l === "" || l.startsWith("--"), `rollback line not a comment: ${l}`).toBe(true);
    const t = rb.join("\n");
    const iTerm = t.search(/pg_terminate_backend\(pid\)[^\n]*usename\s*=\s*'drift_reader'/);
    const iRevoke = t.search(/revoke connect on database postgres from drift_reader;/);
    const iDrop = t.search(/drop role if exists drift_reader;/);
    const iSecret = t.search(/SUPABASE_DRIFT_DB_URL[^\n]*production/);
    expect(iTerm).toBeGreaterThan(-1);
    expect(iRevoke).toBeGreaterThan(iTerm);
    expect(iDrop).toBeGreaterThan(iRevoke);
    expect(iSecret).toBeGreaterThan(iDrop);
    // Nothing executable after the rollback heading, so running the whole file never drops anything.
    expect(EXEC_SQL.split("\n").slice(ROLLBACK_AT).join("").trim()).toBe("");
    expect(EXEC_SQL).not.toMatch(/\bdrop\s+role\b|\brevoke\b|pg_terminate_backend/i);
  });
});

// =====================================================================================================
describe("B. connection and secrets (drift.yml)", () => {
  it("AC7: the only secrets expression is secrets.SUPABASE_DRIFT_DB_URL, in step env of require, URL check and diff", () => {
    const exprs = [...WF.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim()).filter((e) => /\bsecrets\b/.test(e));
    expect(exprs.sort()).toEqual(
      ["secrets.SUPABASE_DRIFT_DB_URL", "secrets.SUPABASE_DRIFT_DB_URL", "secrets.SUPABASE_DRIFT_DB_URL != ''"].sort(),
    );
    expect([...WF.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1])).toEqual([
      "SUPABASE_DRIFT_DB_URL",
      "SUPABASE_DRIFT_DB_URL",
      "SUPABASE_DRIFT_DB_URL",
    ]);
    // No secret in workflow-level or job-level env (nor anywhere before the steps).
    expect(WF_LINES.slice(0, WF_LINES.indexOf("  drift:")).join("\n")).not.toMatch(/\bsecrets\b(?!\s+live)/);
    expect(JOB_HEAD.filter((l) => !l.trim().startsWith("#")).join("\n")).not.toMatch(/\bsecrets\./);
    // Each step's secret is in its own step-level env:, and only the three allowed steps have one.
    const withSecret = STEPS.filter((s) => s.some((l) => /secrets\./.test(l)));
    expect(withSecret).toEqual([REQUIRE, URLSTEP, DIFF]);
    expect(stepEnv(REQUIRE)).toContain("          HAS_DRIFT_DB_URL: ${{ secrets.SUPABASE_DRIFT_DB_URL != '' }}");
    expect(stepEnv(URLSTEP)).toContain("          DRIFT_DB_URL: ${{ secrets.SUPABASE_DRIFT_DB_URL }}");
    expect(stepEnv(DIFF)).toContain("          DRIFT_DB_URL: ${{ secrets.SUPABASE_DRIFT_DB_URL }}");
    for (const s of withSecret) {
      const secretLines = s.filter((l) => /secrets\./.test(l));
      for (const l of secretLines) expect(stepEnv(s)).toContain(l);
    }
    // npm ci, gitleaks, upload and issue steps get no secret (no env: holding one, no secret in with:).
    for (const s of STEPS.filter((x) => !withSecret.includes(x))) expect(s.join("\n")).not.toMatch(/secrets/);
  });

  it("AC8: no old secret, no supabase link, no --project-ref, no bare --remote; exact diff command", () => {
    for (const s of OLD_SECRETS) expect(WF).not.toContain(s);
    expect(WF).not.toMatch(/supabase\s+link/);
    expect(WF).not.toContain("--project-ref");
    expect(WF).not.toMatch(/--remote(?!=)/);
    expect(WF).not.toContain("--db-url");
    expect(stepRun(DIFF)).toContain(
      'npx --no-install supabase db diff --remote="$DRIFT_DB_URL" --schema "$DRIFT_SCHEMAS"',
    );
  });

  it("AC9: the require step fails with the exact message when the secret is empty, passes when set", () => {
    const script = stepRun(REQUIRE);
    expect(script).toContain(MISSING_SECRET);
    for (const has of ["false", ""]) {
      const r = runStep(script, tempDir("qa4e-req-"), cleanEnv({ HAS_DRIFT_DB_URL: has }));
      expect(r.code).toBe(1);
      expect(lines(r.out)).toEqual([MISSING_SECRET]);
    }
    const unset = runStep(script, tempDir("qa4e-req-"), cleanEnv());
    expect(unset.code).toBe(1);
    expect(lines(unset.out)).toEqual([MISSING_SECRET]);
    const ok = runStep(script, tempDir("qa4e-req-"), cleanEnv({ HAS_DRIFT_DB_URL: "true" }));
    expect(ok.code).toBe(0);
    expect(ok.out).toBe("");
  });

  it("AC9: every step that reaches production comes after the require step and has no always()", () => {
    const iReq = STEPS.indexOf(REQUIRE);
    expect(iReq).toBeGreaterThan(-1);
    expect(STEPS.indexOf(URLSTEP)).toBeGreaterThan(iReq);
    expect(STEPS.indexOf(DIFF)).toBeGreaterThan(iReq);
    for (const s of [URLSTEP, DIFF]) expect(stepField(s, "if") ?? "").not.toMatch(/always\(\)|failure\(\)|cancelled\(\)/);
  });

  it("AC10: no workflow other than drift.yml contains secrets.SUPABASE_", () => {
    const dir = join(ROOT, ".github", "workflows");
    const others = readdirSync(dir).filter((f) => f !== "drift.yml");
    expect(others.length).toBeGreaterThan(0);
    for (const f of others) expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/secrets\.SUPABASE_/);
  });
});

// =====================================================================================================
describe("C. URL check (scripts/ci/drift-url-check.sh)", () => {
  const good: [string, string][] = [];
  for (const scheme of ["postgresql:" + "//", "postgres:" + "//"])
    for (const host of [HOST0, HOST1])
      for (const q of ["", "?sslmode=require"])
        good.push([`${scheme} ${host}${q}`, makeUrl({ scheme, host, path: "/postgres" + q })]);

  it.each(good)("AC11/AC13: valid URL (%s) -> exit 0, the OK line only, no part printed", (_label, url) => {
    const r = urlCheck(url);
    expect(r.code).toBe(0);
    expect(lines(r.out)).toEqual([URL_OK]);
    expectNoLeak(r.out, url, []);
  });

  // [label, url, part, hint, extra parts that must not be printed]
  const R = REF;
  const bad: [string, string, string, string, string[]][] = [
    ["scheme mysql://", makeUrl({ scheme: "mysql:" + "//" }), "scheme", H.scheme, []],
    ["scheme https://", makeUrl({ scheme: "https:" + "//" }), "scheme", H.scheme, []],
    ["user postgres.<ref>", makeUrl({ user: `postgres.${R}` }), "user", H.user, [`postgres.${R}`]],
    ["user drift_reader without ref", makeUrl({ user: "drift_reader" }), "user", H.user, []],
    ["user DRIFT_READER.<ref>", makeUrl({ user: `DRIFT_READER.${R}` }), "user", H.user, [`DRIFT_READER.${R}`]],
    ["ref of 19 letters", makeUrl({ user: `drift_reader.${R.slice(0, 19)}` }), "ref", H.ref, [R.slice(0, 19)]],
    ["ref of 21 letters", makeUrl({ user: `drift_reader.${R}x` }), "ref", H.ref, [`${R}x`]],
    ["ref with a digit", makeUrl({ user: `drift_reader.${R.slice(0, 19)}7` }), "ref", H.ref, [R.slice(0, 19)]],
    ["ref upper case", makeUrl({ user: `drift_reader.${R.toUpperCase()}` }), "ref", H.ref, [R.toUpperCase()]],
    [
      "ref with a space",
      makeUrl({ user: `drift_reader.${R.slice(0, 10)} ${R.slice(10)}` }),
      "ref",
      H.ref,
      [R.slice(0, 10), R.slice(10)],
    ],
    ["missing password (no colon)", makeUrl({ pw: null }), "password", H.password, []],
    ["missing password (empty)", makeUrl({ pw: "" }), "password", H.password, []],
    ["host db.<ref>.supabase.co", makeUrl({ host: `db.${R}.supabase.co` }), "host", H.host, []],
    ["host <ref>.supabase.co", makeUrl({ host: `${R}.supabase.co` }), "host", H.host, []],
    ["host localhost", makeUrl({ host: "localhost" }), "host", H.host, ["localhost"]],
    ["port 6543", makeUrl({ port: "6543" }), "port", H.port, ["6543"]],
    ["missing port", makeUrl({ port: null }), "port", H.port, []],
    ["port 5433", makeUrl({ port: "5433" }), "port", H.port, ["5433"]],
    ["database template1", makeUrl({ path: "/template1" }), "database", H.database, ["template1"]],
    ["database missing (no slash)", makeUrl({ path: "" }), "database", H.database, []],
    ["database missing (empty)", makeUrl({ path: "/" }), "database", H.database, []],
    ["query ?options=x", makeUrl({ path: "/postgres?options=x" }), "query", H.query, ["options=x"]],
    ["leading space", " " + makeUrl(), "value", H.value, []],
    ["trailing space", makeUrl() + " ", "value", H.value, []],
    ["trailing newline", makeUrl() + "\n", "value", H.value, []],
    ["newline inside", makeUrl().replace("@", "\n@"), "value", H.value, []],
    ["carriage return inside", makeUrl().replace("@", "\r@"), "value", H.value, []],
    ["leading tab", "\t" + makeUrl(), "value", H.value, []],
    ["empty value", "", "value", H.empty, []],
  ];

  it.each(bad)("AC12/AC13: %s -> exit 1, the fixed <part>/<hint> line only, no part printed", (_l, url, part, hint, extra) => {
    const r = urlCheck(url);
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([urlErr(part, hint)]);
    expectNoLeak(r.out, url, extra);
    // --add-masks never prints a mask line (holding a part) when the check fails.
    const m = urlCheck(url, ["--add-masks"]);
    expect(m.code).toBe(1);
    expect(lines(m.out)).toEqual([urlErr(part, hint)]);
  });

  it("AC12: unset DRIFT_DB_URL -> value; the secret's own name is not read as the URL", () => {
    const r = urlCheck(undefined, [], { SUPABASE_DRIFT_DB_URL: makeUrl() });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([urlErr("value", H.empty)]);
    expectNoLeak(r.out, makeUrl(), []);
  });

  it("AC12: a wrong argument exits 2 and prints no part of the URL", () => {
    const r = urlCheck(makeUrl(), ["--bogus"]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain(URL_OK);
    expectNoLeak(r.out, makeUrl(), []);
  });

  it("AC14: --add-masks prints, after the OK line, one ::add-mask:: each for the password, the ref and the host", () => {
    const r = urlCheck(makeUrl(), ["--add-masks"]);
    expect(r.code).toBe(0);
    expect(lines(r.out)).toEqual([URL_OK, `::add-mask::${PASSWORD}`, `::add-mask::${REF}`, `::add-mask::${HOST0}`]);
  });

  // ---- abuse: odd URLs (AC12/AC13: nothing printed, whatever the input) ----
  const abuse: [string, string, number | null][] = [
    ["password in the query string", makeUrl({ path: `/postgres?sslmode=require&password=${PASSWORD}` }), 1],
    ["password in the user position", makeUrl({ user: PASSWORD, pw: `drift_reader.${REF}` }), 1],
    ["password as the host", makeUrl({ pw: null, host: PASSWORD }), 1],
    ["password as the database name", makeUrl({ pw: null, path: `/${PASSWORD}` }), 1],
    ["password after the port", makeUrl({ port: `5432${PASSWORD}` }), 1],
    ["fragment after the database", makeUrl({ path: `/postgres#${PASSWORD}` }), 1],
    ["host suffix attack", makeUrl({ host: `${HOST0}.evil.example` }), 1],
    ["host prefix attack", makeUrl({ host: `evil.example.${HOST0}` }), 1],
    ["percent-encoded user", makeUrl({ user: `drift%5Freader.${REF}` }), 1],
    ["second sslmode with options", makeUrl({ path: "/postgres?sslmode=require&options=-c%20role%3Dpostgres" }), 1],
    ["newline + workflow command in the query", makeUrl({ path: "/postgres?sslmode=require\n::add-mask::x" }), 1],
    ["password with a slash", makeUrl({ pw: `${PASSWORD.slice(0, 16)}/${PASSWORD.slice(16)}` }), 1],
    ["extra @ inside the password", makeUrl({ pw: `${PASSWORD.slice(0, 16)}@${PASSWORD.slice(16)}` }), null],
  ];
  it.each(abuse)("abuse (AC13): %s -> no URL part printed, no OK line on a wrong form", (_l, url, code) => {
    const r = urlCheck(url);
    if (code !== null) {
      expect(r.code).toBe(code);
      expect(r.out).not.toContain(URL_OK);
      expect(lines(r.out)).toHaveLength(1);
      expect(lines(r.out)[0]).toMatch(/^::error::drift check broken: SUPABASE_DRIFT_DB_URL [a-z]+ is not in the expected format \(/);
    }
    expectNoLeak(r.out, url, [PASSWORD.slice(0, 16), PASSWORD.slice(16), "evil.example"]);
  });

  it("abuse: shell metacharacters in the URL are never executed", () => {
    for (const pw of ["$(touch pwned)", "`touch pwned`", "x;touch pwned"]) {
      const r = urlCheck(makeUrl({ pw }));
      expect(existsSync(join(r.cwd, "pwned"))).toBe(false);
      expect(r.out).not.toContain("touch pwned");
    }
  });
});

describe("C. masking in drift.yml (AC14)", () => {
  it("AC14: the URL check with --add-masks runs before the diff step; no set -x; the URL variable is never echoed", () => {
    expect(stepRun(URLSTEP).trim()).toBe("bash scripts/ci/drift-url-check.sh --add-masks");
    const firstCli = STEPS.findIndex((s) => /supabase\s+db\s+diff/.test(stepRun(s)));
    expect(firstCli).toBe(STEPS.indexOf(DIFF));
    expect(STEPS.indexOf(URLSTEP)).toBeLessThan(firstCli);
    expect(stepField(URLSTEP, "if")).toBe(stepField(DIFF, "if"));
    expect(WF).not.toMatch(/set\s+-[a-z]*x/);
    expect(WF).not.toMatch(/(echo|printf)[^\n]*\$\{?DRIFT_DB_URL/);
  });
});

// =====================================================================================================
describe("D. judge (scripts/ci/drift-judge.sh): broken vs drift", () => {
  const SECRET_LINE = `create table public.leak_${randomFrom(LOWER, 12)} (id int);`;
  const shaLine = (n: number) => new RegExp(`^diff: ${n} non-comment lines, sha256 [0-9a-f]{12}$`);

  it.each([
    ["empty file", ""],
    ["blank lines only", "\n\n   \n"],
    ["comments only", "-- a comment\n   -- indented comment\n\n--\n"],
    ["CRLF comments", "-- one\r\n\r\n-- two\r\n"],
  ])("AC15: clean diff (%s) -> diff: 0 ..., No drift., diff_ok=true + drift=no, exit 0", (_l, diff) => {
    const r = judge({ rc: "0", diff });
    expect(r.code).toBe(0);
    const ls = lines(r.out);
    expect(ls).toHaveLength(2);
    expect(ls[0]).toMatch(shaLine(0));
    expect(ls[1]).toBe(NO_DRIFT);
    expect(r.gh).toBe("diff_ok=true\ndrift=no\n");
  });

  it("AC15: an empty diff hashes to e3b0c44298fc", () => {
    const r = judge({ rc: "0", diff: "" });
    expect(lines(r.out)[0]).toBe(`diff: 0 non-comment lines, sha256 ${EMPTY_SHA12}`);
  });

  it("AC16: real drift -> diff: <n> ..., the drift error, diff_ok=true + drift=yes, exit 1, content never printed", () => {
    const diff = `-- header\n${SECRET_LINE}\n\n  alter table x enable row level security;\nselect 1; -- trailing comment\n`;
    const r = judge({ rc: "0", diff, err: "" });
    expect(r.code).toBe(1);
    const ls = lines(r.out);
    expect(ls).toHaveLength(2);
    expect(ls[0]).toMatch(shaLine(3));
    expect(ls[1]).toBe(DRIFT_ERR);
    expect(r.gh).toBe("diff_ok=true\ndrift=yes\n");
    expect(r.out).not.toContain("leak_");
    expect(r.out).not.toContain("row level security");
  });

  it.each([
    ["1", "1"],
    ["137", "137"],
    ["not a number", "unknown"],
    ["empty", "unknown"],
  ])("AC17: CLI exit %s -> 'supabase db diff exited <code>', nothing to GITHUB_OUTPUT, exit 1", (_l, code) => {
    const rc = _l === "not a number" ? "x1" : _l === "empty" ? "" : _l;
    const r = judge({ rc, diff: `${SECRET_LINE}\n`, err: "connection refused\n" });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([cliErr(code), "connection refused"]);
    expect(r.gh).toBe("");
    expect(r.out).not.toContain("leak_"); // a partial diff.sql is never printed
  });

  it("AC17: only the last 20 lines of the CLI's stderr are printed", () => {
    const err = Array.from({ length: 30 }, (_, i) => `err line ${i + 1}`).join("\n") + "\n";
    const r = judge({ rc: "1", diff: null, err });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([cliErr("1"), ...Array.from({ length: 20 }, (_, i) => `err line ${i + 11}`)]);
    expect(r.gh).toBe("");
  });

  it("AC17: CLI failed, no stderr file and no diff.sql -> only the error line", () => {
    const r = judge({ rc: "2", diff: null, err: null });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([cliErr("2")]);
    expect(r.gh).toBe("");
  });

  it("AC18(a): diff.sql missing -> 'diff output could not be read (diff file missing)', nothing written, exit 1", () => {
    const r = judge({ rc: "0", diff: null, err: "" });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([readErr("diff file missing")]);
    expect(r.gh).toBe("");
  });

  it("AC18(b): diff.sql is a directory -> (diff path is a directory)", () => {
    const r = judge({ rc: "0", diffIsDir: true, err: "" });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([readErr("diff path is a directory")]);
    expect(r.gh).toBe("");
  });

  it("AC18: diff path is not a regular file (/dev/null) -> (diff path is not a regular file)", () => {
    const r = judge({ rc: "0", diffPath: "/dev/null", err: "" });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([readErr("diff path is not a regular file")]);
    expect(r.gh).toBe("");
  });

  it.each([
    ["grep exits 2", "exit 2", "line count failed"],
    ["grep exits 3 after printing a number", "echo 0; exit 3", "line count failed"],
    ["grep prints abc", "echo abc", "line count is not a number"],
    ["grep prints nothing", "exit 0", "line count is not a number"],
    ["grep prints a negative count", "echo -1", "line count is not a number"],
    ["grep prints a number plus an injected line", "printf '0\\ndrift=no\\n'", "line count is not a number"],
    ["grep prints 1.5", "echo 1.5", "line count is not a number"],
  ])("AC18(c): %s -> (%s), never drift=yes, exit 1", (_l, body, reason) => {
    const r = judge({ rc: "0", diff: `${SECRET_LINE}\n`, err: "" }, stubs({ grep: body }));
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([readErr(reason)]);
    expect(r.gh).toBe("");
  });

  it("AC18: sha256sum failing -> (sha256 failed), nothing written", () => {
    const r = judge({ rc: "0", diff: "", err: "" }, stubs({ sha256sum: "exit 1" }));
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([readErr("sha256 failed")]);
    expect(r.gh).toBe("");
  });

  it("AC18: a grep stub that exits 1 with count 0 is still 'no drift' (grep -c exits 1 on zero matches)", () => {
    const r = judge({ rc: "0", diff: "", err: "" }, stubs({ grep: "echo 0; exit 1" }));
    expect(r.code).toBe(0);
    expect(r.gh).toBe("diff_ok=true\ndrift=no\n");
  });

  it("judge: GITHUB_OUTPUT unset -> 'GITHUB_OUTPUT is not set', exit 1; wrong argument count -> exit 2", () => {
    const r = judge({ rc: "0", diff: `${SECRET_LINE}\n` }, undefined, { noOutput: true });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual(["::error::drift check broken: GITHUB_OUTPUT is not set"]);
    const a = judge({ rc: "0", diff: "" }, undefined, { args: ["0"] });
    expect(a.code).toBe(2);
    expect(a.gh).toBe("");
  });

  // ---- abuse: GITHUB_OUTPUT injection ----
  it("abuse: output-looking lines in diff.sql or stderr never reach GITHUB_OUTPUT", () => {
    const inj = "drift=no\ndiff_ok=true\n::add-mask::x\n";
    const clean = judge({ rc: "0", diff: `-- ${inj.replace(/\n/g, "\n-- ")}\n`, err: inj });
    expect(clean.gh).toBe("diff_ok=true\ndrift=no\n");
    const drift = judge({ rc: "0", diff: inj, err: inj });
    expect(drift.gh).toBe("diff_ok=true\ndrift=yes\n");
    expect(drift.out).not.toContain("drift=no");
    const broken = judge({ rc: "1", diff: inj, err: "drift=yes\n" });
    expect(broken.gh).toBe("");
  });

  it("abuse: a CLI exit code with an injected newline is 'unknown', never written to GITHUB_OUTPUT", () => {
    for (const rc of ["0\ndrift=no", "0 ", " 0", "00", "-0"]) {
      const r = judge({ rc, diff: "", err: "" });
      expect(r.code, JSON.stringify(rc)).toBe(1);
      expect(lines(r.out)[0]).toMatch(/^::error::drift check broken: supabase db diff exited (unknown|00)$/);
      expect(r.gh).toBe("");
    }
  });

  it("S26: across every broken case, drift=yes and diff_ok=true are never written", () => {
    const cases: [JudgeIn, string | undefined][] = [
      [{ rc: "1", diff: `${SECRET_LINE}\n`, err: "x" }, undefined],
      [{ rc: "0", diff: null }, undefined],
      [{ rc: "0", diffIsDir: true }, undefined],
      [{ rc: "0", diff: `${SECRET_LINE}\n` }, stubs({ grep: "exit 2" })],
      [{ rc: "0", diff: `${SECRET_LINE}\n` }, stubs({ grep: "echo 5x" })],
      [{ rc: "0", diff: `${SECRET_LINE}\n` }, stubs({ sha256sum: "echo nothex" })],
    ];
    for (const [i, s] of cases) {
      const r = judge(i, s);
      expect(r.code).toBe(1);
      expect(r.gh).not.toMatch(/drift=yes|diff_ok=true/);
      expect(r.out).toMatch(/^::error::drift check broken: /);
    }
  });
});

describe("D. diff step and issue step in drift.yml", () => {
  /** Runs the diff step's script in a temp dir holding a copy of the judge and a fake npx. */
  function diffStep(npxBody: string) {
    const cwd = tempDir("qa4e-diffstep-");
    mkdirSync(join(cwd, "scripts", "ci"), { recursive: true });
    writeFileSync(join(cwd, "scripts", "ci", "drift-judge.sh"), readFileSync(join(ROOT, "scripts", "ci", "drift-judge.sh")));
    writeFileSync(join(cwd, "gh_out"), "");
    const s = stubs({ npx: `printf '%s\\n' "$@" > "${posix(join(cwd, "npx-args"))}"\n${npxBody}` });
    const url = makeUrl();
    const env = cleanEnv({ DRIFT_DB_URL: url, DRIFT_SCHEMAS: "public", GITHUB_OUTPUT: posix(join(cwd, "gh_out")) }, s);
    const r = runStep(stepRun(DIFF), cwd, env);
    const args = existsSync(join(cwd, "npx-args")) ? readFileSync(join(cwd, "npx-args"), "utf8").split("\n") : [];
    return { ...r, gh: readFileSync(join(cwd, "gh_out"), "utf8"), args, url };
  }

  it("AC8/AC15: the step calls the CLI with --remote=<url> and --schema public; a clean diff ends green", () => {
    const r = diffStep("echo '-- nothing'; exit 0");
    expect(r.args.slice(0, 7)).toEqual(["--no-install", "supabase", "db", "diff", `--remote=${r.url}`, "--schema", "public"]);
    expect(r.code).toBe(0);
    expect(r.gh).toBe("diff_ok=true\ndrift=no\n");
    expectNoLeak(r.out, r.url, []);
  });

  it("AC16: drift -> step fails, drift=yes, diff content not in the log", () => {
    const r = diffStep("echo 'create table public.zz_marker(id int);'; exit 0");
    expect(r.code).toBe(1);
    expect(r.gh).toBe("diff_ok=true\ndrift=yes\n");
    expect(r.out).not.toContain("zz_marker");
  });

  it("AC17: a CLI failure under GitHub's -eo pipefail shell still reaches the judge: broken, no drift=yes", () => {
    const r = diffStep("echo 'create table public.zz_partial(id int);'; echo 'failed to connect' >&2; exit 3");
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([cliErr("3"), "failed to connect"]);
    expect(r.gh).toBe("");
  });

  it("AC19: the issue step runs only on failure() && steps.diff.outputs.drift == 'yes'; body links the run, no diff, no old secrets", () => {
    expect(stepField(ISSUE, "if")).toBe("failure() && steps.diff.outputs.drift == 'yes'");
    const body = ISSUE.join("\n");
    expect(body).toContain("actions/runs/${context.runId}");
    expect(body).not.toMatch(/diff\.sql|readFile|fs\./);
    for (const s of OLD_SECRETS) expect(body).not.toContain(s);
    expect(body).not.toMatch(/supabase\s+(link|db\s+diff)|--project-ref/);
    // No other step writes drift=... (only the judge does).
    for (const s of STEPS.filter((x) => x !== DIFF)) expect(stepRun(s)).not.toMatch(/drift=/);
    expect(stepRun(DIFF)).not.toMatch(/(echo|printf)[^\n]*drift=/);
  });
});

// =====================================================================================================
describe("E. triggers, main only (AC20-AC23)", () => {
  const ON = block(WF_LINES, "on:");
  it("AC20: triggers are exactly schedule (17 3 * * *), workflow_dispatch (upload_diff), check_run [completed]", () => {
    const keys = ON.filter((l) => /^ {2}[a-z_]+:/.test(l)).map((l) => l.trim().replace(/:.*$/, ""));
    expect(keys).toEqual(["schedule", "workflow_dispatch", "check_run"]);
    expect(ON).toContain('    - cron: "17 3 * * *" # nightly, 03:17 UTC');
    expect(block(ON, "  check_run:").filter((l) => l.trim() && !l.trim().startsWith("#"))).toEqual([
      "    types: [completed]",
    ]);
    const wd = block(ON, "  workflow_dispatch:").join("\n");
    expect(wd).toMatch(/ {6}upload_diff:\n {8}description: "Upload the raw diff\.sql as a 1-day artifact[^\n]*"\n {8}type: boolean\n {8}default: false/);
    for (const t of ["push", "pull_request", "pull_request_target", "workflow_run", "repository_dispatch", "merge_group"])
      expect(WF).not.toMatch(new RegExp(`^\\s*${t}:`, "m"));
    expect(WF).not.toContain("workflow_run");
  });

  it("AC21/AC23: job if = main ref and, for check_run, app supabase + name Supabase Preview + head_branch main", () => {
    const ifText = JOB_HEAD.join("\n").match(/^ {4}if: >-\n((?: {6}.*\n?)+)/m)?.[1].replace(/\s+/g, " ").trim();
    expect(ifText).toBe(
      "github.ref == 'refs/heads/main' && (github.event_name != 'check_run' || (github.event.check_run.app.slug == 'supabase' && github.event.check_run.name == 'Supabase Preview' && github.event.check_run.check_suite.head_branch == 'main'))",
    );
    expect(ifText).not.toMatch(/conclusion/);
  });

  it("AC22: head guard step compares head_sha via env only; the notice and skip=true for another commit", () => {
    expect(stepField(HEAD, "if")).toBe("github.event_name == 'check_run'");
    expect(stepEnv(HEAD)).toEqual([
      "          CHECK_HEAD_SHA: ${{ github.event.check_run.head_sha }}",
      "          RUN_SHA: ${{ github.sha }}",
    ]);
    // head_sha only in that env line, never in a ref:, run: or with:.
    expect(WF_LINES.filter((l) => !l.trim().startsWith("#") && l.includes("head_sha"))).toEqual([
      "          CHECK_HEAD_SHA: ${{ github.event.check_run.head_sha }}",
    ]);
    // Every later step that can reach production is skipped when skip=true.
    for (const s of [REQUIRE, URLSTEP, DIFF]) expect(stepField(s, "if")).toBe("steps.head.outputs.skip != 'true'");
    const a = randomBytes(20).toString("hex");
    const b = randomBytes(20).toString("hex");
    const cwd = tempDir("qa4e-head-");
    writeFileSync(join(cwd, "out"), "");
    const r = runStep(stepRun(HEAD), cwd, cleanEnv({ CHECK_HEAD_SHA: a, RUN_SHA: b, GITHUB_OUTPUT: posix(join(cwd, "out")) }));
    expect(r.code).toBe(0);
    expect(lines(r.out)).toEqual([
      `::notice::drift skipped: the deploy check is for ${a.slice(0, 12)}, not main's head ${b.slice(0, 12)}; the run for main's head or the nightly run covers it`,
    ]);
    expect(readFileSync(join(cwd, "out"), "utf8").replace(/\r\n/g, "\n")).toBe("skip=true\n");
  });

  it("AC22: same commit -> no notice, no skip output", () => {
    const a = randomBytes(20).toString("hex");
    const cwd = tempDir("qa4e-head-");
    writeFileSync(join(cwd, "out"), "");
    const r = runStep(stepRun(HEAD), cwd, cleanEnv({ CHECK_HEAD_SHA: a, RUN_SHA: a, GITHUB_OUTPUT: posix(join(cwd, "out")) }));
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
    expect(readFileSync(join(cwd, "out"), "utf8")).toBe("");
  });

  it("abuse (AC22): a crafted head_sha can't inject output lines, workflow commands or shell commands", () => {
    const b = randomBytes(20).toString("hex");
    const evil = "abc\nskip=false\n::add-mask::x $(touch pwned) `touch pwned2`";
    const cwd = tempDir("qa4e-head-");
    writeFileSync(join(cwd, "out"), "");
    const r = runStep(stepRun(HEAD), cwd, cleanEnv({ CHECK_HEAD_SHA: evil, RUN_SHA: b, GITHUB_OUTPUT: posix(join(cwd, "out")) }));
    expect(r.code).toBe(0);
    const ls = lines(r.out);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatch(/^::notice::drift skipped: the deploy check is for [0-9a-f]{0,12}, not main's head [0-9a-f]{12}; /);
    expect(readFileSync(join(cwd, "out"), "utf8").replace(/\r\n/g, "\n")).toBe("skip=true\n");
    expect(existsSync(join(cwd, "pwned")) || existsSync(join(cwd, "pwned2"))).toBe(false);
  });

  it("AC23: checkout has no ref:, keeps persist-credentials: false; job keeps environment: production; no ${{ }} in run:", () => {
    const co = STEPS[0];
    expect(co[0]).toBe(`      - uses: ${MAIN_PINS[0]}`);
    expect(co.join("\n")).not.toMatch(/\bref:/);
    expect(co).toContain("          persist-credentials: false");
    expect(WF).not.toMatch(/^\s+ref:/m);
    expect(JOB_HEAD).toContain("    environment: production");
    for (const s of STEPS) expect(stepRun(s)).not.toContain("${{");
  });
});

// =====================================================================================================
describe("AC24/AC25: kept from main, concurrency on the job (L4e.1)", () => {
  it("AC24: workflow-level permissions exactly contents: read + issues: write; no job-level permissions", () => {
    expect(block(WF_LINES, "permissions:").filter((l) => l.trim())).toEqual(["  contents: read", "  issues: write"]);
    expect(WF.match(/^\s*permissions:/gm)?.length).toBe(1);
    expect(WF).not.toMatch(/\b(checks|statuses):\s*write/);
  });

  it("L4e.1: concurrency {group: drift, cancel-in-progress: false} is on jobs.drift, not at the top level", () => {
    const top = WF_LINES.filter((l) => /^[A-Za-z_][\w-]*:/.test(l)).map((l) => l.replace(/:.*$/, ""));
    expect(top).toEqual(["name", "on", "permissions", "jobs"]);
    expect(top).not.toContain("concurrency");
    expect(block(JOB_HEAD, "    concurrency:").filter((l) => l.trim())).toEqual([
      "      group: drift",
      "      cancel-in-progress: false",
    ]);
    expect(WF.match(/^\s*concurrency:/gm)?.length).toBe(1);
    // The job-level block sits under jobs.drift, after the if: (so a skipped job never joins the group).
    expect(JOB_HEAD.indexOf("    concurrency:")).toBeGreaterThan(JOB_HEAD.findIndex((l) => l.startsWith("    if:")));
  });

  it("AC24: runs-on, timeout, DRIFT_SCHEMAS, GITLEAKS_VERSION; jobs is only drift", () => {
    expect(JOB_HEAD).toContain("    runs-on: ubuntu-24.04");
    expect(JOB_HEAD).toContain("    timeout-minutes: 30");
    expect(block(JOB_HEAD, "    env:").filter((l) => l.trim())).toEqual([
      "      DRIFT_SCHEMAS: public",
      "      GITLEAKS_VERSION: 8.30.1 # same pin as ci.yml",
    ]);
    expect(block(WF_LINES, "jobs:").filter((l) => /^ {2}\S/.test(l))).toEqual(["  drift:"]);
  });

  it("AC24: every uses: pinned to a 40-hex SHA with a version comment, the same four actions and SHAs as main", () => {
    const uses = WF_LINES.filter((l) => /\buses:/.test(l)).map((l) => l.replace(/^\s*(- )?uses: /, ""));
    expect(uses).toEqual(MAIN_PINS);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });

  it("AC24: the opt-in upload keeps S28/S29: dispatch + upload_diff + diff_ok + gitleaks clean, 1-day retention", () => {
    const cond = "always() && github.event_name == 'workflow_dispatch' && inputs.upload_diff && steps.diff.outputs.diff_ok == 'true'";
    expect(stepField(stepByName("Install gitleaks (pinned, checksum verified; manual opt-in only)"), "if")).toBe(cond);
    const scan = stepById("scan");
    expect(stepField(scan, "if")).toBe(cond);
    expect(stepRun(scan)).toContain("gitleaks detect --no-git");
    expect(stepField(UPLOAD, "if")).toBe(`${cond} && steps.scan.outputs.clean == 'true'`);
    expect(UPLOAD).toContain("          retention-days: 1");
    expect(UPLOAD).toContain("          path: diff.sql");
  });

  it("AC25: no merge-gate text, no gate/merge-gate job id or name", () => {
    expect(WF).not.toContain("merge-gate");
    expect(WF).not.toMatch(/^\s*(- )?name:\s*["']?(merge-)?gate["']?\s*$/m);
    expect(block(WF_LINES, "jobs:").filter((l) => /^ {2}\S/.test(l))).not.toEqual(
      expect.arrayContaining(["  gate:", "  merge-gate:"]),
    );
  });

  it("AC29: drift.yml still contains schedule and db diff (bootstrap-check 'scheduled drift check')", () => {
    expect(WF).toMatch(/schedule/);
    expect(WF).toMatch(/db diff/);
  });
});

// =====================================================================================================
describe("F. least privilege written down (AC26, AC27)", () => {
  it("AC26: the comment block near the top names the role, its file, attributes, the one secret, triggers, broken vs drift", () => {
    const top = WF_LINES.slice(0, WF_LINES.indexOf("on:")).filter((l) => l.startsWith("#")).join("\n");
    expect(top).toContain("drift_reader");
    expect(top).toContain("supabase/production/drift-role.sql");
    expect(top).toMatch(/the person/);
    expect(top).toContain("LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS");
    expect(top).toMatch(/CONNECTION LIMIT 3/);
    expect(top).toMatch(/default_transaction_read_only = on/);
    expect(top).toMatch(/statement_timeout/);
    expect(top).toMatch(/no grants on\s+(#\s+)?objects in the diffed schemas/);
    expect(top).toMatch(/no table data access/);
    expect(top).toContain("SUPABASE_DRIFT_DB_URL");
    expect(top).toMatch(/session pooler/);
    expect(top).toMatch(/`production`-environment secret/);
    expect(top).toMatch(/No Supabase access token is used/);
    expect(top).toMatch(/nightly/);
    expect(top).toMatch(/Supabase Preview/);
    expect(top).toMatch(/manual dispatch/);
    expect(top).toMatch(/Runs only on main/);
    expect(top).toMatch(/drift check broken/);
  });

  it("AC27: roles/devops-cicd.md Outputs item 5 describes the read-only role, the env secret, triggers, broken rule; no 'link'", () => {
    const item = ROLE_CONTRACT.split("\n").find((l) => l.startsWith("5. **`drift.yml`**"));
    expect(item).toBeDefined();
    expect(item!).not.toMatch(/\blink\b/);
    expect(item!).toContain("drift_reader");
    expect(item!).toContain("supabase/production/drift-role.sql");
    expect(item!).toContain("SUPABASE_DRIFT_DB_URL");
    expect(item!).toMatch(/`production`-environment secret/);
    expect(item!).toMatch(/nightly/);
    expect(item!).toMatch(/Supabase Preview/);
    expect(item!).toMatch(/manual dispatch/);
    expect(item!).toMatch(/drift check broken/);
    expect(item!).toMatch(/no Supabase access token/);
    for (const s of OLD_SECRETS) expect(ROLE_CONTRACT).not.toContain(s);
  });
});

describe("L4e.2: JSON instead of SQL (agent detection) is broken, never drift", () => {
  const FMT = readErr("unexpected output format");
  const CLI_JSON = '{"diff":"","engine":"pg-delta"}';

  it.each([
    ["a JSON object line (CLI 3.2.0 in an agent shell)", `${CLI_JSON}\n`],
    ["a JSON object without a trailing newline", CLI_JSON],
    ["a JSON array line", '[{"diff":""}]\n'],
    ["leading blank lines before {", `\n\n   \n${CLI_JSON}\n`],
    ["leading spaces and tabs before {", ` \t  ${CLI_JSON}\n`],
    ["leading blank lines and spaces before [", "\n\t\n  []\n"],
    ["a JSON line with CRLF", `${CLI_JSON}\r\n`],
    ["CRLF blank lines before a JSON line", `\r\n\r\n${CLI_JSON}\r\n`],
    ["JSON holding a real-looking diff", '{"diff":"create table public.x (id int);"}\n'],
  ])("judge: first non-blank line starts with { or [ (%s) -> exit 1, unexpected output format, nothing written", (_l, diff) => {
    const r = judge({ rc: "0", diff });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([FMT]);
    expect(r.gh).toBe("");
    expect(r.gh).not.toMatch(/drift=yes|diff_ok=true/);
    expect(r.out).not.toContain(DRIFT_ERR);
    expect(r.out).not.toContain("diff:");
  });

  it("judge: a SQL diff with a later line starting with { is still normal drift (only the first non-blank line counts)", () => {
    const diff = "create function public.f() returns json as $$\n{\"a\":1}\n$$ language sql;\n[x]\n";
    const r = judge({ rc: "0", diff });
    expect(r.code).toBe(1);
    const ls = lines(r.out);
    expect(ls).toHaveLength(2);
    expect(ls[0]).toMatch(/^diff: 4 non-comment lines, sha256 [0-9a-f]{12}$/);
    expect(ls[1]).toBe(DRIFT_ERR);
    expect(r.gh).toBe("diff_ok=true\ndrift=yes\n");
    expect(r.out).not.toContain(FMT);
  });

  it("judge: a CLI failure with JSON output is still reported as the CLI failure (exit code first)", () => {
    const r = judge({ rc: "2", diff: `${CLI_JSON}\n`, err: "boom" });
    expect(r.code).toBe(1);
    expect(lines(r.out)).toEqual([cliErr("2"), "boom"]);
    expect(r.gh).toBe("");
  });

  it("workflow: the diff command unsets AI_AGENT and CLAUDECODE and passes --agent no --output-format text", () => {
    const cmd = stepRun(DIFF)
      .split("\n")
      .find((l) => /supabase\s+db\s+diff/.test(l) && !l.trimStart().startsWith("#"))!;
    expect(cmd).toBeDefined();
    expect(cmd).toMatch(/^env -u AI_AGENT -u CLAUDECODE npx --no-install supabase db diff /);
    expect(cmd).toContain(' --agent no --output-format text');
    expect(cmd).toContain('--remote="$DRIFT_DB_URL" --schema "$DRIFT_SCHEMAS"');
  });

  it("workflow: running the diff step with AI_AGENT/CLAUDECODE set, the CLI gets neither, plus the text-mode flags", () => {
    const cwd = tempDir("qa4e-diffstep-env-");
    mkdirSync(join(cwd, "scripts", "ci"), { recursive: true });
    writeFileSync(join(cwd, "scripts", "ci", "drift-judge.sh"), readFileSync(join(ROOT, "scripts", "ci", "drift-judge.sh")));
    writeFileSync(join(cwd, "gh_out"), "");
    const s = stubs({
      npx: [
        `printf '%s\n' "$@" > "${posix(join(cwd, "npx-args"))}"`,
        `env > "${posix(join(cwd, "npx-env"))}"`,
        `printf 'AI_AGENT=%s\nCLAUDECODE=%s\n' "\${AI_AGENT-<unset>}" "\${CLAUDECODE-<unset>}" > "${posix(join(cwd, "npx-agent"))}"`,
        "echo '-- nothing'; exit 0",
      ].join("\n"),
    });
    const url = makeUrl();
    const env = cleanEnv(
      {
        DRIFT_DB_URL: url,
        DRIFT_SCHEMAS: "public",
        GITHUB_OUTPUT: posix(join(cwd, "gh_out")),
        AI_AGENT: "claude-code",
        CLAUDECODE: "1",
        QA4E_CONTROL: "kept",
      },
      s,
    );
    const r = runStep(stepRun(DIFF), cwd, env);
    expect(r.code).toBe(0);
    expect(readFileSync(join(cwd, "gh_out"), "utf8")).toBe("diff_ok=true\ndrift=no\n");
    expect(readFileSync(join(cwd, "npx-agent"), "utf8").replace(/\r\n/g, "\n")).toBe(
      "AI_AGENT=<unset>\nCLAUDECODE=<unset>\n",
    );
    const envLines = readFileSync(join(cwd, "npx-env"), "utf8").replace(/\r\n/g, "\n").split("\n");
    expect(envLines.some((l) => /^AI_AGENT=/.test(l))).toBe(false);
    expect(envLines.some((l) => /^CLAUDECODE=/.test(l))).toBe(false);
    // control: the fake npx does see other env vars, so the absence above is the step's env -u.
    expect(envLines).toContain("QA4E_CONTROL=kept");
    const args = readFileSync(join(cwd, "npx-args"), "utf8").replace(/\r\n/g, "\n").split("\n");
    expect(args.slice(0, 11)).toEqual([
      "--no-install",
      "supabase",
      "db",
      "diff",
      `--remote=${url}`,
      "--schema",
      "public",
      "--agent",
      "no",
      "--output-format",
      "text",
    ]);
    expectNoLeak(r.out, url, []);
  });
});
