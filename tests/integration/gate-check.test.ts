// Task 4b: merge-gate freshness (L22, L17, S5, S15, S16). Fixture tests for scripts/gate-check.sh (AC1-AC22)
// and static checks on .github/workflows/gate.yml (AC23, AC24). Brief: tasks/4b/TASK_BRIEF.md.
//
// Each fixture test builds a throwaway git repo in the OS temp dir (deleted after the test): branch `main` with
// app/page.tsx, tasks/0/TASK_BRIEF.md, tasks/decisions.md, scripts/tool.sh, and the task branch `ci/9x-demo`. The script
// is run from this worktree (`bash <worktree>/scripts/gate-check.sh`) with the fixture repo as cwd; it finds its
// repo with `git rev-parse --show-toplevel`, so it judges the fixture, never this repo.
// Deterministic: fixed author/committer name, email and dates; system and global git config are ignored
// (GIT_CONFIG_NOSYSTEM, empty GIT_CONFIG_GLOBAL), so autocrlf/hooks/signing of the machine don't apply.
// Offline: no network, no GitHub token. Label/push inputs are the env vars from the devops-cicd Q1 Handoff
// entry: FRAMEWORK_CHANGE_APPROVED, FRAMEWORK_LABEL_TIME, PR_HEAD_PUSHES ("<time> <40-hex tip sha>" per line).
// On Windows, Git Bash is called explicitly (%ProgramFiles%\Git\bin\bash.exe); elsewhere `bash`. git must be on PATH.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "gate-check.sh").split("\\").join("/");
const BASH =
  process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe") : "bash";
const BRANCH = "ci/9x-demo";
const TIMEOUT = 120_000;

// GitHub server times used as push / label times in the S16 tests (T0 < T1 < T2 < T3 < T4).
const T0 = "2026-11-25T10:00:00Z";
const T1 = "2026-11-25T11:00:00Z";
const T2 = "2026-11-25T12:00:00Z";
const T3 = "2026-11-25T13:00:00Z";
const T4 = "2026-11-25T14:00:00Z";

// Expected output lines (prefixes from the brief's ACs and the devops-cicd Q1 entry).
const SEC_PASS = "  PASS  specs/9x/security-gate.md: PASS";
const REV_PASS = "  PASS  specs/9x/review.md: APPROVE";
const stale = (f: string) => `  FAIL  specs/9x/${f} was not written after the last code change`;
const notOnBranch = (f: string) => `  FAIL  specs/9x/${f} was not committed on this branch`;
const NO_LABEL = "  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:";
const LABEL_PASS = "  PASS  pipeline/framework files changed, approved by the person";
const LABEL_OLD = "  FAIL  framework-change-approved label is older than the last change to protected files";
const LABEL_TIME_BAD = "  FAIL  framework-change-approved label time could not be read";
const PUSH_TIME_BAD = "  FAIL  push time of the last protected change could not be read";
const PROTECTED_ANY = "pipeline/framework files changed";

let scratch = "";
let globalCfg = "";
const created: string[] = [];

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "gate-check-cfg-"));
  globalCfg = join(scratch, "gitconfig");
  writeFileSync(globalCfg, "");
});
afterEach(() => {
  for (const d of created.splice(0)) rmSync(d, { recursive: true, force: true });
});
afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(GIT_|FRAMEWORK_)|^(PR_HEAD_PUSHES|GITHUB_HEAD_REF|GITHUB_BASE_REF)$/i.test(k)) delete env[k];
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = globalCfg;
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_AUTHOR_NAME = "Fixture Author";
  env.GIT_AUTHOR_EMAIL = "author@example.test";
  env.GIT_COMMITTER_NAME = "Fixture Committer";
  env.GIT_COMMITTER_EMAIL = "committer@example.test";
  return env;
}

type Files = Record<string, string | null>;
interface Result {
  code: number;
  out: string;
  lines: string[];
}

class Repo {
  readonly dir: string;
  private tick = 0;

  constructor(mainFiles: Files = {}) {
    this.dir = mkdtempSync(join(tmpdir(), "gate-check-"));
    created.push(this.dir);
    this.git(["init", "-q", "-b", "main"]);
    this.git(["config", "core.autocrlf", "false"]);
    this.git(["config", "commit.gpgsign", "false"]);
    this.commit("main: initial", {
      "app/page.tsx": "export default function Page() {\n  return null;\n}\n",
      "tasks/0/TASK_BRIEF.md": "# Task 0\n\n- row 1\n",
      "tasks/decisions.md": "# Decisions\n\n- d1\n",
      "scripts/tool.sh": "#!/usr/bin/env bash\necho tool\n",
      ...mainFiles,
    });
  }

  // Fixed, increasing commit dates (one minute apart, from 2020-01-01) unless a date is given.
  private dates(date?: string): Record<string, string> {
    const d = date ?? `@${1577836800 + ++this.tick * 60} +0000`;
    return { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d };
  }

