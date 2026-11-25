// Task 4d: tests for scripts/verify.sh (client-bundle scan L27, destructive scan L15, --passWithNoTests L5) and
// scripts/bootstrap-check.sh (S19: production Environment and repository secrets), AC1-AC31 of tasks/4d/TASK_BRIEF.md,
// plus AC35-AC37 (S19 accepted risk while the person's decision is open) and the static part of AC34.
//
// Every run happens in a temporary git repo outside the worktree ("fixture repo"): a stub package.json whose
// typecheck/lint/test/build scripts are small node scripts, `--no-db`, a fake `supabase` on PATH for `status -o env`,
// and a fake `gh` on PATH with canned JSON for bootstrap-check. No real network, Docker or GitHub call.
//
// Secrets: every token-shaped value (JWTs, sb_secret_ keys, status values, shell-exported keys) is generated at run
// time from random bytes and never committed. Literal prefixes are split where a scanner could read them as a key.
//
// Windows: Git Bash is called explicitly (a plain `bash` may be WSL). verify.sh writes fixed /tmp/verify-<script>.log
// files; Git Bash's /tmp is the user's Windows temp dir (resolved once below), shared by concurrent runs. AC6 searches
// those logs plus the run's own TMPDIR (build marker). The fixtures' npm scripts never print values, so sharing is safe.
// Speed: a fake `npm` on PATH runs `npm run <script>` straight from package.json (real npm costs ~1-2 s per call on
// Windows); verify.sh itself is unchanged and still decides which scripts exist via node.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { afterAll, describe, type ExpectStatic, it } from "vitest";

const ROOT = process.cwd();
const BASH =
  process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe") : "bash";
const posix = (p: string) => p.split("\\").join("/");
const VERIFY = posix(join(ROOT, "scripts", "verify.sh"));
const BOOTSTRAP = posix(join(ROOT, "scripts", "bootstrap-check.sh"));
const RUN_TIMEOUT = 170_000;
/** Git Bash's /tmp as a native path (verify.sh's fixed log dir). */
const BASH_TMP =
  process.platform === "win32" ? spawnSync(BASH, ["-c", "cygpath -w /tmp"], { encoding: "utf8" }).stdout.trim() : "/tmp";
const TEST_TIMEOUT = 180_000;

// ---------- temp dirs ----------
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
function writeFiles(dir: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}
function writeExecutable(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

// ---------- env ----------
const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const SHELL_SECRET_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
] as const;

/** process.env without anything that changes verify.sh's behaviour, plus a per-run TEMP and an optional PATH. */
function cleanEnv(tmp: string, path: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) {
    const u = k.toUpperCase();
    if (["CI", "GITHUB_HEAD_REF", "DESTRUCTIVE_APPROVED", ...SHELL_SECRET_VARS].includes(u)) delete env[k];
    if (u === "TEMP" || u === "TMP" || u === "TMPDIR") delete env[k];
  }
  env[PATH_KEY] = path;
  env.TEMP = tmp;
  env.TMP = tmp;
  env.TMPDIR = posix(tmp);
  return { ...env, ...extra };
}

type Run = { code: number | null; stdout: string; stderr: string };

function runBash(script: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(BASH, [script, ...args], { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: stdout.replace(/\r\n/g, "\n"), stderr: stderr.replace(/\r\n/g, "\n") });
    });
  });
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync(
    "git",
    ["-c", "user.name=qa-test", "-c", "user.email=qa-test@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

/** A git repo with `committed` on main, then a task branch, then `files` written uncommitted. */
function makeRepo(committed: Record<string, string>, files: Record<string, string> = {}): string {
  const dir = tempDir("qa4d-repo-");
  writeFiles(dir, committed);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  git(dir, "checkout", "-q", "-b", "test/qa4d-fixture");
  writeFiles(dir, files);
  return dir;
}

// ---------- output helpers ----------
const outLines = (s: string) => s.split("\n");
const RESULT_RE = /^ {2}(PASS|FAIL|SKIP|RISK) {2}/;
const resultLines = (s: string) => outLines(s).filter((l) => RESULT_RE.test(l));
const summary = (s: string) => outLines(s).filter((l) => l.trim() !== "").pop() ?? "";
/** Indented detail lines printed under a result line (8 spaces), without the indent. */
function detailOf(s: string, line: string): string[] {
  const ls = outLines(s);
  const i = ls.indexOf(line);
  if (i < 0) return [];
  const out: string[] = [];
  for (let k = i + 1; k < ls.length && ls[k].startsWith("        "); k++) out.push(ls[k].slice(8));
  return out;
}
/** The summary's failed list, as text (names may themselves contain ", "). */
function failedList(s: string): string {
  const m = /^verify\.sh: FAIL \d+\/\d+ failed: (.*) \(\d+ skipped\)$/.exec(summary(s));
  return m ? `, ${m[1]}, ` : "";
}
/** Result lines of one `[section]`. */
function section(s: string, name: string): string[] {
  const ls = outLines(s);
  const i = ls.indexOf(`[${name}]`);
  if (i < 0) return [];
  const out: string[] = [];
  for (let k = i + 1; k < ls.length && !/^\[.*\]$/.test(ls[k]) && ls[k] !== ""; k++) out.push(ls[k]);
  return out;
}

// ---------- fake values (generated at run time, never committed) ----------
const rnd = (bytes: number) => randomBytes(bytes).toString("base64url");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");
const b64url = (s: string) => Buffer.from(s).toString("base64url");
const SB_SECRET = "sb_" + "secret_";
const SB_PUBLISHABLE = "sb_" + "publishable_";

/** JWT-shaped token: header.payload.signature, payload with the given role, random signature (any key). */
function fakeJwt(role: string, payloadJson?: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(payloadJson ?? JSON.stringify({ iss: "supabase-demo", role, exp: 1983812996 }));
  return `${header}.${payload}.${rnd(32)}`;
}
const fakeSecretKey = (bodyLen = 31) => SB_SECRET + rnd(48).replace(/[^A-Za-z0-9_-]/g, "").slice(0, bodyLen);

type Status = Record<string, string>;
function fakeStatus(): Status {
  return {
    ANON_KEY: fakeJwt("anon"),
    API_URL: "http://127.0.0.1:54321",
    DB_URL: `postgresql://postgres:${hex(12)}@127.0.0.1:54322/postgres`,
    FUNCTIONS_URL: "http://127.0.0.1:54321/functions/v1",
    GRAPHQL_URL: "http://127.0.0.1:54321/graphql/v1",
    JWT_SECRET: rnd(30),
    MAILPIT_URL: "http://127.0.0.1:54324",
    MCP_URL: "http://127.0.0.1:54321/mcp",
    PUBLISHABLE_KEY: SB_PUBLISHABLE + rnd(22),
    REST_URL: "http://127.0.0.1:54321/rest/v1",
    S3_PROTOCOL_ACCESS_KEY_ID: hex(16),
    S3_PROTOCOL_ACCESS_KEY_SECRET: hex(32),
    S3_PROTOCOL_REGION: "local",
    SECRET_KEY: fakeSecretKey(31),
    SERVICE_ROLE_KEY: fakeJwt("service_role"),
    STORAGE_S3_URL: "http://127.0.0.1:54321/storage/v1/s3",
    STUDIO_URL: "http://127.0.0.1:54323",
  };
}
const statusText = (s: Status, eol = "\n") =>
  Object.entries(s)
    .map(([k, v]) => `${k}="${v}"`)
    .join(eol) + eol;
const SERVER_NAMES = ["SERVICE_ROLE_KEY", "SECRET_KEY", "JWT_SECRET", "DB_URL", "S3_PROTOCOL_ACCESS_KEY_SECRET"] as const;

/** Client code holding only public values, as a real Next.js chunk does. */
const publicJs = (s: Status) =>
  `self.__cfg={url:"${s.API_URL}",anon:"${s.ANON_KEY}",pk:"${s.PUBLISHABLE_KEY}"};\n`;

const APP = ".next/static/chunks/app.js";

// ---------- verify.sh fixture ----------
type BuildMode = "write" | "write-old-mtime" | "none" | "empty" | "fail" | "missing";
interface VerifyOpts {
  /** Files the build writes (repo-relative path -> content). The content lives outside the repo until the build. */
  bundle?: Record<string, string>;
  build?: BuildMode;
  /** Files present before the run (gitignored), e.g. a stale .next/static from an earlier build. */
  stale?: Record<string, string>;
  /** Fake `supabase status -o env` output: an object, raw text, or null (status exits 1: stack not running). */
  status?: Status | string | null;
  env?: Record<string, string>;
  ci?: boolean;
  /** package.json scripts.test; null removes it. Default `node noop.js`. */
  testScript?: string | null;
  /** No package.json at all (migration-only runs). */
  noPackageJson?: boolean;
  committed?: Record<string, string>;
  /** Uncommitted files on the task branch (new migrations, test files). */
  files?: Record<string, string>;
}
interface VerifyRun extends Run {
  repo: string;
  tmp: string;
  stubCalls: () => string[];
}

const BRIEF = "# Task qa\n\n## Scope\n\n**Allowed paths**\n\n```\n*\n```\n";

async function verify(o: VerifyOpts = {}): Promise<VerifyRun> {
  const outside = tempDir("qa4d-out-");
  const stub = join(outside, "bin");
  mkdirSync(stub);
  writeExecutable(
    join(stub, "supabase"),
    [
      "#!/usr/bin/env bash",
      'D="$(cd "$(dirname "$0")" && pwd)"',
      'printf \'%s\\n\' "$*" >> "$D/calls.log"',
      'if [ "$*" = "status -o env" ] && [ -f "$D/status.env" ]; then cat "$D/status.env"; exit 0; fi',
      "exit 1",
      "",
    ].join("\n"),
  );
  writeExecutable(
    join(stub, "npm"),
    [
      "#!/usr/bin/env bash",
      '[ "$1" = run ] || { echo "npm stub: only npm run" >&2; exit 97; }',
      `cmd=$(node -e "process.stdout.write(require('./package.json').scripts?.[process.argv[1]] || '')" "$2")`,
      '[ -n "$cmd" ] || { echo "npm stub: missing script $2" >&2; exit 1; }',
      'exec sh -c "$cmd"',
      "",
    ].join("\n"),
  );
  if (o.status !== null && o.status !== undefined) {
    writeFileSync(join(stub, "status.env"), typeof o.status === "string" ? o.status : statusText(o.status));
  }
  const bundleJson = join(outside, "bundle.json");
  writeFileSync(bundleJson, JSON.stringify(o.bundle ?? {}));

  const mode = o.build ?? "write";
  const buildJs = [
    'const fs = require("fs"), path = require("path");',
    `const mode = ${JSON.stringify(mode)};`,
    'if (mode === "fail") { console.log("build failed on purpose"); process.exit(1); }',
    'if (mode === "none") process.exit(0);',
    'if (mode === "empty") { for (const d of [".next/static", "dist", "build"]) fs.mkdirSync(d, { recursive: true }); process.exit(0); }',
    `const files = JSON.parse(fs.readFileSync(${JSON.stringify(bundleJson)}, "utf8"));`,
    "for (const [rel, content] of Object.entries(files)) {",
    "  fs.mkdirSync(path.dirname(rel), { recursive: true });",
    "  fs.writeFileSync(rel, content);",
    '  if (mode === "write-old-mtime") { const t = new Date("2020-01-01T00:00:00Z"); fs.utimesSync(rel, t, t); }',
    "}",
    "",
  ].join("\n");

  const scripts: Record<string, string> = { typecheck: "node noop.js", lint: "node noop.js", test: "node noop.js" };
  if (o.testScript === null) delete scripts.test;
  else if (o.testScript !== undefined) scripts.test = o.testScript;
  if (mode !== "missing") scripts.build = "node build.js";

  const committed: Record<string, string> = {
    ".gitignore": ".next/\ndist/\nbuild/\nnode_modules/\n",
    "qa-brief.md": BRIEF,
    ...(o.noPackageJson
      ? {}
      : {
          "package.json": JSON.stringify({ name: "qa4d-fixture", private: true, scripts }, null, 2) + "\n",
          "noop.js": "\n",
          "build.js": buildJs,
        }),
    ...(o.committed ?? {}),
  };
  const repo = makeRepo(committed, o.files ?? {});
  if (o.stale) writeFiles(repo, o.stale);

  const tmp = tempDir("qa4d-tmp-");
  const env = cleanEnv(tmp, stub + delimiter + (process.env[PATH_KEY] ?? ""), {
    CI: o.ci ? "true" : "false",
    ...(o.env ?? {}),
  });
  const r = await runBash(VERIFY, ["--no-db", "--brief", "qa-brief.md"], repo, env);
  const calls = join(stub, "calls.log");
  return {
    ...r,
    repo,
    tmp,
    stubCalls: () => (existsSync(calls) ? readFileSync(calls, "utf8").split(/\r?\n/).filter(Boolean) : []),
  };
}

const BUNDLE_PASS = "  PASS  client bundle has no server secrets";
const NO_BUNDLE = "  FAIL  client bundle scan (no client bundle from this build)";
const INFO_NO_STACK = "  (local stack not running: client bundle checked for secret patterns only)";
const AC13_LINE = "  FAIL  client bundle has no server secrets (local stack values unavailable, required in CI)";
const leakLine = (names: string) => `  FAIL  server secrets in client bundle: ${names}`;
const bundleResultLines = (s: string) => resultLines(s).filter((l) => /client bundle/.test(l));

type Expect = ExpectStatic;

function expectVerifyPass(expect: Expect, r: Run) {
  expect(r.code, r.stdout).toBe(0);
  expect(summary(r.stdout)).toMatch(/^verify\.sh: PASS (\d+)\/\1 \(\d+ skipped\)$/);
}
/** "verify.sh FAILs": the line is printed, its name is in the summary's failed list, exit 1. */
function expectVerifyFail(expect: Expect, r: Run, line: string) {
  expect(outLines(r.stdout), r.stdout).toContain(line);
  expect(failedList(r.stdout)).toContain(`, ${line.replace(/^ {2}FAIL {2}/, "")}, `);
  expect(r.code).toBe(1);
}

/** All files under dir (relative, forward slashes), skipping the given top-level paths. */
function walk(dir: string, skip: string[] = []): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const rel = posix(relative(dir, p));
      if (skip.some((s) => rel === s || rel.startsWith(s + "/"))) continue;
      if (statSync(p).isDirectory()) rec(p);
      else out.push(p);
    }
  };
  if (existsSync(dir)) rec(dir);
  return out;
}

/** AC6: no value in stdout/stderr, in the run's temp files (verify-*.log) or in the repo working tree. */
function expectNoValues(expect: Expect, r: VerifyRun, values: string[]) {
  const sources: [string, string][] = [
    ["stdout", r.stdout],
    ["stderr", r.stderr],
  ];
  for (const f of walk(r.tmp)) sources.push([f, readFileSync(f, "latin1")]);
  for (const n of readdirSync(BASH_TMP).filter((n) => n.startsWith("verify-"))) {
    const p = join(BASH_TMP, n);
    if (statSync(p).isFile()) sources.push([p, readFileSync(p, "latin1")]);
  }
  // The fixture's own build wrote the bundle (that is the leak under test); everything else must be clean.
  for (const f of walk(r.repo, [".git", ".next/static", "dist", "build"])) sources.push([f, readFileSync(f, "latin1")]);
  for (const v of values) {
    expect(v.length).toBeGreaterThanOrEqual(8);
    for (const [where, text] of sources) expect(text.includes(v), `value found in ${where}`).toBe(false);
  }
}

// =====================================================================================================
// A. Client-bundle secret scan (L27)
// =====================================================================================================
describe.concurrent("verify.sh client-bundle scan (AC1-AC13)", { timeout: TEST_TIMEOUT }, () => {
  it("AC1: bundle line moved from [secrets] to [project], exactly once, right after the build line", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s) } });
    expect(section(r.stdout, "secrets").some((l) => /client bundle/.test(l))).toBe(false);
    expect(section(r.stdout, "secrets").filter((l) => RESULT_RE.test(l))).toContain(
      "  PASS  no service-role key referenced in client components",
    );
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expect(section(r.stdout, "project")).toEqual([
      "  PASS  npm run typecheck",
      "  PASS  npm run lint",
      "  PASS  test script has no --passWithNoTests",
      "  PASS  npm run test",
      "  SKIP  test:e2e (no script)",
      "  PASS  npm run build",
      BUNDLE_PASS,
    ]);
    // sections keep their order; the bundle line is the last result before the summary
    expect(outLines(r.stdout).filter((l) => /^\[.*\]$/.test(l))).toEqual(["[scope]", "[secrets]", "[code safety]", "[project]"]);
    expect(resultLines(r.stdout).pop()).toBe(BUNDLE_PASS);
    expectVerifyPass(expect, r);
  });

  it("AC2: clean tree, build writes .next/static with public values only, stack running -> PASS, exit 0", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s), ".next/static/css/app.css": "body{}\n" } });
    expect(existsSync(join(r.repo, ".next"))).toBe(true);
    expect(outLines(r.stdout)).toContain(BUNDLE_PASS);
    expect(r.stdout).not.toContain(INFO_NO_STACK);
    expectVerifyPass(expect, r);
    // status is read once, by verify.sh itself, after the build
    expect(r.stubCalls()).toEqual(["status -o env"]);
  });

  it("AC3: build exits 0 but writes no bundle -> FAIL no client bundle, exit 1, no PASS/SKIP bundle line", async ({ expect }) => {
    const r = await verify({ status: fakeStatus(), build: "none" });
    expect(bundleResultLines(r.stdout)).toEqual([NO_BUNDLE]);
    expectVerifyFail(expect, r, NO_BUNDLE);
  });

  it("AC3: build writes only empty .next/static, dist and build dirs -> FAIL no client bundle", async ({ expect }) => {
    const r = await verify({ status: fakeStatus(), build: "empty" });
    expect(bundleResultLines(r.stdout)).toEqual([NO_BUNDLE]);
    expectVerifyFail(expect, r, NO_BUNDLE);
  });

  it("AC3: a stale bundle from an earlier run and a build that writes nothing -> FAIL (stale files don't count)", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, build: "none", stale: { [APP]: publicJs(s) } });
    expect(bundleResultLines(r.stdout)).toEqual([NO_BUNDLE]);
    expectVerifyFail(expect, r, NO_BUNDLE);
  });

  it("AC4: build exits non-zero on a clean tree -> FAIL npm run build and FAIL no client bundle", async ({ expect }) => {
    const r = await verify({ status: fakeStatus(), build: "fail" });
    expectVerifyFail(expect, r, "  FAIL  npm run build");
    expect(bundleResultLines(r.stdout)).toEqual([NO_BUNDLE]);
    expectVerifyFail(expect, r, NO_BUNDLE);
  });

  it("AC4: build fails with a stale .next/static holding a leak -> the stale bundle is not scanned or passed", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, build: "fail", stale: { [APP]: publicJs(s) + `x="${fakeSecretKey()}";\n` } });
    expectVerifyFail(expect, r, "  FAIL  npm run build");
    expect(bundleResultLines(r.stdout)).toEqual([NO_BUNDLE]);
    expect(r.stdout).not.toContain("server secrets in client bundle");
    expect(r.stubCalls()).toEqual([]); // no status read: nothing is scanned
    expectVerifyFail(expect, r, NO_BUNDLE);
  });

  it("AC4: build script missing -> existing 'script build missing' FAIL, then FAIL no client bundle", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, build: "missing", stale: { [APP]: publicJs(s) } });
    const rl = resultLines(r.stdout);
    const i = rl.indexOf("  FAIL  script 'build' missing from package.json");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(rl[i + 1]).toBe(NO_BUNDLE);
    expect(bundleResultLines(r.stdout)).toEqual([NO_BUNDLE]);
    expectVerifyFail(expect, r, NO_BUNDLE);
  });

  it("L4d.2: clean tree, build writes files with an old mtime (like a copy) -> counts as this build's bundle", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, build: "write-old-mtime", bundle: { [APP]: publicJs(s) } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expectVerifyPass(expect, r);
  });

  it("L4d.2: stale bundle, build rewrites the same files (new mtime) -> scanned, PASS", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, stale: { [APP]: "old\n" }, bundle: { [APP]: publicJs(s) } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expectVerifyPass(expect, r);
  });

  it("L4d.2: stale bundle, build adds a new file with an old mtime (file list changed) -> scanned", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({
      status: s,
      build: "write-old-mtime",
      stale: { [APP]: publicJs(s) },
      bundle: { ".next/static/chunks/new.js": `k="${s.SECRET_KEY}";\n` },
    });
    expectVerifyFail(expect, r, leakLine("SECRET_KEY"));
  });

  for (const name of SERVER_NAMES) {
    it(`AC5: bundle holds the local ${name} value -> FAIL server secrets in client bundle: ${name}`, async ({ expect }) => {
      const s = fakeStatus();
      const r = await verify({ status: s, bundle: { [APP]: publicJs(s) + `var leak="${s[name]}";\n` } });
      expect(bundleResultLines(r.stdout)).toEqual([leakLine(name)]);
      expectVerifyFail(expect, r, leakLine(name));
      expect(detailOf(r.stdout, leakLine(name))).toEqual([`${name}: ${APP}`, "Only NEXT_PUBLIC_* values may reach the client."]);
      expectNoValues(expect, r, SERVER_NAMES.map((n) => s[n]));
    });
  }

  it("AC5: several leaks -> names in contract order, one detail line per name with its file(s)", async ({ expect }) => {
    const s = fakeStatus();
    const openai = rnd(24);
    const r = await verify({
      status: s,
      env: { OPENAI_API_KEY: openai },
      bundle: {
        [APP]: publicJs(s) + `a="${s.DB_URL}";b="${s.JWT_SECRET}";\n`,
        ".next/static/chunks/b.js": `c="${openai}";d="${"sk_" + "live_" + rnd(12)}";\n`,
        ".next/static/chunks/c.js": `e="${fakeSecretKey()}";f="${fakeJwt("service_role")}";\n`,
      },
    });
    const line = leakLine(
      "OPENAI_API_KEY JWT_SECRET DB_URL stripe-secret-pattern sb-secret-key-pattern service-role-jwt-pattern",
    );
    expectVerifyFail(expect, r, line);
    expect(detailOf(r.stdout, line)).toEqual([
      "OPENAI_API_KEY: .next/static/chunks/b.js",
      `JWT_SECRET: ${APP}`,
      `DB_URL: ${APP}`,
      "stripe-secret-pattern: .next/static/chunks/b.js",
      "sb-secret-key-pattern: .next/static/chunks/c.js",
      "service-role-jwt-pattern: .next/static/chunks/c.js",
      "Only NEXT_PUBLIC_* values may reach the client.",
    ]);
    expectNoValues(expect, r, [...SERVER_NAMES.map((n) => s[n]), openai]);
  });

  it("AC5: status output with CRLF line endings still yields the values", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: statusText(s, "\r\n"), bundle: { [APP]: publicJs(s) + `x="${s.JWT_SECRET}";\n` } });
    expectVerifyFail(expect, r, leakLine("JWT_SECRET"));
  });

  it("AC5: status output without quotes around values still yields the values", async ({ expect }) => {
    const s = fakeStatus();
    const raw = Object.entries(s).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
    const r = await verify({ status: raw, bundle: { [APP]: publicJs(s) + `x="${s.S3_PROTOCOL_ACCESS_KEY_SECRET}";\n` } });
    expectVerifyFail(expect, r, leakLine("S3_PROTOCOL_ACCESS_KEY_SECRET"));
  });

  it("decision: status values shorter than 8 characters are not compared; 8 characters are", async ({ expect }) => {
    const s7 = { ...fakeStatus(), JWT_SECRET: hex(4).slice(0, 7) };
    const r7 = await verify({ status: s7, bundle: { [APP]: publicJs(s7) + `x="${s7.JWT_SECRET}";\n` } });
    expect(bundleResultLines(r7.stdout)).toEqual([BUNDLE_PASS]);
    const s8 = { ...fakeStatus(), JWT_SECRET: hex(4) };
    const r8 = await verify({ status: s8, bundle: { [APP]: publicJs(s8) + `x="${s8.JWT_SECRET}";\n` } });
    expectVerifyFail(expect, r8, leakLine("JWT_SECRET"));
  });

  it("AC6: failing run with all five server values in the bundle -> no value in output, logs or working tree", async ({ expect }) => {
    const s = fakeStatus();
    const leak = SERVER_NAMES.map((n, i) => `v${i}="${s[n]}";`).join("") + "\n";
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s) + leak } });
    expectVerifyFail(expect, r, leakLine(SERVER_NAMES.join(" ")));
    expect(existsSync(join(BASH_TMP, "verify-build.log"))).toBe(true); // the logs AC6 searches are where verify.sh writes
    expectNoValues(expect, r, SERVER_NAMES.map((n) => s[n]));
    // no build marker left behind
    expect(walk(r.tmp).filter((f) => /verify-build-mark/.test(f))).toEqual([]);
  });

  it("AC6: passing run -> no server value in output, logs or working tree", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s) } });
    expectVerifyPass(expect, r);
    expectNoValues(expect, r, SERVER_NAMES.map((n) => s[n]));
  });

  it("AC7: ANON_KEY, PUBLISHABLE_KEY, API_URL and the other URLs in the bundle are public -> PASS", async ({ expect }) => {
    const s = fakeStatus();
    const pub = ["ANON_KEY", "PUBLISHABLE_KEY", "API_URL", "FUNCTIONS_URL", "GRAPHQL_URL", "REST_URL", "STORAGE_S3_URL", "STUDIO_URL", "MAILPIT_URL", "MCP_URL", "S3_PROTOCOL_REGION"];
    const r = await verify({ status: s, bundle: { [APP]: pub.map((n, i) => `p${i}="${s[n]}";`).join("") + "\n" } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expectVerifyPass(expect, r);
  });

  it("AC8: stack not running, bundle holds sb_secret_ + 20 chars -> FAIL sb-secret-key-pattern", async ({ expect }) => {
    const r = await verify({ status: null, bundle: { [APP]: `k="${fakeSecretKey(20)}";\n` } });
    expectVerifyFail(expect, r, leakLine("sb-secret-key-pattern"));
    expect(detailOf(r.stdout, leakLine("sb-secret-key-pattern"))[0]).toBe(`sb-secret-key-pattern: ${APP}`);
  });

  it("AC8: stack running, an sb_secret_ key that matches no local value -> FAIL sb-secret-key-pattern", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s) + `k="${fakeSecretKey(40)}";\n` } });
    expectVerifyFail(expect, r, leakLine("sb-secret-key-pattern"));
  });

  it("AC9: service-role JWT signed with another key, stack running -> FAIL service-role-jwt-pattern", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s) + `t="${fakeJwt("service_role")}";\n` } });
    expectVerifyFail(expect, r, leakLine("service-role-jwt-pattern"));
  });

  it("AC9: service-role JWT, stack not running -> FAIL service-role-jwt-pattern", async ({ expect }) => {
    const r = await verify({ status: null, bundle: { [APP]: `t="${fakeJwt("service_role")}";\n` } });
    expectVerifyFail(expect, r, leakLine("service-role-jwt-pattern"));
  });

  it("AC9: payload with whitespace (\"role\": \"service_role\") is still found", async ({ expect }) => {
    const tok = fakeJwt("", '{"iss":"supabase-demo", "role": "service_role", "exp":1983812996}');
    const r = await verify({ status: null, bundle: { [APP]: `t="${tok}";\n` } });
    expectVerifyFail(expect, r, leakLine("service-role-jwt-pattern"));
  });

  it("AC10: bare sb_secret_ prefix (library code), anon JWTs and the word service_role -> PASS", async ({ expect }) => {
    const s = fakeStatus();
    const js =
      publicJs(s) +
      "function f(e){return e.startsWith(`" + SB_SECRET + "`)}\n" +
      `var hint="${SB_SECRET}\u2026";\n` +
      `var short="${fakeSecretKey(19)}";\n` + // 19 chars: below the pattern's minimum
      `var otherAnon="${fakeJwt("anon")}";\n` +
      'var r="service_role";if(x.role==="service_role"){}\n';
    const r = await verify({ status: s, bundle: { [APP]: js } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expectVerifyPass(expect, r);
  });

  it("AC10: the same false positives with the stack not running -> info line and PASS", async ({ expect }) => {
    const js =
      "function f(e){return e.startsWith(`" + SB_SECRET + "`)}\n" +
      `var anon="${fakeJwt("anon")}";var r="service_role";\n`;
    const r = await verify({ status: null, bundle: { [APP]: js } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expectVerifyPass(expect, r);
  });

  for (const name of SHELL_SECRET_VARS) {
    it(`AC11: shell-exported ${name} (16+ chars) in the bundle -> FAIL ${name}`, async ({ expect }) => {
      const s = fakeStatus();
      const val = rnd(18);
      const r = await verify({ status: s, env: { [name]: val }, bundle: { [APP]: publicJs(s) + `x="${val}";\n` } });
      expectVerifyFail(expect, r, leakLine(name));
      expectNoValues(expect, r, [val]);
    });
  }

  it("AC11: shell-exported value shorter than 16 chars is not compared (today's minimum)", async ({ expect }) => {
    const s = fakeStatus();
    const val = hex(8).slice(0, 15);
    const r = await verify({ status: s, env: { STRIPE_SECRET_KEY: val }, bundle: { [APP]: publicJs(s) + `x="${val}";\n` } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
  });

  for (const prefix of ["live", "test"]) {
    it(`AC11: sk_${prefix}_ in the bundle -> FAIL stripe-secret-pattern`, async ({ expect }) => {
      const s = fakeStatus();
      const r = await verify({ status: s, bundle: { [APP]: publicJs(s) + `x="${"sk_" + prefix + "_" + rnd(12)}";\n` } });
      expectVerifyFail(expect, r, leakLine("stripe-secret-pattern"));
    });
  }

  it("AC11: dist/ is scanned alongside .next/static", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { [APP]: publicJs(s), "dist/assets/index.js": `x="${s.SECRET_KEY}";\n` } });
    expectVerifyFail(expect, r, leakLine("SECRET_KEY"));
    expect(detailOf(r.stdout, leakLine("SECRET_KEY"))[0]).toBe("SECRET_KEY: dist/assets/index.js");
  });

  it("AC11: build/ alone is a client bundle and is scanned", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: s, bundle: { "build/static/js/main.js": `x="${s.SERVICE_ROLE_KEY}";\n` } });
    expectVerifyFail(expect, r, leakLine("SERVICE_ROLE_KEY"));
    expect(detailOf(r.stdout, leakLine("SERVICE_ROLE_KEY"))[0]).toBe("SERVICE_ROLE_KEY: build/static/js/main.js");
  });

  it("AC12: stack not running, CI not true, clean bundle -> info line (not counted) then PASS", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ status: null, bundle: { [APP]: publicJs(s) } });
    const ls = outLines(r.stdout);
    const i = ls.indexOf(INFO_NO_STACK);
    expect(i, r.stdout).toBeGreaterThanOrEqual(0);
    expect(ls[i + 1]).toBe(BUNDLE_PASS);
    expect(ls[i - 1]).toBe("  PASS  npm run build");
    expectVerifyPass(expect, r);
    expect(r.stubCalls()).toEqual(["status -o env"]);
  });

  it("AC13: CI=true and status fails -> FAIL (local stack values unavailable, required in CI), exit 1", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ ci: true, status: null, bundle: { [APP]: publicJs(s) } });
    expect(bundleResultLines(r.stdout)).toEqual([AC13_LINE]);
    expect(r.stdout).not.toContain(INFO_NO_STACK);
    expectVerifyFail(expect, r, AC13_LINE);
  });

  it("AC13: CI=true and status reports no SERVICE_ROLE_KEY -> same FAIL", async ({ expect }) => {
    const s = fakeStatus();
    const noSrk: Status = { ...s };
    delete noSrk.SERVICE_ROLE_KEY;
    const r = await verify({ ci: true, status: noSrk, bundle: { [APP]: publicJs(s) } });
    expect(bundleResultLines(r.stdout)).toEqual([AC13_LINE]);
    expectVerifyFail(expect, r, AC13_LINE);
  });

  it("AC13: CI=true, no local values and a pattern leak -> one leak FAIL with the 'required in CI' detail", async ({ expect }) => {
    const r = await verify({ ci: true, status: null, bundle: { [APP]: `k="${fakeSecretKey()}";\n` } });
    expect(bundleResultLines(r.stdout)).toEqual([leakLine("sb-secret-key-pattern")]);
    expect(detailOf(r.stdout, leakLine("sb-secret-key-pattern"))[0]).toBe("local stack values unavailable (required in CI)");
    expectVerifyFail(expect, r, leakLine("sb-secret-key-pattern"));
  });

  it("AC13: CI=true with the stack running and a clean bundle -> PASS bundle line, no info line", async ({ expect }) => {
    const s = fakeStatus();
    const r = await verify({ ci: true, status: s, bundle: { [APP]: publicJs(s) } });
    expect(bundleResultLines(r.stdout)).toEqual([BUNDLE_PASS]);
    expect(r.stdout).not.toContain(INFO_NO_STACK);
  });
});