  git(args: string[], date?: string, input?: string): string {
    return execFileSync("git", args, {
      cwd: this.dir,
      env: { ...cleanEnv(), ...this.dates(date) },
      encoding: "utf8",
      input: input ?? "",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  gitStatus(args: string[], date?: string): number {
    const r = spawnSync("git", args, { cwd: this.dir, env: { ...cleanEnv(), ...this.dates(date) }, encoding: "utf8" });
    return r.status ?? -1;
  }

  write(files: Files): void {
    for (const [p, content] of Object.entries(files)) {
      const abs = join(this.dir, p);
      if (content === null) rmSync(abs, { force: true });
      else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
    }
  }

  commit(msg: string, files: Files, date?: string): string {
    this.write(files);
    this.git(["add", "-A"]);
    this.git(["commit", "-q", "-m", msg], date);
    return this.sha();
  }

  sha(ref = "HEAD"): string {
    return this.git(["rev-parse", ref]);
  }

  checkout(args: string[]): void {
    this.git(["checkout", "-q", ...args]);
  }

  // Valid gates: security-gate.md then review.md, each in its own commit touching nothing else.
  gates(note = ""): string {
    this.commit("docs: security gate", { "specs/9x/security-gate.md": `Result: PASS\n\nsecurity notes ${note}\n` });
    return this.commit("docs: review", { "specs/9x/review.md": `Result: APPROVE\n\nreview notes ${note}\n` });
  }

  run(env: Record<string, string | undefined> = {}, args?: string[]): Result {
    const fullEnv = cleanEnv();
    for (const [k, v] of Object.entries(env)) if (v !== undefined) fullEnv[k] = v;
    const r = spawnSync(BASH, [SCRIPT, ...(args ?? ["--base", "main", "--head", this.sha(), "--branch", BRANCH])], {
      cwd: this.dir,
      env: fullEnv,
      encoding: "utf8",
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\r\n/g, "\n");
    return { code: r.status ?? -1, out, lines: (r.stdout ?? "").replace(/\r\n/g, "\n").split("\n").filter((l) => l !== "") };
  }
}

// Task branch cut from main with one code commit (app/feature.ts), plus optional extra files in that commit.
function taskRepo(extra: Files = {}, mainFiles: Files = {}): Repo {
  const r = new Repo(mainFiles);
  r.checkout(["-b", BRANCH]);
  r.commit("feat: feature", { "app/feature.ts": "export const feature = 1;\n", ...extra });
  return r;
}

const pushes = (...p: [string, string][]) => p.map(([t, s]) => `${t} ${s}`).join("\n");

function lastLine(r: Result): string {
  return r.lines[r.lines.length - 1] ?? "";
}
function expectPass(r: Result): void {
  expect(lastLine(r), r.out).toBe("gate-check: PASS");
  expect(r.code, r.out).toBe(0);
}
function expectFail(r: Result): void {
  expect(lastLine(r), r.out).toBe("gate-check: FAIL");
  expect(r.code, r.out).toBe(1);
}
function expectLine(r: Result, prefix: string): number {
  const i = r.lines.findIndex((l) => l.startsWith(prefix));
  expect(i, `expected a line starting with ${JSON.stringify(prefix)} in:\n${r.out}`).toBeGreaterThanOrEqual(0);
  return i;
}
function expectNoLine(r: Result, fragment: string): void {
  expect(
    r.lines.some((l) => l.includes(fragment)),
    `expected no line containing ${JSON.stringify(fragment)} in:\n${r.out}`,
  ).toBe(false);
}
function expectBothStale(r: Result): void {
  expectLine(r, SEC_PASS);
  expectLine(r, REV_PASS);
  expectLine(r, stale("security-gate.md"));
  expectLine(r, stale("review.md"));
  expectFail(r);
}
// A FAIL header line followed (somewhere in the indented block below it) by a line containing the path.
function expectListed(r: Result, header: string, path: string): void {
  const i = expectLine(r, header);
  const block: string[] = [];
  for (const l of r.lines.slice(i + 1)) {
    if (!l.startsWith("          ")) break;
    block.push(l.trim());
  }
  expect(block, r.out).toContain(path);
}

describe("gate-check.sh freshness (task 4b AC1-AC14: L22, L17, S5, regressions)", () => {
  it("AC1: one code commit then valid gates -> both PASS lines, gate-check: PASS, exit 0", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    const res = r.run();
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectNoLine(res, PROTECTED_ANY);
    expectPass(res);
  });

  it("AC1: --head HEAD (literal, as in the brief) gives the same PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    expectPass(r.run({}, ["--base", "main", "--head", "HEAD", "--branch", BRANCH]));
  });

  it("AC2: code commit after the gates -> both gates stale, exit 1", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.commit("feat: more", { "app/feature.ts": "export const feature = 2;\n" });
    expectBothStale(r.run());
  });

  it("AC3: review.md in the same commit as a code change -> review stale, security gate fresh", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.commit("feat+review in one commit", {
      "app/feature.ts": "export const feature = 2;\n",
      "specs/9x/review.md": "Result: APPROVE\n",
    });
    r.commit("docs: security gate", { "specs/9x/security-gate.md": "Result: PASS\n" });
    const res = r.run();
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectLine(res, stale("review.md"));
    expectNoLine(res, stale("security-gate.md"));
    expectFail(res);
  });

  it("AC4 (L22): clean catch-up merge of main (app/other.ts + scripts/tool.sh) -> PASS, no protected line", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.checkout(["main"]);
    r.commit("main: other + tool", {
      "app/other.ts": "export const other = 1;\n",
      "scripts/tool.sh": "#!/usr/bin/env bash\necho tool v2\n",
    });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-edit", "main"])).toBe(0);
    const res = r.run();
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectNoLine(res, "was not written");
    expectNoLine(res, PROTECTED_ANY);
    expectPass(res);
  });

  it("AC5 (L22): catch-up merge resolving a code conflict with new content -> both stale, exit 1", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.checkout(["main"]);
    r.commit("main: feature too", { "app/feature.ts": "export const feature = 100;\n" });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-edit", "main"])).not.toBe(0); // conflict on the same line
    r.write({ "app/feature.ts": "export const feature = 999;\n" }); // from neither side
    r.git(["add", "-A"]);
    r.git(["commit", "-q", "--no-edit"]);
    expect(r.git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ")).toHaveLength(3); // a real merge commit
    expectBothStale(r.run());
  });

  it("AC6 (L22): clean merge (--no-commit) whose merge commit also edits app/feature.ts -> both stale", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.checkout(["main"]);
    r.commit("main: other", { "app/other.ts": "export const other = 1;\n" });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-commit", "--no-ff", "main"])).toBe(0);
    r.write({ "app/feature.ts": "export const feature = 2; // sneaked into the merge\n" });
    r.git(["add", "-A"]);
    r.git(["commit", "-q", "--no-edit"]);
    expect(r.git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ")).toHaveLength(3);
    expectBothStale(r.run());
  });

  it("AC7 (L22): catch-up merge with a conflict only in tasks/0/TASK_BRIEF.md -> PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.commit("chore: task 0 brief on branch", { "tasks/0/TASK_BRIEF.md": "# Task 0\n\n- row 1 (branch)\n" });
    r.gates();
    r.checkout(["main"]);
    r.commit("main: task 0 brief", { "tasks/0/TASK_BRIEF.md": "# Task 0\n\n- row 1 (main)\n" });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-edit", "main"])).not.toBe(0);
    r.write({ "tasks/0/TASK_BRIEF.md": "# Task 0\n\n- row 1 (resolved)\n" });
    r.git(["add", "-A"]);
    r.git(["commit", "-q", "--no-edit"]);
    const res = r.run();
    expectNoLine(res, "was not written");
    expectPass(res);
  });

  it("AC8 (L22): code conflict resolution merge, valid gates committed after it -> PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.checkout(["main"]);
    r.commit("main: feature too", { "app/feature.ts": "export const feature = 100;\n" });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-edit", "main"])).not.toBe(0);
    r.write({ "app/feature.ts": "export const feature = 999;\n" });
    r.git(["add", "-A"]);
    r.git(["commit", "-q", "--no-edit"]);
    r.gates();
    expectPass(r.run());
  });

  it("AC8 variant: stale gates (AC5) become fresh when both gates are re-run after the merge", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates("first");
    r.checkout(["main"]);
    r.commit("main: feature too", { "app/feature.ts": "export const feature = 100;\n" });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-edit", "main"])).not.toBe(0);
    r.write({ "app/feature.ts": "export const feature = 999;\n" });
    r.git(["add", "-A"]);
    r.git(["commit", "-q", "--no-edit"]);
    expectBothStale(r.run());
    r.gates("re-run");
    expectPass(r.run());
  });

  it("AC9 (L17): specs/9x/post-deploy.md after the gates -> PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.commit("docs: post-deploy", { "specs/9x/post-deploy.md": "# Post-deploy\n\nok\n" });
    expectPass(r.run());
  });

  it("AC10 (L17 narrow, Q2): specs/9y/post-deploy.md (other task id) after the gates -> both stale", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.commit("docs: other post-deploy", { "specs/9y/post-deploy.md": "# Post-deploy\n" });
    expectBothStale(r.run());
  });

  it("AC11 (S5): tasks/decisions.md changed after the gates -> both stale", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.commit("docs: decision", { "tasks/decisions.md": "# Decisions\n\n- d1\n- d2\n" });
    expectBothStale(r.run());
  });

  it("AC11 (S5): tasks/decisions/2026-11-25-demo.md added after the gates -> both stale", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.commit("docs: decision file", { "tasks/decisions/2026-11-25-demo.md": "# Demo decision\n" });
    expectBothStale(r.run());
  });

  it("AC12 (S5): tasks/9x/notes.md and tasks/9x/TASK_BRIEF.md after the gates -> PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    r.commit("docs: handoff", {
      "tasks/9x/notes.md": "# 9x notes\n\n- after the gates\n",
      "tasks/9x/TASK_BRIEF.md": "# 9x\n\nHandoff\n",
    });
    expectPass(r.run());
  });

  it("AC13 (S5): tasks-only PR with gates only on main -> not committed on this branch; gates on branch -> PASS", { timeout: TIMEOUT }, () => {
    const r = new Repo({
      "specs/9x/security-gate.md": "Result: PASS\n",
      "specs/9x/review.md": "Result: APPROVE\n",
    });
    r.checkout(["-b", BRANCH]);
    r.commit("docs: notes", { "tasks/9x/notes.md": "notes\n" });
    const res = r.run();
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectLine(res, notOnBranch("security-gate.md"));
    expectLine(res, notOnBranch("review.md"));
    expectFail(res);

    r.gates("on branch");
    expectPass(r.run());
  });

  it("AC14a: first non-empty line 'Result: FAIL', 'Result: PASS' later -> FAIL first line, exit 1", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.commit("docs: security gate", { "specs/9x/security-gate.md": "\n\nResult: FAIL\n\nResult: PASS\n" });
    r.commit("docs: review", { "specs/9x/review.md": "Result: APPROVE\n" });
    const res = r.run();
    expectLine(res, "  FAIL  specs/9x/security-gate.md: first line is not 'Result: PASS'");
    expectLine(res, REV_PASS);
    expectFail(res);
  });

  it("AC14b: review.md missing -> FAIL missing, exit 1", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.commit("docs: security gate", { "specs/9x/security-gate.md": "Result: PASS\n" });
    const res = r.run();
    expectLine(res, SEC_PASS);
    expectLine(res, "  FAIL  specs/9x/review.md missing");
    expectFail(res);
  });

  it("AC14c: --base with no common history -> FAIL no merge-base, exit 1", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    const tree = r.git(["mktree"], undefined, "");
    const orphan = r.git(["commit-tree", tree, "-m", "unrelated root"]);
    r.git(["branch", "unrelated", orphan]);
    const res = r.run({}, ["--base", "unrelated", "--head", r.sha(), "--branch", BRANCH]);
    expectLine(res, "  FAIL  no merge-base with");
    expectFail(res);
  });

  it("AC14d: branch 'bad-name' -> 'gate-check: FAIL branch 'bad-name' doesn't match', exit 1", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    const res = r.run({}, ["--base", "main", "--head", r.sha(), "--branch", "bad-name"]);
    expectLine(res, "gate-check: FAIL branch 'bad-name' doesn't match");
    expect(res.code, res.out).toBe(1);
  });

  it("AC14e: --base without a value -> exit 2", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    const res = r.run({}, ["--base"]);
    expect(res.code, res.out).toBe(2);
    expectNoLine(res, "gate-check: PASS");
  });
});