// =====================================================================================================
// B. Destructive-statement scan (L15)
// =====================================================================================================
const MIG = "supabase/migrations/20261125000001_qa_change.sql";
const BASE_MIG = {
  "supabase/migrations/20261125000000_base.sql":
    "create table public.t (id int);\nalter table public.t enable row level security;\n",
};
const DESTR_PASS = "  PASS  no destructive statements in new migrations";
const DESTR_FAIL = "  FAIL  destructive statements need approval";
const DESTR_APPROVED = "  PASS  destructive statements approved (destructive-approved label)";

function migrationRun(sql: string, env: Record<string, string> = {}, extra: Record<string, string> = {}) {
  return verify({ noPackageJson: true, committed: BASE_MIG, files: { [MIG]: sql, ...extra }, env });
}
/** The "<n>:<line>" hit lines under the FAIL, for the qa migration. */
function hits(s: string): string[] {
  return detailOf(s, DESTR_FAIL).filter((l) => /^\d+:/.test(l));
}

describe.concurrent("verify.sh destructive scan (AC14-AC19)", { timeout: TEST_TIMEOUT }, () => {
  it("AC14: REVOKE/GRANT privilege lists with TRUNCATE (lower and upper case, multi-line REVOKE ALL) -> PASS", async ({ expect }) => {
    const sql = [
      "revoke truncate on table public.t from anon;",
      "grant select, insert, update, delete, truncate, references, trigger on public.t to authenticated;",
      "REVOKE TRUNCATE ON TABLE public.t FROM anon;",
      "GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.t TO authenticated;",
      "REVOKE ALL",
      "  ON ALL TABLES IN SCHEMA public",
      "  FROM anon, authenticated;",
      "revoke all",
      "  on all tables in schema public",
      "  from anon, authenticated;",
      "",
    ].join("\n");
    const r = await migrationRun(sql);
    expect(section(r.stdout, "migrations")).toContain(DESTR_PASS);
    expectVerifyPass(expect, r);
  });

  it("decision: ALTER DEFAULT PRIVILEGES ... GRANT/REVOKE ... TRUNCATE is a privilege statement -> PASS", async ({ expect }) => {
    const sql = [
      'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";',
      'alter default privileges in schema public revoke truncate on tables from authenticated;',
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public",
      "  REVOKE MAINTAIN, TRUNCATE ON TABLES FROM anon;",
      "",
    ].join("\n");
    const r = await migrationRun(sql);
    expect(section(r.stdout, "migrations")).toContain(DESTR_PASS);
    expectVerifyPass(expect, r);
  });

  it("L15 regression: this repo's default-privileges migration, as a new migration -> PASS", async ({ expect }) => {
    const real = readFileSync(join(ROOT, "supabase/migrations/20261125135502_default_privileges_baseline.sql"), "utf8");
    const r = await migrationRun(real);
    expect(section(r.stdout, "migrations")).toContain(DESTR_PASS);
  });

  it("AC15: destructive words only in -- and /* */ comments (incl. a multi-line block) -> PASS", async ({ expect }) => {
    const sql = [
      "-- drop table x",
      "create table t (id int); -- truncate later",
      "alter table t enable row level security;",
      "/* delete from t;",
      "   rename to u */",
      "/* outer /* nested drop table t; */ still a comment: truncate t; */",
      "-- comment before a privilege statement",
      "GRANT TRUNCATE ON t TO authenticated; -- drop table later",
      "",
    ].join("\n");
    const r = await migrationRun(sql);
    expect(section(r.stdout, "migrations")).toContain(DESTR_PASS);
    expectVerifyPass(expect, r);
  });

  const AC16 = [
    "drop table public.t;",
    "DROP TABLE IF EXISTS t;",
    "alter table public.t drop column c;",
    "drop function f();",
    "drop view v;",
    "drop schema s;",
    "drop type ty;",
    "drop policy p on t;",
    "drop trigger tr on t;",
    "truncate public.t;",
    "TRUNCATE TABLE t;",
    "delete from public.t;",
    "alter table t rename to u;",
    "alter table t rename column a to b;",
  ];
  for (const stmt of AC16) {
    it(`AC16: "${stmt}" -> FAIL destructive statements need approval, with file, line number and text`, async ({ expect }) => {
      const r = await migrationRun(`select 1;\n${stmt}\n`);
      expectVerifyFail(expect, r, DESTR_FAIL);
      const d = detailOf(r.stdout, DESTR_FAIL);
      expect(d[0]).toBe(`${MIG}:`);
      expect(hits(r.stdout)).toEqual([`2:${stmt}`]);
    });
  }

  const AC17: [string, string[]][] = [
    ["grant select on t to anon; truncate t;\n", ["1:grant select on t to anon; truncate t;"]],
    ["select 1; -- note\ntruncate t;\n", ["2:truncate t;"]],
    ["select '--'; drop table t;\n", ["1:select '--'; drop table t;"]],
    ["select '/*'; delete from t;\n", ["1:select '/*'; delete from t;"]],
    ["revoke all\n  on t from anon; drop table t;\n", ["2:  on t from anon; drop table t;"]],
    ["/* c */ drop table t;\n", ["1:/* c */ drop table t;"]],
  ];
  for (const [sql, expected] of AC17) {
    it(`AC17: statement after a comment/privilege/string: ${JSON.stringify(sql)} -> FAIL on the right line`, async ({ expect }) => {
      const r = await migrationRun(sql);
      expectVerifyFail(expect, r, DESTR_FAIL);
      expect(hits(r.stdout)).toEqual(expected);
    });
  }

  it("AC18: AC16 migration with DESTRUCTIVE_APPROVED=1 -> PASS approved", async ({ expect }) => {
    const r = await migrationRun("select 1;\ndrop table public.t;\n", { DESTRUCTIVE_APPROVED: "1" });
    expect(section(r.stdout, "migrations")).toContain(DESTR_APPROVED);
    expect(r.stdout).not.toContain(DESTR_FAIL);
    expectVerifyPass(expect, r);
  });

  it("AC19: delete inside a function body is still a hit", async ({ expect }) => {
    const sql = "create function f() returns void language sql as $$ delete from public.t; $$;\n";
    const r = await migrationRun(sql);
    expectVerifyFail(expect, r, DESTR_FAIL);
    expect(hits(r.stdout)).toEqual([`1:${sql.trimEnd()}`]);
  });

  it("AC19: a GRANT inside a function body doesn't exempt the delete after it", async ({ expect }) => {
    const sql = "create function g() returns void language sql as $$\n  grant select on t to anon;\n  delete from t;\n$$;\n";
    const r = await migrationRun(sql);
    expectVerifyFail(expect, r, DESTR_FAIL);
    expect(hits(r.stdout)).toEqual(["3:  delete from t;"]);
  });

  it("AC16: only new migrations are scanned (a committed destructive migration is not reported)", async ({ expect }) => {
    const r = await verify({
      noPackageJson: true,
      committed: { ...BASE_MIG, "supabase/migrations/20261125000002_old.sql": "drop view v;\n" },
      files: { [MIG]: "select 1;\n" },
    });
    expect(section(r.stdout, "migrations")).toContain(DESTR_PASS);
  });
});

// =====================================================================================================
// C. Empty test suite (L5)
// =====================================================================================================
const L5_FAIL = "  FAIL  test script has --passWithNoTests while test files exist";
const L5_PASS = "  PASS  test script has no --passWithNoTests";
const L5_PASS_NONE = "  PASS  test script may use --passWithNoTests (no test files yet)";
const L5_HINT = "Remove --passWithNoTests from package.json#scripts.test (tasks/lessons.md L5).";
const WITH_FLAG = "node noop.js --passWithNoTests";

function l5Run(testScript: string | null | undefined, files: Record<string, string>) {
  const s = fakeStatus();
  return verify({ status: s, bundle: { [APP]: publicJs(s) }, testScript, files });
}
/** The [project] result line right before `npm run test`, and the one before that. */
function aroundTest(s: string): [string | undefined, string | undefined] {
  const rl = resultLines(s);
  const i = rl.indexOf("  PASS  npm run test");
  return [rl[i - 2], rl[i - 1]];
}

describe.concurrent("verify.sh --passWithNoTests check (AC20-AC24)", { timeout: TEST_TIMEOUT }, () => {
  it("AC20: flag + a test file -> FAIL right before npm run test, file and hint as detail, exit 1", async ({ expect }) => {
    const r = await l5Run(WITH_FLAG, {
      "lib/foo.test.ts": "\n",
      "node_modules/pkg/x.test.ts": "\n",
      ".next/cache/y.test.js": "\n",
      "tests/e2e/z.spec.ts": "\n",
      "sub/node_modules/q.spec.js": "\n",
    });
    expect(aroundTest(r.stdout)).toEqual(["  PASS  npm run lint", L5_FAIL]);
    expect(detailOf(r.stdout, L5_FAIL)).toEqual(["lib/foo.test.ts", L5_HINT]);
    expectVerifyFail(expect, r, L5_FAIL);
  });

  for (const [i, ext] of ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"].entries()) {
    const kind = i % 2 === 0 ? "test" : "spec";
    it(`AC20: a *.${kind}.${ext} file counts as a test file`, async ({ expect }) => {
      const f = `src/a.${kind}.${ext}`;
      const r = await l5Run(WITH_FLAG, { [f]: "\n" });
      expect(detailOf(r.stdout, L5_FAIL)).toEqual([f, L5_HINT]);
      expectVerifyFail(expect, r, L5_FAIL);
    });
  }

  it("AC20: many test files -> detail lists at most 5 paths", async ({ expect }) => {
    const files: Record<string, string> = {};
    for (let k = 1; k <= 7; k++) files[`lib/t${k}.test.ts`] = "\n";
    const r = await l5Run(WITH_FLAG, files);
    const d = detailOf(r.stdout, L5_FAIL);
    expect(d.length).toBe(6);
    expect(d.slice(0, 5).every((p) => /^lib\/t\d\.test\.ts$/.test(p))).toBe(true);
    expect(d[5]).toBe(L5_HINT);
    expectVerifyFail(expect, r, L5_FAIL);
  });

  it("AC21: no flag (vitest run style) -> PASS in the same position", async ({ expect }) => {
    const r = await l5Run(undefined, { "lib/foo.test.ts": "\n" });
    expect(aroundTest(r.stdout)).toEqual(["  PASS  npm run lint", L5_PASS]);
    expectVerifyPass(expect, r);
  });

  it("AC21: this repo's package.json test script has no --passWithNoTests", ({ expect }) => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBeTruthy();
    expect(pkg.scripts.test).not.toContain("--passWithNoTests");
  });

  it("AC22: flag and no test files at all -> PASS may use --passWithNoTests", async ({ expect }) => {
    const r = await l5Run(WITH_FLAG, { "lib/foo.ts": "\n", "lib/contest.ts": "\n", "docs/a.test.md": "\n" });
    expect(aroundTest(r.stdout)).toEqual(["  PASS  npm run lint", L5_PASS_NONE]);
    expectVerifyPass(expect, r);
  });

  it("AC22: flag and only tests/e2e/*.spec.ts (and node_modules / .next test files) -> PASS", async ({ expect }) => {
    const r = await l5Run(WITH_FLAG, {
      "tests/e2e/home.spec.ts": "\n",
      "node_modules/pkg/x.test.ts": "\n",
      ".next/server/y.test.js": "\n",
    });
    expect(aroundTest(r.stdout)).toEqual(["  PASS  npm run lint", L5_PASS_NONE]);
    expectVerifyPass(expect, r);
  });

  it("AC23: no test script -> no L5 line, existing 'script test missing' FAIL unchanged", async ({ expect }) => {
    const r = await l5Run(null, { "lib/foo.test.ts": "\n" });
    expect(r.stdout).not.toMatch(/passWithNoTests/);
    expectVerifyFail(expect, r, "  FAIL  script 'test' missing from package.json");
    expect(detailOf(r.stdout, "  FAIL  script 'test' missing from package.json")).toEqual([
      "Add it. verify.sh needs a deterministic test command.",
    ]);
  });

  it("AC24: roles/qa-test.md 'Done when (gate)' has the L5 bullet right after the verify.sh bullet, nothing else", ({ expect }) => {
    const md = readFileSync(join(ROOT, "roles", "qa-test.md"), "utf8").replace(/\r\n/g, "\n");
    const m = /## Done when \(gate\)\n([\s\S]*?)\n## /.exec(md);
    expect(m).not.toBeNull();
    const bullets = m![1].split("\n").filter((l) => l.trim() !== "");
    expect(bullets).toEqual([
      "- Every line in `test-plan.md` has a test, and all pass on the branch.",
      "- Every row marked applicable in the threat model has an abuse test.",
      "- `verify.sh` passes (including `test:e2e`).",
      "- `package.json`'s `test` script has no `--passWithNoTests` once any test file exists (verify.sh FAILs otherwise; tasks/lessons.md L5).",
    ]);
  });
});