const PROTECTED_FILES = [
  ".gitleaks.toml",
  ".github/pull_request_template.md",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/bug.md",
  ".github/workflows/x.yml",
  "scripts/x.sh",
  "rules/x.md",
  "roles/x.md",
  "templates/TASK_BRIEF.md",
  "ORCHESTRATOR.md",
  "AGENTS.md",
  "package.json",
  "package-lock.json",
  "supabase/config.toml",
];

describe("gate-check.sh protected paths (task 4b AC15, AC16: S15)", () => {
  it.each(PROTECTED_FILES)("AC15: PR changes %s, no label -> FAIL without label, path listed, exit 1", { timeout: TIMEOUT }, (path) => {
    const r = taskRepo({ [path]: "protected content\n" });
    r.gates();
    const res = r.run();
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectListed(res, NO_LABEL, path);
    expectFail(res);
  });

  it("AC15: modifying (not adding) a protected file on main (scripts/tool.sh) also needs the label", { timeout: TIMEOUT }, () => {
    const r = taskRepo({ "scripts/tool.sh": "#!/usr/bin/env bash\necho changed\n" });
    r.gates();
    const res = r.run();
    expectListed(res, NO_LABEL, "scripts/tool.sh");
    expectFail(res);
  });

  it("AC16: only non-protected paths changed -> no protected line, PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo({
      "app/page.tsx": "export default function Page() {\n  return <main />;\n}\n",
      "supabase/migrations/20261125000000_x.sql": "select 1;\n",
      "supabase/tests/x.sql": "select 1;\n",
      "docs/templates.md": "# templates\n",
      "tasks/decisions.md": "# Decisions\n\n- d1\n- d2\n",
    });
    r.gates();
    const res = r.run();
    expectNoLine(res, PROTECTED_ANY);
    expectPass(res);
  });
});

// Branch with a protected change (scripts/x.sh) in the code commit A, then valid gates; first push at T1 has tip G.
function protectedRepo(): { r: Repo; a: string; g1: string } {
  const r = taskRepo({ "scripts/x.sh": "#!/usr/bin/env bash\necho x1\n" });
  const a = r.sha();
  const g1 = r.gates("first");
  return { r, a, g1 };
}
const label = (time: string | undefined, pushLines: string | undefined, approved: string | undefined = "1") => ({
  FRAMEWORK_CHANGE_APPROVED: approved,
  FRAMEWORK_LABEL_TIME: time,
  PR_HEAD_PUSHES: pushLines,
});