// =====================================================================================================
// D. bootstrap-check S19: production Environment and repository secrets
// =====================================================================================================
type GhAnswer = unknown; // object -> JSON; string -> raw stdout; { err } -> stderr + exit 1
interface GhScenario {
  authRc?: number;
  protection?: GhAnswer;
  env?: GhAnswer;
  policies?: GhAnswer;
  secrets?: GhAnswer;
  pretty?: boolean;
}
const err = (msg: string) => ({ err: msg });
const PROTECTION = { url: "x", required_status_checks: { strict: true, contexts: ["verify"] }, required_pull_request_reviews: { required_approving_review_count: 1 } };
const ENV_CUSTOM = { id: 1, name: "production", protection_rules: [], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } };
const policies = (...p: { name: string; type?: string }[]) => ({
  total_count: p.length,
  branch_policies: p.map((x, i) => ({ id: i + 1, node_id: `MDE2${i}`, ...x })),
});
const secretsPage = (...names: string[]) => ({
  total_count: names.length,
  secrets: names.map((name) => ({ name, created_at: "2026-11-25T00:00:00Z", updated_at: "2026-11-25T00:00:00Z" })),
});
const GOOD: GhScenario = {
  protection: PROTECTION,
  env: ENV_CUSTOM,
  policies: policies({ name: "main", type: "branch" }),
  secrets: secretsPage("OTHER_TOKEN"),
};

function bootstrapRepo(extra: Record<string, string> = {}): string {
  const node = process.versions.node;
  const repo = makeRepo({
    ".gitignore": ".env*\n!.env.example\nnode_modules/\n",
    ".gitattributes": "* text=auto eol=lf\n",
    ".github/pull_request_template.md": "## What\n",
    ".github/workflows/ci.yml":
      "on:\n  pull_request:\njobs:\n  verify:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: bash scripts/verify.sh\n      - run: gitleaks detect\n",
    ".nvmrc": `${node}\n`,
    "package.json":
      JSON.stringify(
        {
          name: "qa4d-bootstrap",
          private: true,
          engines: { node },
          packageManager: "npm@11.6.1",
          scripts: { typecheck: "node -v", lint: "node -v", test: "node -v", build: "node -v" },
        },
        null,
        2,
      ) + "\n",
    "package-lock.json": '{\n  "name": "qa4d-bootstrap",\n  "lockfileVersion": 3,\n  "packages": {}\n}\n',
    "PROJECT_CONTEXT.md": "# Project context\n\n- **Hosting type:** Supabase-hosted (cloud)\n",
    "scripts/verify.sh": "#!/usr/bin/env bash\n",
  });
  git(repo, "remote", "add", "origin", "https://example.invalid/qa/fixture.git");
  writeFiles(repo, extra);
  return repo;
}

/** PATH without any gh. Windows: drop dirs holding gh.exe. Elsewhere such a dir is replaced by a symlink farm without gh. */
function pathWithoutGh(): string {
  return (process.env[PATH_KEY] ?? "")
    .split(delimiter)
    .filter(Boolean)
    .flatMap((d) => {
      if (!["gh", "gh.exe", "gh.cmd"].some((n) => existsSync(join(d, n)))) return [d];
      if (process.platform === "win32") return [];
      const farm = tempDir("qa4d-nogh-");
      for (const n of readdirSync(d)) {
        if (n === "gh") continue;
        try {
          symlinkSync(join(d, n), join(farm, n));
        } catch {
          /* unreadable entry: skip */
        }
      }
      return [farm];
    })
    .join(delimiter);
}

async function bootstrap(sc: GhScenario | "no-gh", args: string[] = [], files: Record<string, string> = {}) {
  const repo = bootstrapRepo(files);
  const tmp = tempDir("qa4d-tmp-");
  const stub = join(tempDir("qa4d-gh-"), "bin");
  mkdirSync(stub);
  let path: string;
  if (sc === "no-gh") {
    path = pathWithoutGh();
  } else {
    writeExecutable(
      join(stub, "gh"),
      [
        "#!/usr/bin/env bash",
        'D="$(cd "$(dirname "$0")" && pwd)"',
        'printf \'%s\\n\' "$*" >> "$D/calls.log"',
        'if [ "$1" = auth ]; then exit "$(cat "$D/auth.rc" 2>/dev/null || echo 0)"; fi',
        '[ "$1" = api ] || { echo "gh stub: unexpected call" >&2; exit 98; }',
        'case "$*" in',
        "  *deployment-branch-policies*) k=policies ;;",
        "  *environments/production*) k=env ;;",
        "  *actions/secrets*) k=secrets ;;",
        "  *branches/main/protection*) k=protection ;;",
        '  *) echo "gh stub: unexpected api path" >&2; exit 98 ;;',
        "esac",
        'if [ -f "$D/$k.err" ]; then cat "$D/$k.err" >&2; exit 1; fi',
        '[ -f "$D/$k.out" ] || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }',
        'cat "$D/$k.out"',
        "",
      ].join("\n"),
    );
    if (sc.authRc !== undefined) writeFileSync(join(stub, "auth.rc"), String(sc.authRc));
    for (const k of ["protection", "env", "policies", "secrets"] as const) {
      const a = sc[k];
      if (a === undefined) continue;
      if (typeof a === "object" && a !== null && "err" in a) writeFileSync(join(stub, `${k}.err`), (a as { err: string }).err + "\n");
      else writeFileSync(join(stub, `${k}.out`), typeof a === "string" ? a : JSON.stringify(a, null, sc.pretty ? 2 : 0) + "\n");
    }
    path = stub + delimiter + (process.env[PATH_KEY] ?? "");
  }
  const r = await runBash(BOOTSTRAP, args, repo, cleanEnv(tmp, path));
  const calls = join(stub, "calls.log");
  return { ...r, repo, calls: existsSync(calls) ? readFileSync(calls, "utf8").split(/\r?\n/).filter(Boolean) : [] };
}

const ENV_PASS = "  PASS  GitHub Environment production exists";
const ENV_FAIL = "  FAIL  GitHub Environment production exists";
const POL_PASS = "  PASS  production deploys only from main (deployment branch policy)";
const POL_FAIL = "  FAIL  production deploys only from main (deployment branch policy)";
const SEC_PASS = "  PASS  no repository-level SUPABASE_* secrets";
const SEC_FAIL = "  FAIL  no repository-level SUPABASE_* secrets";
const BP_GH_FAIL = "  FAIL  branch protection on main (gh CLI missing or not signed in, so it can't be verified)";
const S19_GH_FAIL =
  "  FAIL  production environment and repo secrets (gh CLI missing or not signed in, so they can't be verified)";
const fixOf = (s: string, line: string) => detailOf(s, line).filter((l) => l.startsWith("fix: "));
const BOOT_FAIL_RE = /^bootstrap-check: FAIL (\d+) of \d+ checks failed \(\d+ skipped\)\. Phase 0 is not complete: /;
function expectBootFail(expect: Expect, r: Run, failCount: number) {
  expect(r.code, r.stdout).toBe(1);
  expect(BOOT_FAIL_RE.exec(summary(r.stdout))?.[1], r.stdout).toBe(String(failCount));
}
/** S19 calls are read-only: --method GET, never another method or a request body. */
function expectReadOnly(expect: Expect, calls: string[]) {
  for (const c of calls.filter((c) => c.startsWith("api ") && !c.includes("branches/main/protection"))) {
    expect(c).toMatch(/^api --method GET /);
  }
  for (const c of calls) expect(c).not.toMatch(/--method (POST|PUT|PATCH|DELETE)|(^| )-X |(^| )-[fF] |--field|--raw-field|--input/);
}

/** AC27 cases a-e (also reused by AC35 with the decision open). */
const AC27: [string, GhScenario][] = [
  ["(a) deployment_branch_policy null (all branches)", { ...GOOD, env: { ...ENV_CUSTOM, deployment_branch_policy: null } }],
  ["(a) no deployment_branch_policy key", { ...GOOD, env: { id: 1, name: "production" } }],
  ["(b) protected_branches: true", { ...GOOD, env: { ...ENV_CUSTOM, deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } } }],
  ["(c) custom policies main plus another", { ...GOOD, policies: policies({ name: "main", type: "branch" }, { name: "release", type: "branch" }) }],
  ["(d) single pattern *", { ...GOOD, policies: policies({ name: "*", type: "branch" }) }],
  ["(d) single pattern ma*", { ...GOOD, policies: policies({ name: "ma*", type: "branch" }) }],
  ["(e) single policy of type tag named main", { ...GOOD, policies: policies({ name: "main", type: "tag" }) }],
  ["(e) policy without an explicit type", { ...GOOD, policies: policies({ name: "main" }) }],
  ["no policies at all", { ...GOOD, policies: policies() }],
];

describe.concurrent("bootstrap-check S19 (AC25-AC31)", { timeout: TEST_TIMEOUT }, () => {
  for (const pretty of [false, true]) {
    it(`AC25: environment main-only and no SUPABASE_* repo secret -> three PASS lines, exit 0 (${pretty ? "pretty" : "compact"} JSON)`, async ({ expect }) => {
      const r = await bootstrap({ ...GOOD, pretty });
      const gh = section(r.stdout, "github");
      expect(gh).toEqual([
        "  PASS  main requires PR review",
        "  PASS  main requires status checks",
        ENV_PASS,
        POL_PASS,
        SEC_PASS,
      ]);
      expect(r.code, r.stdout).toBe(0);
      expect(summary(r.stdout)).toMatch(/^bootstrap-check: PASS (\d+)\/\1 \(0 skipped\)$/);
      expect(r.calls).toContain("api --method GET repos/{owner}/{repo}/environments/production");
      expect(r.calls).toContain(
        "api --method GET repos/{owner}/{repo}/environments/production/deployment-branch-policies?per_page=100",
      );
      expect(r.calls).toContain("api --method GET --paginate repos/{owner}/{repo}/actions/secrets?per_page=100");
      expectReadOnly(expect, r.calls);
    });
  }

  it("AC26: environments/production returns 404 -> FAIL environment (with fix) and FAIL policy, exit 1", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, env: err("gh: Not Found (HTTP 404)") });
    expect(outLines(r.stdout)).toContain(ENV_FAIL);
    expect(fixOf(r.stdout, ENV_FAIL)).toEqual([
      "fix: Settings > Environments: create production, deployment branches: selected branches, main only",
    ]);
    expect(outLines(r.stdout)).toContain(POL_FAIL);
    expect(fixOf(r.stdout, POL_FAIL).length).toBe(1);
    expect(outLines(r.stdout)).toContain(SEC_PASS);
    expect(r.calls.some((c) => c.includes("deployment-branch-policies"))).toBe(false);
    expectBootFail(expect, r, 2);
  });

  for (const [label, sc] of AC27) {
    it(`AC27: ${label} -> FAIL production deploys only from main, with fix, exit 1`, async ({ expect }) => {
      const r = await bootstrap(sc);
      expect(outLines(r.stdout)).toContain(ENV_PASS);
      expect(outLines(r.stdout), r.stdout).toContain(POL_FAIL);
      expect(fixOf(r.stdout, POL_FAIL).length).toBe(1);
      expect(r.stdout).not.toContain(POL_PASS);
      expectBootFail(expect, r, 1);
      expectReadOnly(expect, r.calls);
    });
  }

  it("AC28: repo secrets SUPABASE_ACCESS_TOKEN and OTHER_TOKEN -> FAIL (found: SUPABASE_ACCESS_TOKEN) with fix", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, secrets: secretsPage("SUPABASE_ACCESS_TOKEN", "OTHER_TOKEN") });
    const line = `${SEC_FAIL} (found: SUPABASE_ACCESS_TOKEN)`;
    expect(outLines(r.stdout), r.stdout).toContain(line);
    expect(fixOf(r.stdout, line)).toHaveLength(1);
    expect(fixOf(r.stdout, line)[0]).toMatch(/production/);
    expect(r.stdout).not.toContain("OTHER_TOKEN");
    expectBootFail(expect, r, 1);
  });

  it("AC28: several SUPABASE_* names, a look-alike, and the match on a second page -> all listed, sorted", async ({ expect }) => {
    const page1 = secretsPage(...Array.from({ length: 100 }, (_, i) => `OTHER_${String(i).padStart(3, "0")}`), "NOT_SUPABASE_X");
    const page2 = secretsPage("SUPABASE_PROJECT_ID", "SUPABASE_DB_PASSWORD");
    const r = await bootstrap({ ...GOOD, secrets: JSON.stringify(page1, null, 2) + "\n" + JSON.stringify(page2) + "\n" });
    expect(outLines(r.stdout), r.stdout).toContain(`${SEC_FAIL} (found: SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_ID)`);
    expect(r.calls).toContain("api --method GET --paginate repos/{owner}/{repo}/actions/secrets?per_page=100");
    expectBootFail(expect, r, 1);
  });

  it("AC29: --offline -> no gh call, SKIP line right after the branch-protection SKIP, nothing S19 PASSes", async ({ expect }) => {
    const r = await bootstrap(GOOD, ["--offline"]);
    expect(section(r.stdout, "github")).toEqual([
      "  SKIP  branch protection on main (offline mode: CI must run the full check)",
      "  SKIP  production environment and repo secrets (offline mode: CI must run the full check)",
    ]);
    expect(r.calls).toEqual([]);
    expect(r.code, r.stdout).toBe(0);
    expect(summary(r.stdout)).toMatch(/^bootstrap-check: PASS (\d+)\/\1 \(2 skipped\)$/);
  });

  it("AC30: gh not on PATH -> FAIL after the branch-protection FAIL, exit 1", async ({ expect }) => {
    const r = await bootstrap("no-gh");
    const gh = section(r.stdout, "github").filter((l) => RESULT_RE.test(l));
    expect(gh).toEqual([BP_GH_FAIL, S19_GH_FAIL]);
    expectBootFail(expect, r, 2);
  });

  it("AC30: gh auth status fails -> same FAIL, and no gh api call", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, authRc: 1 });
    const gh = section(r.stdout, "github").filter((l) => RESULT_RE.test(l));
    expect(gh).toEqual([BP_GH_FAIL, S19_GH_FAIL]);
    expect(r.calls.every((c) => c === "auth status")).toBe(true);
    expectBootFail(expect, r, 2);
  });

  it("AC31: 403 on environments/production -> environment and policy FAIL with (could not read: HTTP 403)", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, env: err("gh: Resource not accessible by integration (HTTP 403)") });
    expect(outLines(r.stdout)).toContain(`${ENV_FAIL} (could not read: HTTP 403)`);
    expect(outLines(r.stdout)).toContain(`${POL_FAIL} (could not read: HTTP 403)`);
    expect(r.stdout).not.toContain(ENV_PASS);
    expectBootFail(expect, r, 2);
  });

  it("AC31: 403 on the branch-policy listing -> policy FAIL with (could not read: HTTP 403)", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, policies: err("gh: Resource not accessible by integration (HTTP 403)") });
    expect(outLines(r.stdout)).toContain(ENV_PASS);
    expect(outLines(r.stdout)).toContain(`${POL_FAIL} (could not read: HTTP 403)`);
    expectBootFail(expect, r, 1);
  });

  it("AC31: 403 on the secrets listing -> secrets FAIL with (could not read: HTTP 403), never PASS", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, secrets: err("gh: Resource not accessible by integration (HTTP 403)") });
    expect(outLines(r.stdout)).toContain(`${SEC_FAIL} (could not read: HTTP 403)`);
    expect(r.stdout).not.toContain(SEC_PASS);
    expectBootFail(expect, r, 1);
  });

  it("AC31: 404 on the secrets listing is an unreadable answer, not 'no secrets'", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, secrets: err("gh: Not Found (HTTP 404)") });
    expect(outLines(r.stdout)).toContain(`${SEC_FAIL} (could not read: HTTP 404)`);
    expectBootFail(expect, r, 1);
  });

  it("AC31: gh api error without an HTTP code -> (could not read: gh api failed)", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, env: err("error connecting to api.github.com") });
    expect(outLines(r.stdout)).toContain(`${ENV_FAIL} (could not read: gh api failed)`);
    expect(outLines(r.stdout)).toContain(`${POL_FAIL} (could not read: gh api failed)`);
    expectBootFail(expect, r, 2);
  });
});