describe("gate-check.sh label freshness (task 4b AC17-AC22: S16)", () => {
  it("AC17: label applied after the push containing the last protected change -> PASS line, exit 0", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    const res = r.run(label(T2, pushes([T1, g1])));
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectLine(res, LABEL_PASS);
    expectPass(res);
  });

  it("AC17: push lines in any order, CRLF and blank lines, upper-case SHA, unknown tips (deleted branch) are accepted", { timeout: TIMEOUT }, () => {
    const { r, a, g1 } = protectedRepo();
    const lines = [`${T1} ${g1.toUpperCase()}`, "", `${T0} ${a}`, `${T0} ${"0".repeat(40)}`].join("\r\n");
    expectPass(r.run(label(T2, lines)));
  });

  it("AC18: later push changes scripts/x.sh again, label unchanged -> label older FAIL listing scripts/x.sh; re-label -> PASS", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    r.commit("feat: x again", { "scripts/x.sh": "#!/usr/bin/env bash\necho x2\n" });
    const g2 = r.gates("second");
    const p = pushes([T1, g1], [T3, g2]);
    const stale1 = r.run(label(T2, p));
    expectLine(stale1, SEC_PASS);
    expectLine(stale1, REV_PASS);
    expectNoLine(stale1, "was not written");
    expectListed(stale1, LABEL_OLD, "scripts/x.sh");
    expectNoLine(stale1, LABEL_PASS);
    expectFail(stale1);

    // Re-label after that push.
    const res = r.run(label(T4, p));
    expectLine(res, LABEL_PASS);
    expectPass(res);
  });

  it("AC18: label in the same second as the push is stale (strictly later required)", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    const res = r.run(label(T1, pushes([T1, g1])));
    expectLine(res, LABEL_OLD);
    expectFail(res);
  });

  it("AC18: protected change pushed, pushed away (tip without it), then re-pushed after the label -> FAIL", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    const mb = r.sha("main");
    // T1: tip with C; T2: branch reset to main (no C); label at T3; T4: C pushed again.
    const res = r.run(label(T3, pushes([T1, g1], [T2, mb], [T4, g1])));
    expectLine(res, LABEL_OLD);
    expectFail(res);
  });

  it("AC19: later push changes only app/feature.ts (gates re-run), label unchanged -> PASS", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    r.commit("feat: feature only", { "app/feature.ts": "export const feature = 2;\n" });
    const g2 = r.gates("second");
    const res = r.run(label(T2, pushes([T1, g1], [T3, g2])));
    expectLine(res, LABEL_PASS);
    expectPass(res);
  });

  it("AC19: clean catch-up merge of main pushed after the label -> label still current, PASS", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    r.checkout(["main"]);
    r.commit("main: other + tool", {
      "app/other.ts": "export const other = 1;\n",
      "scripts/tool.sh": "#!/usr/bin/env bash\necho tool v2\n",
    });
    r.checkout([BRANCH]);
    expect(r.gitStatus(["merge", "--no-edit", "main"])).toBe(0);
    const res = r.run(label(T2, pushes([T1, g1], [T3, r.sha()])));
    expectLine(res, LABEL_PASS);
    expectPass(res);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["space instead of T", "2026-11-25 12:00:00Z"],
    ["offset instead of Z", "2026-11-25T12:00:00+00:00"],
    ["fractional seconds", "2026-11-25T12:00:00.000Z"],
    ["trailing text", "2026-11-25T12:00:00Z x"],
    ["two lines", `${T2}\n${T3}`],
    // Fail-open probe: an unparsable first line followed by a valid time must not pass the format check
    // (a string comparison of "zzz..." with the push time would otherwise approve a stale label).
    ["garbage line then a valid time", `zzz\n${T0}`],
    ["garbage", "null"],
  ])("AC20: label present, FRAMEWORK_LABEL_TIME %s -> label time could not be read, exit 1", { timeout: TIMEOUT }, (_name, time) => {
    const { r, g1 } = protectedRepo();
    const res = r.run(label(time, pushes([T1, g1])));
    expectLine(res, LABEL_TIME_BAD);
    expectNoLine(res, LABEL_PASS);
    expectFail(res);
  });

  it.each([
    ["unset", () => undefined],
    ["empty", () => ""],
    ["only blank lines", () => "\n  \n"],
    ["short sha", (g: string) => `${T1} ${g.slice(0, 7)}`],
    ["non-hex sha", () => `${T1} ${"z".repeat(40)}`],
    ["bad time", (g: string) => `2026-11-25 11:00:00 ${g}`],
    ["extra field", (g: string) => `${T1} ${g} extra`],
    ["missing sha", (g: string) => `${T1} ${g}\n${T0}`],
    ["one malformed line among good ones", (g: string, a: string) => `${T0} ${a}\nnot-a-line\n${T1} ${g}`],
    ["HEAD not in pushes", (...[, a]: string[]) => `${T0} ${a}`],
  ])("AC20: PR_HEAD_PUSHES %s -> push time could not be read, exit 1", { timeout: TIMEOUT }, (_name, make) => {
    const { r, a, g1 } = protectedRepo();
    const res = r.run(label(T2, make(g1, a)));
    expectLine(res, PUSH_TIME_BAD);
    expectNoLine(res, LABEL_PASS);
    expectFail(res);
  });

  it("AC20: HEAD not in pushes even though an earlier push contains the protected change -> FAIL", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    r.commit("feat: feature only", { "app/feature.ts": "export const feature = 2;\n" });
    r.gates("second");
    const res = r.run(label(T2, pushes([T1, g1])));
    expectLine(res, PUSH_TIME_BAD);
    expectFail(res);
  });

  it("AC21: AC18's second push with author/committer dates before the label -> still the label-older FAIL", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    const early = "2026-11-25T11:30:00Z"; // T1 < early < label T2 < push T3
    r.commit("feat: x again", { "scripts/x.sh": "#!/usr/bin/env bash\necho x2\n" }, early);
    r.commit("docs: security gate", { "specs/9x/security-gate.md": "Result: PASS\n\nsecond\n" }, early);
    const g2 = r.commit("docs: review", { "specs/9x/review.md": "Result: APPROVE\n\nsecond\n" }, early);
    const epoch = String(Date.parse(early) / 1000);
    expect(r.git(["log", "-1", "--format=%at %ct", "HEAD~2"])).toBe(`${epoch} ${epoch}`);
    const res = r.run(label(T2, pushes([T1, g1], [T3, g2])));
    expectListed(res, LABEL_OLD, "scripts/x.sh");
    expectFail(res);
  });

  it("AC21: commit dates after the label don't matter either: push before the label -> PASS", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    const late = "2027-01-01T00:00:00Z";
    r.commit("feat: x", { "scripts/x.sh": "#!/usr/bin/env bash\necho x1\n" }, late);
    const g1 = r.gates("late");
    expectPass(r.run(label(T2, pushes([T1, g1]))));
  });

  it("AC22: protected change and no label at all -> AC15 FAIL line, exit 1", { timeout: TIMEOUT }, () => {
    const { r } = protectedRepo();
    const res = r.run();
    expectListed(res, NO_LABEL, "scripts/x.sh");
    expectFail(res);
  });

  it("AC22: label not on the PR now (FRAMEWORK_CHANGE_APPROVED=0) even with a current label time -> no-label FAIL", { timeout: TIMEOUT }, () => {
    const { r, g1 } = protectedRepo();
    const res = r.run(label(T2, pushes([T1, g1]), "0"));
    expectListed(res, NO_LABEL, "scripts/x.sh");
    expectNoLine(res, LABEL_PASS);
    expectFail(res);
  });

  it("S16 inputs are ignored when no protected path changed", { timeout: TIMEOUT }, () => {
    const r = taskRepo();
    r.gates();
    expectPass(r.run(label("garbage", "garbage")));
  });
});

// Security gate round 1, F1 (HIGH): the old "tip contains C" rule let a reverted protected change come back after the
// label (reset + force push, or a fast-forward "ours" merge) and still PASS. Fixed in 4982db9 (Q1 rule 2 amended:
// the label must postdate the last push that CHANGED the net protected diff). Fixture steps are the ones in the
// "devops-cicd, 2026-11-25 (F1 fix)" Handoff entry.
const P00 = "2026-11-25T10:00:00Z";
const P05 = "2026-11-25T10:05:00Z";
const P10 = "2026-11-25T10:10:00Z";
const P15 = "2026-11-25T10:15:00Z";
const P20 = "2026-11-25T10:20:00Z";
const P25 = "2026-11-25T10:25:00Z";

// Q: scripts/x.sh changed; P: scripts/evil.sh added; gates -> GS; revert P; gates -> GS2 (net protected = x.sh only).
function f1Repo(): { r: Repo; gs: string; gs2: string } {
  const r = new Repo({ "scripts/x.sh": "echo x\n", "app/a.ts": "export const a = 1;\n" });
  r.checkout(["-b", BRANCH]);
  r.commit("ci: Q", { "scripts/x.sh": "echo x2\n" });
  const p = r.commit("ci: P", { "scripts/evil.sh": "echo evil\n" });
  const gs = r.gates("GS");
  r.git(["revert", "--no-edit", p]);
  expect(r.git(["ls-files", "scripts/evil.sh"])).toBe("");
  const gs2 = r.gates("GS2");
  return { r, gs, gs2 };
}
const headArgs = (sha: string) => ["--base", "main", "--head", sha, "--branch", BRANCH];
// From GS2: a non-protected commit (app/b.ts) and gates -> H (same net protected change as GS2).
function addH(r: Repo): string {
  r.commit("feat: b", { "app/b.ts": "export const b = 1;\n" });
  return r.gates("H");
}

describe("gate-check.sh F1 regression: label vs. the last push that changed the net protected diff (AC18 family)", () => {
  it("F1 legit: label after the GS2 push -> PASS line names the push (tip GS2 at 10:00)", { timeout: TIMEOUT }, () => {
    const { r, gs2 } = f1Repo();
    const res = r.run(label(P05, pushes([P00, gs2])), headArgs(gs2));
    const i = expectLine(res, LABEL_PASS);
    expect(res.lines[i], res.out).toContain(`tip ${gs2} at ${P00}`);
    expectPass(res);
  });

  it("F1 variant A: reset to GS and force push after the label -> label-older FAIL listing scripts/evil.sh; re-label -> PASS", { timeout: TIMEOUT }, () => {
    const { r, gs, gs2 } = f1Repo();
    const p = pushes([P00, gs2], [P10, gs]);
    const res = r.run(label(P05, p), headArgs(gs));
    const i = expectLine(res, LABEL_OLD);
    expect(res.lines[i], res.out).toContain(`tip ${gs} at ${P10}`);
    expectListed(res, LABEL_OLD, "scripts/evil.sh");
    expectNoLine(res, LABEL_PASS);
    expectFail(res);

    const relabel = r.run(label(P15, p), headArgs(gs));
    expect(relabel.lines[expectLine(relabel, LABEL_PASS)]).toContain(`tip ${gs} at ${P10}`);
    expectPass(relabel);
  });

  it("F1 variant B: fast-forward merge commit with GS's tree after the label -> label-older FAIL listing scripts/evil.sh; re-label -> PASS", { timeout: TIMEOUT }, () => {
    const { r, gs, gs2 } = f1Repo();
    const m = r.git(["commit-tree", `${gs}^{tree}`, "-p", gs, "-p", gs2, "-m", "merge"]);
    expect(r.git(["merge-base", "--is-ancestor", gs2, m]) === "").toBe(true); // a fast-forward of the labeled tip
    const p = pushes([P00, gs2], [P10, m]);
    const res = r.run(label(P05, p), headArgs(m));
    const i = expectLine(res, LABEL_OLD);
    expect(res.lines[i], res.out).toContain(`tip ${m} at ${P10}`);
    expectListed(res, LABEL_OLD, "scripts/evil.sh");
    expectNoLine(res, LABEL_PASS);
    expectFail(res);

    const relabel = r.run(label(P15, p), headArgs(m));
    expectLine(relabel, LABEL_PASS);
    expectPass(relabel);
  });

  it("F1 intermediate differing push (GS2, GS, H): label must postdate the return push", { timeout: TIMEOUT }, () => {
    const { r, gs, gs2 } = f1Repo();
    const h = addH(r);
    const p = pushes([P00, gs2], [P10, gs], [P20, h]);
    const early = r.run(label(P05, p), headArgs(h));
    expect(early.lines[expectLine(early, LABEL_OLD)], early.out).toContain(`tip ${h} at ${P20}`);
    expectListed(early, LABEL_OLD, "scripts/x.sh");
    expectFail(early);

    const late = r.run(label(P25, p), headArgs(h));
    expect(late.lines[expectLine(late, LABEL_PASS)], late.out).toContain(`tip ${h} at ${P20}`);
    expectPass(late);
  });

  it("F1 unknown tip pushed in between -> counts as a different push: label-older FAIL", { timeout: TIMEOUT }, () => {
    const { r, gs2 } = f1Repo();
    const h = addH(r);
    const unknown = "0123456789abcdef0123456789abcdef01234567";
    expect(r.gitStatus(["cat-file", "-e", `${unknown}^{commit}`])).not.toBe(0);
    const res = r.run(label(P05, pushes([P00, gs2], [P10, unknown], [P20, h])), headArgs(h));
    expect(res.lines[expectLine(res, LABEL_OLD)], res.out).toContain(`tip ${h} at ${P20}`);
    expectFail(res);
  });

  it.each(["H first", "GS first"])(
    "F1 same-second tie of a same and a different push (%s) -> push time could not be read, exit 1",
    { timeout: TIMEOUT },
    (order) => {
      const { r, gs, gs2 } = f1Repo();
      const h = addH(r);
      const tie: [string, string][] = order === "H first" ? [[P10, h], [P10, gs]] : [[P10, gs], [P10, h]];
      const res = r.run(label(P15, pushes([P00, gs2], ...tie)), headArgs(h));
      const i = expectLine(res, PUSH_TIME_BAD);
      expect(res.lines[i], res.out).toContain("no push later than the last push with a different protected change");
      expectNoLine(res, LABEL_PASS);
      expectFail(res);
    },
  );
});