// =====================================================================================================
// D2. bootstrap-check S19 accepted risk (AC35-AC37, devops-cicd entry "S19 accepted risk")
// =====================================================================================================
// The decision file is the repo's own (read at run time, so it carries its backticked mention of the close line,
// which must not close it). Closing files are written into the fixture repo's tasks/decisions/.
const DEC_NAME = "2026-11-25-4d-supabase-secrets-accepted-until-step4.md";
const DEC_PATH = `tasks/decisions/${DEC_NAME}`;
const DEC_FILE = { [DEC_PATH]: readFileSync(join(ROOT, "tasks", "decisions", DEC_NAME), "utf8") };
const CLOSE_LINE = `Closes decision: ${DEC_NAME}`;
const closing = (body: string) => ({ "tasks/decisions/2026-12-01-4i-supabase-secrets-moved.md": body });
const RISK_SUFFIX = ` (ACCEPTED RISK until step 4 ends, see ${DEC_PATH})`;
const POL_RISK = `  RISK  production deploys only from main (deployment branch policy)${RISK_SUFFIX}`;
const SEC_FOUND = "no repository-level SUPABASE_* secrets (found: SUPABASE_ACCESS_TOKEN)";
const SEC_RISK = `  RISK  ${SEC_FOUND}${RISK_SUFFIX}`;
const SEC_FOUND_FAIL = `  FAIL  ${SEC_FOUND}`;
const POL_FIX =
  "fix: Settings > Environments > production > Deployment branches: 'Selected branches and tags' with exactly one branch rule: main (not 'Protected branches only')";
const SEC_FIX =
  "fix: move it to the production Environment (Settings > Environments > production > Environment secrets) and delete the repository secret";
/** AC35's gh answers: production with no branch policy (all branches) and a repository secret SUPABASE_ACCESS_TOKEN. */
const FINDINGS: GhScenario = {
  ...GOOD,
  env: { ...ENV_CUSTOM, deployment_branch_policy: null },
  secrets: secretsPage("SUPABASE_ACCESS_TOKEN", "OTHER_TOKEN"),
};
const countOf = (s: string, kind: string) => resultLines(s).filter((l) => l.startsWith(`  ${kind}  `)).length;
const PHASE0 = "Phase 0 is not complete: only git-release and devops-cicd may work.";
const riskNote = (n: number) => (n === 0 ? "" : n === 1 ? "1 accepted risk, " : `${n} accepted risks, `);

/** Exit 0 with `PASS <p>/<t> (<risk note><s> skipped)`, where p and t match the printed lines. */
function expectBootPassWithRisk(expect: Expect, r: Run, risks: number) {
  expect(r.code, r.stdout).toBe(0);
  const p = countOf(r.stdout, "PASS");
  expect(countOf(r.stdout, "RISK")).toBe(risks);
  expect(countOf(r.stdout, "FAIL")).toBe(0);
  expect(summary(r.stdout)).toBe(`bootstrap-check: PASS ${p}/${p + risks} (${riskNote(risks)}${countOf(r.stdout, "SKIP")} skipped)`);
}
/** Exit 1 with `FAIL <f> of <t> checks failed (<risk note><s> skipped). Phase 0 ...`. */
function expectBootFailWithRisk(expect: Expect, r: Run, fails: number, risks: number) {
  expect(r.code, r.stdout).toBe(1);
  const t = countOf(r.stdout, "PASS") + countOf(r.stdout, "FAIL") + countOf(r.stdout, "RISK");
  expect(countOf(r.stdout, "FAIL")).toBe(fails);
  expect(countOf(r.stdout, "RISK")).toBe(risks);
  expect(summary(r.stdout)).toBe(
    `bootstrap-check: FAIL ${fails} of ${t} checks failed (${riskNote(risks)}${countOf(r.stdout, "SKIP")} skipped). ${PHASE0}`,
  );
}
const noRiskText = (s: string) => !/RISK|accepted risk/i.test(s);