// ---------- gate.yml static checks (AC23, AC24) ----------

const GATE_YML = readFileSync(join(ROOT, ".github", "workflows", "gate.yml"), "utf8").replace(/\r\n/g, "\n");
const YML_LINES = GATE_YML.split("\n");
const stripComment = (l: string) => l.replace(/(^|\s)#.*$/, "");

interface Step {
  name: string;
  text: string;
}
// Steps of the single job: each starts with "      - " under "steps:".
function steps(): Step[] {
  const start = YML_LINES.findIndex((l) => /^\s+steps:\s*$/.test(l));
  const out: Step[] = [];
  let cur: string[] | null = null;
  for (const l of YML_LINES.slice(start + 1)) {
    if (/^ {6}- /.test(l)) {
      if (cur) out.push(toStep(cur));
      cur = [l];
    } else if (cur) cur.push(l);
  }
  if (cur) out.push(toStep(cur));
  return out;
}
function toStep(lines: string[]): Step {
  const text = lines.join("\n");
  const m = text.match(/name:\s*(.+)/);
  return { name: m ? m[1].trim() : "", text };
}
// Shell commands of the file with backslash continuations joined, comments dropped.
function commands(text: string): string[] {
  return text
    .split("\n")
    .map(stripComment)
    .join("\n")
    .replace(/\\\n\s*/g, " ")
    .split("\n");
}

describe("gate.yml static checks (task 4b AC23, AC24)", () => {
  const all = steps();

  it("AC23: triggers on pull_request_target with all six types", () => {
    expect(GATE_YML).toMatch(/^on:\s*\n\s+pull_request_target:/m);
    const types = GATE_YML.match(/^\s+types:\s*\[([^\]]*)\]/m);
    expect(types).not.toBeNull();
    const list = (types?.[1] ?? "").split(",").map((s) => s.trim());
    for (const t of ["opened", "synchronize", "reopened", "labeled", "unlabeled", "edited"]) expect(list).toContain(t);
    expect(GATE_YML).not.toMatch(/^\s+(pull_request|push|workflow_run|workflow_dispatch):/m);
  });

  it("AC23: every permissions entry is read or none; no write anywhere", () => {
    const code = YML_LINES.map(stripComment);
    expect(code.join("\n")).not.toMatch(/write-all|read-all|:\s*write\b/);
    let found = 0;
    code.forEach((l, i) => {
      const m = l.match(/^(\s*)permissions:\s*(\S.*)?$/);
      if (!m) return;
      found++;
      expect(m[2], "permissions must be a map of scopes, not a shorthand").toBeUndefined();
      const indent = m[1].length;
      for (const next of code.slice(i + 1)) {
        if (next.trim() === "") continue;
        const ind = next.length - next.trimStart().length;
        if (ind <= indent) break;
        expect(next.trim(), `permissions entry '${next.trim()}'`).toMatch(/^[a-z-]+:\s*(read|none)$/);
      }
    });
    expect(found).toBeGreaterThan(0);
    expect(code.join("\n")).toMatch(/^\s+contents:\s*read$/m);
  });

  it("AC23: only actions/checkout, pinned to a 40-hex SHA, checks out the base (no ref, persist-credentials false)", () => {
    const uses = YML_LINES.map(stripComment).filter((l) => /^\s*-?\s*uses:/.test(l));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u.trim()).toMatch(/^(- )?uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s*$/);
    const actions = new Set(uses.map((u) => u.replace(/.*uses:\s*/, "").split("@")[0]));
    expect([...actions]).toEqual(["actions/checkout"]);
    expect(GATE_YML).not.toMatch(/^\s+ref:/m);
    expect(GATE_YML).toMatch(/^\s+persist-credentials:\s*false\s*$/m);
    expect(GATE_YML).not.toMatch(/persist-credentials:\s*true/);
  });

  it("AC23: no checkout of the PR: checkout comes before the fetch, no git checkout/switch/worktree/reset afterwards", () => {
    const iCheckout = all.findIndex((s) => /uses:\s*actions\/checkout@/.test(s.text));
    const iFetch = all.findIndex((s) => /git fetch[^\n]*refs\/pull\/[^\n]*\/head:refs\/pr\/head/.test(s.text));
    expect(iCheckout).toBeGreaterThanOrEqual(0);
    expect(iFetch).toBeGreaterThan(iCheckout);
    for (const s of all) {
      for (const c of commands(s.text)) {
        expect(c, `step '${s.name}'`).not.toMatch(/\bgit\s+(checkout|switch|worktree|reset|restore|read-tree|merge|pull|stash|archive)\b/);
      }
    }
    expect(all.filter((s) => /uses:/.test(s.text))).toHaveLength(1);
  });

  it("AC23: no step runs PR content (no bash/sh/node/npm/npx/source on refs/pr/head, no package managers)", () => {
    for (const s of all) {
      for (const c of commands(s.text)) {
        if (c.includes("refs/pr/head")) {
          expect(c, `step '${s.name}'`).not.toMatch(/\b(bash|sh|node|npm|npx|source|eval|python3?)\b|\|\s*\.|git\s+show/);
        }
        expect(c, `step '${s.name}'`).not.toMatch(/\b(npm|npx|node|yarn|pnpm)\b/);
        // Any script run with bash is the base checkout's gate-check.sh.
        const runs = c.match(/\bbash\s+(\S+)/g) ?? [];
        for (const r of runs) expect(r).toBe("bash scripts/gate-check.sh");
      }
    }
  });

  it("AC23: 'Only PRs into main' step and the head-SHA pin step stay", () => {
    const only = all.find((s) => /Only PRs into main/.test(s.name));
    expect(only, "Only PRs into main step").toBeDefined();
    expect(only?.text).toMatch(/BASE_REF:\s*\$\{\{\s*github\.base_ref\s*\}\}/);
    expect(only?.text).toMatch(/if \[ "\$BASE_REF" != "main" \]; then[\s\S]*exit 1/);
    expect(all.indexOf(only as Step)).toBe(0);

    const pin = all.find((s) => /git rev-parse refs\/pr\/head/.test(s.text));
    expect(pin, "head-SHA pin step").toBeDefined();
    expect(pin?.text).toMatch(/HEAD_SHA:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/);
    expect(pin?.text).toMatch(/if \[ "\$\(git rev-parse refs\/pr\/head\)" != "\$HEAD_SHA" \]; then[\s\S]*exit 1/);

    const gate = all.find((s) => /scripts\/gate-check\.sh/.test(s.text));
    expect(gate?.text).toMatch(/--base origin\/main --head "\$HEAD_SHA" --branch "\$BRANCH"/);
  });

  it("AC24: GH_TOKEN: github.token only in the read step; no stored secret; the Gate step gets no token", () => {
    expect(GATE_YML).not.toMatch(/secrets\./);
    expect(GATE_YML).not.toMatch(/GITHUB_TOKEN/);
    const withToken = all.filter((s) => /github\.token/.test(s.text));
    expect(withToken.map((s) => s.name)).toEqual(["Read label time and push times (GitHub API, read only)"]);
    expect(withToken[0].text).toMatch(/^\s+GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}\s*$/m);
    expect((GATE_YML.match(/github\.token/g) ?? []).length).toBe(1);
    const gate = all.find((s) => /scripts\/gate-check\.sh/.test(s.text));
    expect(commands(gate?.text ?? "").join(" ")).not.toMatch(/GH_TOKEN|token/i);
    expect(all.indexOf(withToken[0])).toBeLessThan(all.indexOf(gate as Step));
  });

  it("AC24: the read step only reads (gh api GET), from server times (labeled created_at, activity timestamp/after)", () => {
    const read = all.find((s) => /github\.token/.test(s.text));
    expect(read).toBeDefined();
    const cmds = commands(read?.text ?? "").filter((c) => /\bgh\s+api\b/.test(c));
    expect(cmds.length).toBe(2);
    for (const c of cmds) {
      expect(c).not.toMatch(/(--method|-X)\s+(POST|PUT|PATCH|DELETE)/i);
      // gh api switches to POST when fields are passed, unless --method GET is explicit.
      if (/\s(-f|-F|--field|--raw-field)\s/.test(c)) expect(c).toMatch(/--method GET/);
      expect(c).not.toMatch(/--input/);
    }
    const events = cmds.find((c) => /issues\/\$PR\/events/.test(c)) ?? "";
    expect(events).toMatch(/\.event == "labeled"/);
    expect(events).toMatch(/\.label\.name == "framework-change-approved"/);
    expect(events).toMatch(/\.created_at/);
    const activity = cmds.find((c) => /\/activity/.test(c)) ?? "";
    expect(activity).toMatch(/\.timestamp/);
    expect(activity).toMatch(/\.after/);
    expect(read?.text).not.toMatch(/author|committer|commit\.date|pushedDate/i);
  });

  it("AC24: fail closed: the read step empties its outputs first, the Gate step passes them unchanged, nothing can skip or soften the gate", () => {
    const read = all.find((s) => /github\.token/.test(s.text));
    expect(read?.text).toMatch(/: > "\$RUNNER_TEMP\/label-time"; : > "\$RUNNER_TEMP\/pushes"/);
    const gate = all.find((s) => /scripts\/gate-check\.sh/.test(s.text));
    expect(gate?.text).toMatch(/FRAMEWORK_LABEL_TIME="\$\(cat "\$RUNNER_TEMP\/label-time"\)"/);
    expect(gate?.text).toMatch(/PR_HEAD_PUSHES="\$\(cat "\$RUNNER_TEMP\/pushes"\)"/);
    expect(gate?.text).toMatch(
      /FRAMEWORK_CHANGE_APPROVED:\s*\$\{\{\s*contains\(github\.event\.pull_request\.labels\.\*\.name, 'framework-change-approved'\) && '1' \|\| '0'\s*\}\}/,
    );
    expect(gate?.text).not.toMatch(/\|\|\s*true|;\s*true\b|exit 0|set \+e/);
    expect(gate?.text).not.toMatch(/^\s+if:/m);
    expect(GATE_YML).not.toMatch(/continue-on-error/);
    // The Gate step is the job's last step, so its exit code is the check result.
    expect(all[all.length - 1]).toBe(gate);
  });
});