describe.concurrent("bootstrap-check S19 accepted risk (AC35-AC37)", { timeout: TEST_TIMEOUT }, () => {
  it("AC35: decision open, policy null + SUPABASE_ACCESS_TOKEN -> two RISK lines with fix lines, no S19 FAIL, exit 0", async ({ expect }) => {
    const r = await bootstrap(FINDINGS, [], DEC_FILE);
    expect(section(r.stdout, "github")).toEqual([
      "  PASS  main requires PR review",
      "  PASS  main requires status checks",
      ENV_PASS,
      POL_RISK,
      `        ${POL_FIX} (now: all branches)`,
      SEC_RISK,
      `        ${SEC_FIX}`,
    ]);
    expect(r.stdout).not.toContain("  FAIL  ");
    expect(r.stdout).not.toContain("OTHER_TOKEN");
    expectBootPassWithRisk(expect, r, 2);
    expect(summary(r.stdout)).toMatch(/^bootstrap-check: PASS (\d+)\/(\d+) \(2 accepted risks, 0 skipped\)$/);
    expectReadOnly(expect, r.calls);
  });

  for (const [label, sc] of AC27) {
    it(`AC35: decision open, AC27 ${label} -> RISK policy line with fix, '1 accepted risk', exit 0`, async ({ expect }) => {
      const r = await bootstrap(sc, [], DEC_FILE);
      expect(outLines(r.stdout), r.stdout).toContain(POL_RISK);
      expect(detailOf(r.stdout, POL_RISK).filter((l) => l.startsWith(POL_FIX))).toHaveLength(1);
      expect(r.stdout).not.toContain(POL_FAIL);
      expect(outLines(r.stdout)).toContain(SEC_PASS);
      expectBootPassWithRisk(expect, r, 1);
    });
  }

  it("AC35: decision open, only the secrets finding -> one RISK, '1 accepted risk', exit 0", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, secrets: FINDINGS.secrets }, [], DEC_FILE);
    expect(outLines(r.stdout)).toContain(POL_PASS);
    expect(outLines(r.stdout)).toContain(SEC_RISK);
    expect(detailOf(r.stdout, SEC_RISK)).toEqual([SEC_FIX]);
    expectBootPassWithRisk(expect, r, 1);
  });

  it("AC35: the decision file's own (backticked) mention of the close line is not an exact line", ({ expect }) => {
    const own = DEC_FILE[DEC_PATH].replace(/\r\n/g, "\n");
    expect(own).toContain(CLOSE_LINE);
    expect(own.split("\n")).not.toContain(CLOSE_LINE);
  });

  // AC36: the same gh answers, decision closed or missing -> exactly the pre-change AC27a/AC28 output.
  const AC36_SETUPS: [string, Record<string, string>][] = [
    ["closing file (LF)", { ...DEC_FILE, ...closing(`# Decision: secrets moved\n\n${CLOSE_LINE}\n`) }],
    ["closing file (CRLF)", { ...DEC_FILE, ...closing(`# Decision: secrets moved\r\n\r\n${CLOSE_LINE}\r\n- **Date:** 2026-12-01\r\n`) }],
    ["closing line is the last line without a newline", { ...DEC_FILE, ...closing(`# Decision\n${CLOSE_LINE}`) }],
    ["closing file in a subfolder of tasks/decisions", { ...DEC_FILE, "tasks/decisions/2026/close.md": `${CLOSE_LINE}\n` }],
    ["decision file missing (no tasks/decisions)", {}],
    ["decision file missing, other decisions present", { "tasks/decisions/2026-11-20-x-other.md": "# Other\n" }],
  ];
  for (const [label, files] of AC36_SETUPS) {
    it(`AC36: ${label} -> AC27a and AC28 FAIL lines with fix, no RISK text, old summary, exit 1`, async ({ expect }) => {
      const r = await bootstrap(FINDINGS, [], files);
      expect(section(r.stdout, "github")).toEqual([
        "  PASS  main requires PR review",
        "  PASS  main requires status checks",
        ENV_PASS,
        POL_FAIL,
        `        ${POL_FIX} (now: all branches)`,
        SEC_FOUND_FAIL,
        `        ${SEC_FIX}`,
      ]);
      expect(noRiskText(r.stdout), r.stdout).toBe(true);
      expectBootFailWithRisk(expect, r, 2, 0);
      expect(summary(r.stdout)).toMatch(BOOT_FAIL_RE);
    });
  }

  it("AC36: closed and missing give byte-identical output (both are the pre-change behaviour)", async ({ expect }) => {
    const [closed, missing] = await Promise.all([
      bootstrap(FINDINGS, [], { ...DEC_FILE, ...closing(`${CLOSE_LINE}\r\n`) }),
      bootstrap(FINDINGS, [], {}),
    ]);
    expect(closed.stdout).toBe(missing.stdout);
    expect(closed.code).toBe(1);
    expect(missing.code).toBe(1);
  });

  const NOT_CLOSING: [string, string][] = [
    ["indented", `  ${CLOSE_LINE}\n`],
    ["tab-indented", `\t${CLOSE_LINE}\n`],
    ["list prefix", `- ${CLOSE_LINE}\n`],
    ["bold", `**${CLOSE_LINE}**\n`],
    ["in backticks", `\`${CLOSE_LINE}\`\n`],
    ["trailing text", `${CLOSE_LINE} (done)\n`],
    ["trailing space", `${CLOSE_LINE} \n`],
    ["other case", `closes decision: ${DEC_NAME}\n`],
    ["another decision's name", "Closes decision: 2026-11-25-4d-something-else.md\n"],
    ["path instead of name", `Closes decision: ${DEC_PATH}\n`],
  ];
  for (const [label, body] of NOT_CLOSING) {
    it(`AC36: a close line that is not exact (${label}) does not close the decision -> still RISK, exit 0`, async ({ expect }) => {
      const r = await bootstrap(FINDINGS, [], { ...DEC_FILE, ...closing(`# Not a close\n\n${body}`) });
      expect(outLines(r.stdout), r.stdout).toContain(POL_RISK);
      expect(outLines(r.stdout)).toContain(SEC_RISK);
      expectBootPassWithRisk(expect, r, 2);
    });
  }

  it("AC36: an exact close line outside tasks/decisions/ does not close the decision", async ({ expect }) => {
    const r = await bootstrap(FINDINGS, [], { ...DEC_FILE, "tasks/4i/TASK_BRIEF.md": `${CLOSE_LINE}\n`, "notes.md": `${CLOSE_LINE}\n` });
    expect(outLines(r.stdout)).toContain(POL_RISK);
    expectBootPassWithRisk(expect, r, 2);
  });

  it("AC36: decision files are only read as text, never executed", async ({ expect }) => {
    const r = await bootstrap(FINDINGS, [], {
      ...DEC_FILE,
      "tasks/decisions/2026-11-26-x $(touch PWNED1).md": "$(touch PWNED2)\n`touch PWNED3`\n",
    });
    expect(outLines(r.stdout)).toContain(POL_RISK);
    for (const n of ["PWNED1", "PWNED2", "PWNED3"]) {
      expect(existsSync(join(r.repo, n))).toBe(false);
      expect(existsSync(join(r.repo, "tasks", "decisions", n))).toBe(false);
    }
  });

  it("AC37: decision open and the AC25 settings -> three PASS lines, no risk text, exit 0", async ({ expect }) => {
    const r = await bootstrap(GOOD, [], DEC_FILE);
    expect(section(r.stdout, "github")).toEqual([
      "  PASS  main requires PR review",
      "  PASS  main requires status checks",
      ENV_PASS,
      POL_PASS,
      SEC_PASS,
    ]);
    expect(noRiskText(r.stdout)).toBe(true);
    expect(summary(r.stdout)).toMatch(/^bootstrap-check: PASS (\d+)\/\1 \(0 skipped\)$/);
    expectBootPassWithRisk(expect, r, 0);
  });

  it("AC37: decision open, environment 404 -> both environment lines FAIL (not RISK); secrets finding is RISK", async ({ expect }) => {
    const r = await bootstrap({ ...FINDINGS, env: err("gh: Not Found (HTTP 404)") }, [], DEC_FILE);
    expect(outLines(r.stdout)).toContain(ENV_FAIL);
    expect(outLines(r.stdout)).toContain(POL_FAIL);
    expect(r.stdout).not.toContain(POL_RISK);
    expect(outLines(r.stdout)).toContain(SEC_RISK);
    expectBootFailWithRisk(expect, r, 2, 1);
  });

  it("AC37: decision open, 403 on secrets + policy null -> 'FAIL 1 of <t> checks failed (1 accepted risk, 0 skipped)', exit 1", async ({ expect }) => {
    const r = await bootstrap({ ...FINDINGS, secrets: err("gh: Resource not accessible by integration (HTTP 403)") }, [], DEC_FILE);
    expect(outLines(r.stdout)).toContain(POL_RISK);
    expect(outLines(r.stdout)).toContain(`${SEC_FAIL} (could not read: HTTP 403)`);
    expect(r.stdout).not.toMatch(/RISK {2}no repository-level/);
    expectBootFailWithRisk(expect, r, 1, 1);
    expect(summary(r.stdout)).toMatch(/^bootstrap-check: FAIL 1 of \d+ checks failed \(1 accepted risk, 0 skipped\)\. /);
  });

  it("AC37: decision open, 404 on the secrets listing -> FAIL (could not read: HTTP 404), not RISK or PASS", async ({ expect }) => {
    const r = await bootstrap({ ...FINDINGS, secrets: err("gh: Not Found (HTTP 404)") }, [], DEC_FILE);
    expect(outLines(r.stdout)).toContain(`${SEC_FAIL} (could not read: HTTP 404)`);
    expectBootFailWithRisk(expect, r, 1, 1);
  });

  it("AC37: decision open, 403 on the branch-policy listing -> policy FAIL (could not read: HTTP 403), not RISK", async ({ expect }) => {
    const r = await bootstrap(
      { ...FINDINGS, env: ENV_CUSTOM, policies: err("gh: Resource not accessible by integration (HTTP 403)") },
      [],
      DEC_FILE,
    );
    expect(outLines(r.stdout)).toContain(`${POL_FAIL} (could not read: HTTP 403)`);
    expect(r.stdout).not.toContain(POL_RISK);
    expect(outLines(r.stdout)).toContain(SEC_RISK);
    expectBootFailWithRisk(expect, r, 1, 1);
  });

  it("AC37: decision open, 403 on environments/production -> both lines FAIL (could not read: HTTP 403)", async ({ expect }) => {
    const r = await bootstrap({ ...GOOD, env: err("gh: Resource not accessible by integration (HTTP 403)") }, [], DEC_FILE);
    expect(outLines(r.stdout)).toContain(`${ENV_FAIL} (could not read: HTTP 403)`);
    expect(outLines(r.stdout)).toContain(`${POL_FAIL} (could not read: HTTP 403)`);
    expect(noRiskText(r.stdout)).toBe(true);
    expectBootFailWithRisk(expect, r, 2, 0);
  });

  it("AC37: decision open, gh auth fails -> AC30 FAIL unchanged, no RISK", async ({ expect }) => {
    const r = await bootstrap({ ...FINDINGS, authRc: 1 }, [], DEC_FILE);
    expect(section(r.stdout, "github").filter((l) => RESULT_RE.test(l))).toEqual([BP_GH_FAIL, S19_GH_FAIL]);
    expect(noRiskText(r.stdout)).toBe(true);
    expectBootFailWithRisk(expect, r, 2, 0);
  });

  it("AC37: decision open, --offline -> AC29 SKIP unchanged, no gh call, no RISK", async ({ expect }) => {
    const r = await bootstrap(FINDINGS, ["--offline"], DEC_FILE);
    expect(section(r.stdout, "github")).toEqual([
      "  SKIP  branch protection on main (offline mode: CI must run the full check)",
      "  SKIP  production environment and repo secrets (offline mode: CI must run the full check)",
    ]);
    expect(r.calls).toEqual([]);
    expect(noRiskText(r.stdout)).toBe(true);
    expect(summary(r.stdout)).toMatch(/^bootstrap-check: PASS (\d+)\/\1 \(2 skipped\)$/);
  });
});

// =====================================================================================================
// E. AC34 (static part): nothing secret-shaped is committed with these tests
// =====================================================================================================
describe("AC34: test sources hold no secret-shaped strings (gitleaks scans history)", () => {
  it("this file and tests/integration/fixtures/4d/ hold no JWT, sb_secret_ key, Stripe key or password URL literal", ({ expect }) => {
    const files = [
      join(ROOT, "tests", "integration", "verify-fixes.test.ts"),
      ...walk(join(ROOT, "tests", "integration", "fixtures", "4d")),
    ];
    const shapes = [
      /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./,
      new RegExp("sb_" + "secret_" + "[A-Za-z0-9_-]{20,}"),
      new RegExp("sk_" + "(live|test)_" + "[A-Za-z0-9]{8,}"),
      new RegExp("postgres(ql)?://[^:\\s\"'`$]+:[^@\\s\"'`$]{6,}@"),
    ];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const re of shapes) expect(re.test(text), `${re} in ${f}`).toBe(false);
    }
  });
});
