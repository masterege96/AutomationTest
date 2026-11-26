// Task 4c: merge-gate spoofing stopgap (S14), retarget variant, F2. Fixture tests for scripts/gate-check.sh
// (AC1-AC21, AC24, AC28 inputs) and static checks on .github/workflows/gate.yml and the gate-check.sh header
// (AC22, AC23, AC25, AC26, AC27, AC32). Brief: tasks/4c/TASK_BRIEF.md (definitions, ACs, devops-cicd interface entry).
//
// Fixtures follow tests/integration/gate-check.test.ts (task 4b): a throwaway git repo per test in the OS temp dir
// (all removed in afterAll), fixed author/committer and dates, system/global git config ignored, no network, no
// GitHub token. Brief fixture: `main` holds this worktree's current .github/workflows/gate.yml, ci.yml, drift.yml
// (read at test time, CRLF normalised to LF, so AC1 keeps tracking main) plus app/page.tsx; branch `ci/9x-demo`
// has one code commit, then the "spoof" commit (the AC's files), then valid gates (security-gate.md, review.md).
// Unless a test says otherwise the person's label is current (4b inputs set so the protected-path rule PASSes:
// one push of the head at T1, label at T2), so any FAIL comes from the spoof check.
// Only the given paths are staged per commit (`git add -A -- <paths>`), so index-only entries made with
// `git update-index --cacheinfo` (symlinks, submodules) survive the gates commits.
// A gate-check run takes ~10 s on Windows, so the fixture tests run concurrently (Vitest's default limit of 5)
// with async child processes and a generous timeout.
// On Windows, Git Bash is called explicitly (%ProgramFiles%\Git\bin\bash.exe); elsewhere `bash`. git must be on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "gate-check.sh").split("\\").join("/");
const BASH =
  process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe") : "bash";
const BRANCH = "ci/9x-demo";
const TIMEOUT = 1_200_000; // batched runs read ~20 files; a loaded Windows PC needs ~15 s per file
const T1 = "2026-11-25T11:00:00Z";
const T2 = "2026-11-25T12:00:00Z";

const readLF = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");
const WF_GATE = readLF(".github", "workflows", "gate.yml");
const WF_CI = readLF(".github", "workflows", "ci.yml");
const WF_DRIFT = readLF(".github", "workflows", "drift.yml");

// Output lines (brief "Output" definition and the devops-cicd interface entry).
const SEC_PASS = "  PASS  specs/9x/security-gate.md: PASS";
const REV_PASS = "  PASS  specs/9x/review.md: APPROVE";
const SPOOF_PASS = "  PASS  merge-gate spoofing: no workflow at the head can report merge-gate";
const SPOOF_ANY = "  FAIL  merge-gate spoofing:";
const spoofFail = (path: string) => `  FAIL  merge-gate spoofing: ${path}: `;
const B1 = "contains the text 'merge-gate'";
const B2 = "grants write access to checks or statuses";
const B3 = "leaves the token permissions to the repo default";
const UNSAFE = "can't be read safely";
const LINK = "is a symlink or submodule";
const NOT_EXEMPT = "changed gate.yml has a trigger other than pull_request_target";
const NO_LABEL = "  FAIL  pipeline/framework files changed without the person's 'framework-change-approved' label:";
const LABEL_PASS = "  PASS  pipeline/framework files changed, approved by the person";
const BASE_PASS = "  PASS  PR base is main";
const BASE_FAIL = "  FAIL  PR base is not main";

let scratch = "";
let globalCfg = "";
const created: string[] = [];

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "gate-spoof-cfg-"));
  globalCfg = join(scratch, "gitconfig");
  writeFileSync(globalCfg, "");
});
afterAll(() => {
  for (const d of created.splice(0)) rmSync(d, { recursive: true, force: true });
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(GIT_|FRAMEWORK_|PR_CURRENT_)|^(PR_HEAD_PUSHES|GITHUB_HEAD_REF|GITHUB_BASE_REF)$/i.test(k)) delete env[k];
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

type Files = Record<string, string | Buffer | null>;
interface Result {
  code: number;
  out: string;
  lines: string[];
}

class Repo {
  readonly dir: string;
  private tick = 0;

  constructor(mainFiles: Files) {
    this.dir = mkdtempSync(join(tmpdir(), "gate-spoof-"));
    created.push(this.dir);
    this.git(["init", "-q", "-b", "main"]);
    this.git(["config", "core.autocrlf", "false"]);
    this.git(["config", "core.symlinks", "false"]);
    this.git(["config", "commit.gpgsign", "false"]);
    this.commit("main: initial", mainFiles);
  }

  private dates(): Record<string, string> {
    const d = `@${1577836800 + ++this.tick * 60} +0000`;
    return { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d };
  }

  git(args: string[], input?: string): string {
    return execFileSync("git", args, {
      cwd: this.dir,
      env: { ...cleanEnv(), ...this.dates() },
      encoding: "utf8",
      input: input ?? "",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
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

  // Writes the files and stages exactly those paths (deletions included), then commits.
  commit(msg: string, files: Files): string {
    this.write(files);
    const paths = Object.keys(files);
    if (paths.length) this.git(["add", "-A", "--", ...paths]);
    this.git(["commit", "-q", "--allow-empty", "-m", msg]);
    return this.sha();
  }

  // Commits an index-only entry (mode 120000 symlink or 160000 gitlink) at path, after removing `removeFirst`
  // from the index. The working tree is not touched.
  commitEntry(msg: string, mode: "120000" | "160000", path: string, target: string, removeFirst?: string): string {
    if (removeFirst) this.git(["rm", "-r", "-q", "--cached", "--", removeFirst]);
    const obj = mode === "120000" ? this.git(["hash-object", "-w", "--stdin"], target) : target;
    this.git(["update-index", "--add", "--cacheinfo", `${mode},${obj},${path}`]);
    this.git(["commit", "-q", "-m", msg]);
    return this.sha();
  }

  sha(ref = "HEAD"): string {
    return this.git(["rev-parse", ref]);
  }

  checkout(args: string[]): void {
    this.git(["checkout", "-q", ...args]);
  }

  gates(): string {
    this.commit("docs: security gate", { "specs/9x/security-gate.md": "Result: PASS\n\nsecurity notes\n" });
    return this.commit("docs: review", { "specs/9x/review.md": "Result: APPROVE\n\nreview notes\n" });
  }

  // The 4b label inputs, current for the head: one push of the head at T1, label applied at T2.
  labelNow(head = this.sha()): Record<string, string> {
    return { FRAMEWORK_CHANGE_APPROVED: "1", FRAMEWORK_LABEL_TIME: T2, PR_HEAD_PUSHES: `${T1} ${head}` };
  }

  run(env: Record<string, string | undefined> = {}, head = this.sha()): Promise<Result> {
    const fullEnv = cleanEnv();
    for (const [k, v] of Object.entries(env)) if (v !== undefined) fullEnv[k] = v;
    return new Promise((resolve, reject) => {
      const child = spawn(BASH, [SCRIPT, "--base", "main", "--head", head, "--branch", BRANCH], {
        cwd: this.dir,
        env: fullEnv,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => {
        const so = stdout.replace(/\r\n/g, "\n");
        resolve({ code: code ?? -1, out: `${so}${stderr}`, lines: so.split("\n").filter((l) => l !== "") });
      });
    });
  }
}

const MAIN_FILES: Files = {
  ".github/workflows/gate.yml": WF_GATE,
  ".github/workflows/ci.yml": WF_CI,
  ".github/workflows/drift.yml": WF_DRIFT,
  "app/page.tsx": "export default function Page() {\n  return null;\n}\n",
};

// Brief fixture: main (+ extra main files), branch with a code commit, the spoof commit (if any), valid gates.
function spoofRepo(spoof: Files = {}, mainExtra: Files = {}): Repo {
  const r = new Repo({ ...MAIN_FILES, ...mainExtra });
  r.checkout(["-b", BRANCH]);
  r.commit("feat: feature", { "app/feature.ts": "export const feature = 1;\n" });
  if (Object.keys(spoof).length) r.commit("ci: workflow change", spoof);
  r.gates();
  return r;
}

// Runs the brief fixture with `spoof` and the label current.
async function runSpoof(spoof: Files, env: Record<string, string> = {}): Promise<Result> {
  const r = spoofRepo(spoof);
  return r.run({ ...r.labelNow(), ...env });
}

// One gate-check run shared by several tests: the fixture head holds one workflow file per case, and each test
// asserts the lines for its own path (gate-check judges every workflow file on its own; the last line and exit
// code are shared, so a batch holds only cases with the same expected overall result). Saves ~10-40 s of
// process start-up per case on Windows. Built on first use, inside a test, under the test timeout.
function shared(spoof: () => Files, env: Record<string, string> = {}): () => Promise<Result> {
  let p: Promise<Result> | undefined;
  return () => (p ??= runSpoof(spoof(), env));
}
const casePath = (prefix: string, i: number) => `.github/workflows/${prefix}${String(i).padStart(2, "0")}.yml`;
// A batch of cases expected to PASS: no FAIL line for this path, spoof PASS line, gate-check: PASS.
function expectNoSpoofFor(r: Result, path: string): void {
  expect(spoofLines(r, path), r.out).toEqual([]);
  expectNoSpoof(r);
  expectPass(r);
}

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
function expectLine(r: Result, prefix: string): string {
  const l = r.lines.find((x) => x.startsWith(prefix));
  expect(l, `expected a line starting with ${JSON.stringify(prefix)} in:\n${r.out}`).toBeDefined();
  return l ?? "";
}
function expectNoLine(r: Result, prefix: string): void {
  expect(
    r.lines.some((l) => l.startsWith(prefix)),
    `expected no line starting with ${JSON.stringify(prefix)} in:\n${r.out}`,
  ).toBe(false);
}
// FAIL line(s) for the path; when `reason` is given, one of them contains it.
function spoofLines(r: Result, path: string): string[] {
  return r.lines.filter((l) => l.startsWith(spoofFail(path)));
}
function expectSpoof(r: Result, path: string, reason?: string): void {
  const ls = spoofLines(r, path);
  expect(ls.length, `expected a ${JSON.stringify(spoofFail(path))} line in:\n${r.out}`).toBeGreaterThan(0);
  if (reason) expect(ls.some((l) => l.includes(reason)), `expected reason ${JSON.stringify(reason)} in:\n${r.out}`).toBe(true);
  expectNoLine(r, SPOOF_PASS);
  expectFail(r);
}
// S14-A (or "can't be read safely"): a FAIL line for the path that is not the B1 text line, so the result
// doesn't rest on B1 alone.
function expectSpoofNotB1(r: Result, path: string): void {
  expectSpoof(r, path);
  const ls = spoofLines(r, path).filter((l) => !l.includes(B1));
  expect(ls.length, `expected a non-B1 FAIL line for ${path} in:\n${r.out}`).toBeGreaterThan(0);
}
function expectNoSpoof(r: Result): void {
  expectNoLine(r, SPOOF_ANY);
  expectLine(r, SPOOF_PASS);
}

// ---------- workflow texts ----------

const HEAD_PR = "name: x\non: pull_request\npermissions: {}\n";
const BODY = "    runs-on: ubuntu-24.04\n    steps:\n      - run: echo hi\n";
const job = (id: string, extra = "") => `  ${id}:\n${extra}${BODY}`;
const wf = (jobs: string, head = HEAD_PR) => `${head}jobs:\n${jobs}`;
const JOB_MG = wf(job("merge-gate"));
const X = ".github/workflows/x.yml";
const lineOf = (text: string, re: RegExp) => text.split("\n").findIndex((l) => re.test(l)) + 1;
const toCRLF = (s: string) => s.replace(/\n/g, "\r\n");
const withBOM = (s: string) => `\uFEFF${s}`;

// AC4 spellings: each defines a job with id or name merge-gate in a way GitHub accepts.
const SPELLINGS: [string, string][] = [
  ['job id "merge-gate" (double quotes)', wf(job('"merge-gate"'))],
  ["job id 'merge-gate' (single quotes)", wf(job("'merge-gate'"))],
  ["job id Merge-Gate", wf(job("Merge-Gate"))],
  ["job id MERGE-GATE", wf(job("MERGE-GATE"))],
  ['name: "merge-gate"', wf(job("build", '    name: "merge-gate"\n'))],
  ["name: 'merge-gate'", wf(job("build", "    name: 'merge-gate'\n"))],
  ["name: Merge-Gate", wf(job("build", "    name: Merge-Gate\n"))],
  ["name: MERGE-GATE", wf(job("build", "    name: MERGE-GATE\n"))],
  ["name:   merge-gate   (extra spaces)", wf(job("build", "    name:   merge-gate   \n"))],
  ["name: merge-gate # comment", wf(job("build", "    name: merge-gate # comment\n"))],
  ['"name": merge-gate (quoted key)', wf(job("build", '    "name": merge-gate\n'))],
  ["name : merge-gate (space before the colon)", wf(job("build", "    name : merge-gate\n"))],
  ['name: "merge\\x2dgate" (escape)', wf(job("build", '    name: "merge\\x2dgate"\n'))],
  ['name: "\\u006derge-gate" (escape)', wf(job("build", '    name: "\\u006derge-gate"\n'))],
  ['name: "\\x67ate" (escape for gate, no merge-gate text)', wf(job("build", '    name: "\\x67ate"\n'))],
  ["name: >- block scalar", wf(job("build", "    name: >-\n      merge-gate\n"))],
  ["name: | block scalar", wf(job("build", "    name: |\n      merge-gate\n"))],
  ["anchor on job id merge-gate: &j, second job <<: *j", wf(`  merge-gate: &j\n${BODY}  build:\n    <<: *j\n`)],
  ["name via alias *n (&n merge-gate elsewhere)", wf(job("build", "    name: *n\n"), `${HEAD_PR}env:\n  N: &n merge-gate\n`)],
  ["flow mapping jobs: { merge-gate: {...} }", `${HEAD_PR}jobs: { merge-gate: { runs-on: ubuntu-24.04, steps: [ { run: echo hi } ] } }\n`],
  ["flow job build: { name: merge-gate, ... }", wf("  build: { name: merge-gate, runs-on: ubuntu-24.04, steps: [ { run: echo hi } ] }\n")],
  ["explicit key ? merge-gate", wf(`  ? merge-gate\n  : runs-on: ubuntu-24.04\n    steps:\n      - run: echo hi\n`)],
];
const VARIANTS: [string, (s: string) => string][] = [
  ["LF", (s) => s],
  ["CRLF", toCRLF],
  ["UTF-8 BOM", withBOM],
];
// One batched run per variant (LF, CRLF, BOM), each file s<NN>.yml one spelling.
const SPELL_RUNS = VARIANTS.map(([, f]) => shared(() => Object.fromEntries(SPELLINGS.map(([, t], i) => [casePath("s", i), f(t)]))));
const SPELLING_CASES = SPELLINGS.flatMap(([n], i) => VARIANTS.map(([v], k) => [`${n} [${v}]`, i, k] as [string, number, number]));

// Changed workflow files that must all pass (AC6, AC12, AC19, AC20 negatives): one batched run.
const PR_HEAD = (perms: string) => `name: y\non: pull_request\n${perms}`;
const OK_CASES: [string, string][] = [
  ["AC6: job id build with a matrix and no name:", wf("  build:\n    strategy:\n      matrix:\n        n: [a, b]\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo ${{ matrix.n }}\n")],
  ["AC12: job build with a step 'name: check gate config'", "name: y\non: pull_request\npermissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: check gate config\n        run: echo ok\n"],
  ["AC19 (B2): contents: read, pull-requests: read, issues: write", wf(job("build"), PR_HEAD("permissions:\n  contents: read\n  pull-requests: read\n  issues: write\n"))],
  ["AC20 (B3): permissions: {} at the workflow level", wf(job("build"), PR_HEAD("permissions: {}\n"))],
  ["AC20 (B3): permissions: read-all at the workflow level", wf(job("build"), PR_HEAD("permissions: read-all\n"))],
  ["AC20 (B3): no workflow-level permissions, every job has its own", wf(job("a", "    permissions:\n      contents: read\n") + job("b", "    permissions: {}\n"), PR_HEAD(""))],
];
const OK_RUN = shared(() => Object.fromEntries(OK_CASES.map(([, t], i) => [casePath("ok", i), t])));

// ---------- S14-A: job identity ----------

describe.concurrent("gate-check.sh merge-gate spoofing, S14-A job identity (task 4c AC1-AC12)", () => {
  it("AC1 + AC13 + AC21a: main's unchanged gate.yml, ci.yml, drift.yml -> spoof PASS line, no FAIL for gate.yml or ci.yml, PASS", { timeout: TIMEOUT }, async () => {
    const r = spoofRepo();
    const res = await r.run(r.labelNow());
    expectLine(res, SEC_PASS);
    expectLine(res, REV_PASS);
    expectNoSpoof(res);
    expectNoLine(res, spoofFail(".github/workflows/gate.yml"));
    expectNoLine(res, spoofFail(".github/workflows/ci.yml"));
    expectPass(res);
  });

  it("AC1: the same baseline without any label input -> PASS (no protected change)", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo().run();
    expectNoSpoof(res);
    expectPass(res);
  });

  // AC2, AC3 (and AC5, AC6 reserved-with-matrix): one batched run, one file per case.
  const RESERVED: [string, string, string][] = [
    ["AC2: job id merge-gate", JOB_MG, "job id 'merge-gate' is a reserved check name"],
    ["AC2: job id gate", wf(job("gate")), "job id 'gate' is a reserved check name"],
    ["AC3: job build named merge-gate", wf(job("build", "    name: merge-gate\n")), "job 'build' is named 'merge-gate', a reserved check name"],
    ["AC3: job build named gate", wf(job("build", "    name: gate\n")), "job 'build' is named 'gate', a reserved check name"],
    ["AC5: name: ${{ matrix.n }} with matrix n: [merge-gate]", wf(job("build", "    name: ${{ matrix.n }}\n    strategy:\n      matrix:\n        n: [merge-gate]\n")), "job 'build' name contains a ${{ }} expression"],
    ["AC5: name: build-${{ github.run_id }} (harmless value, fails closed)", wf(job("build", "    name: build-${{ github.run_id }}\n")), "job 'build' name contains a ${{ }} expression"],
    ["AC6: job id merge-gate with a matrix", wf(job("merge-gate", "    strategy:\n      matrix:\n        n: [a, b]\n")), "job id 'merge-gate' is a reserved check name"],
  ];
  const RESERVED_RUN = shared(() => Object.fromEntries(RESERVED.map(([, t], i) => [casePath("r", i), t])));
  it.each(RESERVED.map(([n, , reason], i) => [n, i, reason] as [string, number, string]))(
    "%s -> FAIL naming its file with the S14-A reason, exit 1",
    { timeout: TIMEOUT },
    async (_n, i, reason) => {
      expectSpoof(await RESERVED_RUN(), casePath("r", i), reason);
    },
  );

  it("AC2/AC3: S14-A also applies to UNCHANGED workflow files (job id merge-gate, job name Gate already on main) -> FAIL, no B1 line", { timeout: TIMEOUT }, async () => {
    const a = casePath("u", 0);
    const b = casePath("u", 1);
    const r = spoofRepo({}, { [a]: JOB_MG, [b]: wf(job("build", "    name: Gate\n")) });
    const res = await r.run(r.labelNow());
    expectSpoof(res, a, "job id 'merge-gate' is a reserved check name");
    expectSpoof(res, b, "job 'build' is named 'gate', a reserved check name");
    expect(res.lines.some((l) => l.includes(B1)), res.out).toBe(false);
  });

  it.each(SPELLING_CASES)("AC4: %s -> FAIL naming its file (not only the B1 text line), exit 1", { timeout: TIMEOUT }, async (_n, i, k) => {
    expectSpoofNotB1(await SPELL_RUNS[k](), casePath("s", i));
  });

  it.each(OK_CASES.map(([n], i) => [n, i] as [string, number]))("%s -> no spoof FAIL for it, PASS", { timeout: TIMEOUT }, async (_n, i) => {
    const res = await OK_RUN();
    expectNoSpoofFor(res, casePath("ok", i));
    expectLine(res, LABEL_PASS);
  });

  const UNREADABLE: [string, string | Buffer][] = [
    ["a second YAML document (--- after content)", `${wf(job("build"))}---\njobs:\n  gate:\n${BODY}`],
    ["a ... document end marker", `${wf(job("build"))}...\n`],
    ["tab indentation inside jobs:", `${HEAD_PR}jobs:\n\tgate:\n\t\truns-on: ubuntu-24.04\n`],
    ["a tag on a job name (!!str gate)", wf(job("build", "    name: !!str gate\n"))],
    ["a tag on a job key (!!str gate:)", wf(job("!!str gate"))],
    ["duplicate job name: keys (ok, then gate)", wf(job("build", "    name: ok\n    name: gate\n"))],
    ["duplicate jobs: keys", `${wf(job("build"))}jobs:\n${job("gate")}`],
    ["invalid UTF-8", Buffer.concat([Buffer.from(wf(job("build"))), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])])],
    ["a YAML directive", `%YAML 1.2\n---\n${wf(job("build"))}`],
  ];
  const UNREADABLE_RUN = shared(() => Object.fromEntries(UNREADABLE.map(([, t], i) => [casePath("q", i), t])));
  it.each(UNREADABLE.map(([n], i) => [n, i] as [string, number]))("AC7: %s -> FAIL 'can't be read safely', exit 1", { timeout: TIMEOUT }, async (_n, i) => {
    expectSpoof(await UNREADABLE_RUN(), casePath("q", i), UNSAFE);
  });

  const FOUND = [".github/workflows/x.yaml", ".github/workflows/X.YML", ".github/workflows/sub/x.yml"];
  const FOUND_RUN = shared(() => Object.fromEntries(FOUND.map((p) => [p, JOB_MG])));
  it.each(FOUND)("AC8: the AC2 job in %s -> FAIL naming that path, exit 1", { timeout: TIMEOUT }, async (path) => {
    expectSpoof(await FOUND_RUN(), path, "job id 'merge-gate' is a reserved check name");
  });

  const NOT_WF = [".github/x.yml", "docs/x.yml", ".github/workflows/x.yml.txt"];
  const NOT_WF_RUN = shared(() => Object.fromEntries(NOT_WF.map((p) => [p, JOB_MG])));
  it.each(NOT_WF)("AC8: the AC2 job in %s (not a workflow file) -> no spoof FAIL, PASS with the label current", { timeout: TIMEOUT }, async (path) => {
    expectNoSpoofFor(await NOT_WF_RUN(), path);
  });

  it("AC9: .github/workflows/x.yml committed as a symlink (mode 120000) -> FAIL, exit 1", { timeout: TIMEOUT }, async () => {
    const r = new Repo(MAIN_FILES);
    r.checkout(["-b", BRANCH]);
    r.commit("feat: feature", { "app/feature.ts": "export const feature = 1;\n" });
    r.commitEntry("ci: link", "120000", X, "gate.yml");
    r.gates();
    expect(r.git(["ls-tree", "HEAD", X])).toMatch(/^120000 blob /);
    const res = await r.run(r.labelNow());
    expectSpoof(res, X, LINK);
  });

  it.each([
    ["a symlink", "120000", ".github/workflows"],
    ["a submodule", "160000", ".github/workflows"],
    ["a symlink (.github itself)", "120000", ".github"],
  ] as [string, "120000" | "160000", string][])(
    "AC9: %s at %s on the head -> FAIL, exit 1",
    { timeout: TIMEOUT },
    async (_n, mode, path) => {
      const r = new Repo(MAIN_FILES);
      const mainSha = r.sha();
      r.checkout(["-b", BRANCH]);
      r.commit("feat: feature", { "app/feature.ts": "export const feature = 1;\n" });
      r.commitEntry("ci: replace dir", mode, path, mode === "120000" ? "../elsewhere" : mainSha, path);
      r.gates();
      expect(r.git(["ls-tree", "HEAD", path])).toMatch(new RegExp(`^${mode} `));
      const res = await r.run(r.labelNow());
      expectSpoof(res, path, LINK);
    },
  );

  it("AC10: working tree checked out at main, --head = a commit with a spoof file -> FAIL; the checker writes nothing", { timeout: TIMEOUT }, async () => {
    const r = spoofRepo({ [X]: JOB_MG });
    const head = r.sha();
    r.checkout(["main"]);
    const before = [r.sha(), r.git(["status", "--porcelain", "--untracked-files=all"])];
    const res = await r.run(r.labelNow(head), head);
    expectSpoof(res, X, "job id 'merge-gate' is a reserved check name");
    expect([r.sha(), r.git(["status", "--porcelain", "--untracked-files=all"])]).toEqual(before);
    expect(r.git(["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
  });

  it("AC10: clean head, spoof only uncommitted (tracked ci.yml edited) and untracked (x.yml) in the working tree -> no spoof FAIL, PASS", { timeout: TIMEOUT }, async () => {
    const r = spoofRepo();
    r.write({ [X]: JOB_MG, ".github/workflows/ci.yml": `${WF_CI}${job("merge-gate")}` });
    expect(r.git(["status", "--porcelain", "--untracked-files=all"])).toContain("?? .github/workflows/x.yml");
    const before = r.git(["status", "--porcelain", "--untracked-files=all"]);
    const res = await r.run(r.labelNow());
    expectNoSpoof(res);
    expectPass(res);
    expect(r.git(["status", "--porcelain", "--untracked-files=all"])).toBe(before);
  });

  it("AC11: spoof file with the person's label current (4b label rule PASSes) -> spoof FAIL, gate-check: FAIL", { timeout: TIMEOUT }, async () => {
    const res = await RESERVED_RUN(); // the AC2/AC3 batch runs with the label current
    expectLine(res, LABEL_PASS);
    expectSpoof(res, casePath("r", 0), "job id 'merge-gate' is a reserved check name");
  });

  it("AC11 + F2: label rescue with every gate.yml input current (labels list has the label, base main) doesn't save a spoof", { timeout: TIMEOUT }, async () => {
    const res = await runSpoof({ [X]: wf(job("gate")) }, { PR_CURRENT_LABELS: "framework-change-approved\n", PR_CURRENT_BASE: "main" });
    expectLine(res, LABEL_PASS);
    expectLine(res, BASE_PASS);
    expectSpoof(res, X, "job id 'gate' is a reserved check name");
  });
});

// ---------- the exempt gate file ----------

// gate.yml with extra triggers inserted at the top of its on: block.
const gateWith = (insert: string) => {
  if (!WF_GATE.includes("\non:\n  pull_request_target:\n")) throw new Error("gate.yml's on: block changed: update gateWith");
  return WF_GATE.replace("\non:\n  pull_request_target:\n", `\non:\n${insert}  pull_request_target:\n`);
};
const GATE = ".github/workflows/gate.yml";
// The always-pass gate.yml a side branch could carry (AC24).
const ALWAYS_PASS = (on: string) =>
  `name: gate\non:\n${on}permissions:\n  contents: read\njobs:\n  merge-gate:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: exit 0\n`;

describe.concurrent("gate-check.sh merge-gate spoofing, the exempt gate file (task 4c AC13-AC17, AC24)", () => {
  it("AC14: a copy of main's gate.yml added as gate2.yml -> FAIL naming gate2.yml, exit 1", { timeout: TIMEOUT }, async () => {
    const res = await runSpoof({ ".github/workflows/gate2.yml": WF_GATE });
    expectSpoof(res, ".github/workflows/gate2.yml", "job id 'merge-gate' is a reserved check name");
    expectNoLine(res, spoofFail(GATE));
  });

  it("AC14: gate.yml renamed to merge.yml -> FAIL naming merge.yml, exit 1", { timeout: TIMEOUT }, async () => {
    const res = await runSpoof({ [GATE]: null, ".github/workflows/merge.yml": WF_GATE });
    expectSpoof(res, ".github/workflows/merge.yml", "job id 'merge-gate' is a reserved check name");
  });

  it.each([
    ["pull_request", gateWith("  pull_request:\n")],
    ["push", gateWith("  push:\n")],
    ["workflow_dispatch", gateWith("  workflow_dispatch:\n")],
    ["on: pull_request_target, pull_request (flow list)", WF_GATE.replace(/\non:\n {2}pull_request_target:\n(?: {4}.*\n)+/, "\non: [pull_request_target, pull_request]\n")],
  ])("AC15: changed gate.yml that also triggers on %s -> FAIL naming gate.yml (not exempt), label current", { timeout: TIMEOUT }, async (_n, text) => {
    expect(text).not.toBe(WF_GATE);
    const res = await runSpoof({ [GATE]: text });
    expectLine(res, LABEL_PASS);
    expectSpoof(res, GATE, NOT_EXEMPT);
    expectSpoof(res, GATE, "job id 'merge-gate' is a reserved check name");
  });

  it("AC15: changed gate.yml with pull_request and NO label -> spoof FAIL as well as the 4b no-label FAIL", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo({ [GATE]: gateWith("  pull_request:\n") }).run();
    expectLine(res, NO_LABEL);
    expectSpoof(res, GATE, NOT_EXEMPT);
  });

  it("AC15: changed gate.yml whose triggers come through an anchor (on: &t) -> FAIL naming gate.yml", { timeout: TIMEOUT }, async () => {
    const text = WF_GATE.replace("\non:\n", "\non: &t\n");
    expect(text).not.toBe(WF_GATE);
    const res = await runSpoof({ [GATE]: text });
    expectSpoof(res, GATE);
  });

  it("AC16: gate.yml changed only by a comment line, pull_request_target only, no label -> no spoof FAIL; 4b no-label FAIL lists it", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo({ [GATE]: `${WF_GATE}# a comment line\n` }).run();
    expectNoSpoof(res);
    expectLine(res, NO_LABEL);
    expect(res.lines.map((l) => l.trim()), res.out).toContain(GATE);
    expectFail(res);
  });

  it("AC16: the same comment-only gate.yml change with the label current -> PASS", { timeout: TIMEOUT }, async () => {
    const res = await runSpoof({ [GATE]: `${WF_GATE}# a comment line\n` });
    expectNoSpoof(res);
    expectLine(res, LABEL_PASS);
    expectPass(res);
  });

  it("AC17: main changed gate.yml after the branch was cut (head has the old prt-only copy, net change doesn't touch it) -> PASS, no label", { timeout: TIMEOUT }, async () => {
    const r = new Repo(MAIN_FILES);
    r.checkout(["-b", BRANCH]);
    r.commit("feat: feature", { "app/feature.ts": "export const feature = 1;\n" });
    r.gates();
    r.checkout(["main"]);
    r.commit("main: gate.yml moves on", { [GATE]: `${WF_GATE}# main's newer gate.yml\n` });
    r.checkout([BRANCH]);
    expect(r.git(["rev-parse", `HEAD:${GATE}`])).not.toBe(r.git(["rev-parse", `main:${GATE}`]));
    const res = await r.run();
    expectNoSpoof(res);
    expectNoLine(res, "  FAIL  pipeline/framework");
    expectPass(res);
  });

  it("AC24: head's gate.yml replaced by an always-pass version that also triggers on pull_request -> FAIL naming gate.yml", { timeout: TIMEOUT }, async () => {
    const res = await runSpoof({ [GATE]: ALWAYS_PASS("  pull_request:\n  pull_request_target:\n") });
    expectSpoof(res, GATE, NOT_EXEMPT);
  });

  it("AC24: always-pass gate.yml with pull_request_target only, no label -> 4b no-label FAIL (spoof check PASSes, Q1)", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo({ [GATE]: ALWAYS_PASS("  pull_request_target:\n") }).run();
    expectNoSpoof(res);
    expectLine(res, NO_LABEL);
    expectFail(res);
  });
});

// ---------- S14-B: changed workflow files that could report a check ----------

describe.concurrent("gate-check.sh merge-gate spoofing, S14-B (task 4c AC18-AC21)", () => {
  // [name, file text, expected reason ("" = any FAIL line), the only FAIL line for the file?]. One batched run.
  const b1 = (n: string, text: string): [string, string, string, boolean] => [
    `AC18 (B1): merge-gate in ${n}`,
    text,
    `${B1} (line ${lineOf(text, /merge-gate/i)})`,
    true, // B1 only: no reserved job, permissions: {} set
  ];
  const b2 = (n: string, text: string, reason = B2): [string, string, string, boolean] => [`AC19 (B2): permissions ${n}`, text, reason, false];
  const SB_CASES: [string, string, string, boolean][] = [
    b1("a step name:", wf(`  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: merge-gate\n        run: echo hi\n`)),
    b1("a run: line posting a status", wf(`  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: gh api repos/o/r/statuses/$SHA -f state=success -f context=merge-gate\n`)),
    b1("an action input name:", wf(`  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: some/action@0123456789abcdef0123456789abcdef01234567\n        with:\n          name: merge-gate\n`)),
    b1("an env: value", wf(job("build", "    env:\n      CHECK: merge-gate\n"))),
    b1("a comment (# Merge-Gate, mixed case)", `# Merge-Gate report\n${wf(job("build"))}`),
    b2("checks: write", wf(job("build"), PR_HEAD("permissions:\n  contents: read\n  checks: write\n"))),
    b2("statuses: write", wf(job("build"), PR_HEAD("permissions:\n  statuses: write\n"))),
    b2("write-all", wf(job("build"), PR_HEAD("permissions: write-all\n"))),
    b2("WRITE-ALL", wf(job("build"), PR_HEAD("permissions: WRITE-ALL\n"))),
    b2('"write-all"', wf(job("build"), PR_HEAD('permissions: "write-all"\n'))),
    b2("checks: 'write'", wf(job("build"), PR_HEAD("permissions:\n  checks: 'write'\n"))),
    b2("Statuses: WRITE", wf(job("build"), PR_HEAD("permissions:\n  Statuses: WRITE\n"))),
    b2('flow { contents: read, "checks": write }', wf(job("build"), PR_HEAD('permissions: { contents: read, "checks": write }\n'))),
    b2("job-level statuses: write", wf(job("build", "    permissions:\n      statuses: write\n"), PR_HEAD("permissions: {}\n"))),
    b2("job-level flow { checks: write }", wf(job("build", "    permissions: { checks: write }\n"), PR_HEAD("permissions: {}\n"))),
    b2('quoted key "checks": write (block)', wf(job("build"), PR_HEAD('permissions:\n  "checks": write\n')), ""),
    [
      "AC20 (B3): no workflow-level permissions, the only job has none",
      wf(job("build"), PR_HEAD("")),
      `${B3} (no workflow-level permissions:, job 'build' has none)`,
      true,
    ],
    [
      "AC20 (B3): no workflow-level permissions, job a has its own, job b has none",
      wf(job("a", "    permissions:\n      contents: read\n") + job("b"), PR_HEAD("")),
      "job 'b' has none",
      true,
    ],
  ];
  const SB_RUN = shared(() => Object.fromEntries(SB_CASES.map(([, t], i) => [casePath("b", i), t])));
  it.each(SB_CASES.map(([n, , reason, only], i) => [n, i, reason, only] as [string, number, string, boolean]))(
    "%s -> FAIL naming its file with the reason, exit 1",
    { timeout: TIMEOUT },
    async (_n, i, reason, only) => {
      const res = await SB_RUN();
      const p = casePath("b", i);
      expectSpoof(res, p, reason || undefined);
      if (only) expect(spoofLines(res, p), res.out).toHaveLength(1);
    },
  );

  it("AC21: ci.yml changed only by an extra comment line -> B1 FAIL for ci.yml on its existing merge-gate line", { timeout: TIMEOUT }, async () => {
    const ci = ".github/workflows/ci.yml";
    const line = lineOf(WF_CI, /merge-gate/i);
    expect(line).toBeGreaterThan(0);
    const res = await runSpoof({ [ci]: `${WF_CI}# an extra comment line\n` });
    expectSpoof(res, ci, `${B1} (line ${line})`);
  });
});

// ---------- F2 and retarget inputs (PR_CURRENT_LABELS, PR_CURRENT_BASE) ----------

const PROT: Files = { "scripts/x.sh": "#!/usr/bin/env bash\necho x\n" };
const MANY = Array.from({ length: 150 }, (_, i) => `label-${String(i).padStart(3, "0")}`);

describe.concurrent("gate-check.sh current labels and base from the API (task 4c F2 AC26-AC29 inputs, AC23)", () => {
  it.each([
    ["the label among others, CRLF and blank lines", "bug\r\n\r\nframework-change-approved\r\nci\r\n"],
    ["paginated (150 labels, the label after the first 100)", [...MANY.slice(0, 120), "framework-change-approved", ...MANY.slice(120)].join("\n")],
  ])("F2: PR_CURRENT_LABELS with %s and the 4b label inputs current -> label PASS", { timeout: TIMEOUT }, async (_n, labels) => {
    const res = await runSpoof(PROT, { PR_CURRENT_LABELS: labels });
    expectLine(res, LABEL_PASS);
    expectNoSpoof(res);
    expectPass(res);
  });

  it.each([
    ["empty (the person removed every label)", ""],
    ["only other labels", "bug\nci\n"],
    ["paginated without the label (150 labels)", MANY.join("\n")],
    ["near misses only", "framework-change-approved-x\n framework-change-approved\nFramework-Change-Approved\n"],
  ])("F2 (AC29 offline): PR_CURRENT_LABELS %s, old label inputs still say approved -> 4b no-label FAIL", { timeout: TIMEOUT }, async (_n, labels) => {
    const res = await runSpoof(PROT, { PR_CURRENT_LABELS: labels });
    expectLine(res, NO_LABEL);
    expectNoLine(res, LABEL_PASS);
    expectFail(res);
  });

  it("F2: label in PR_CURRENT_LABELS but FRAMEWORK_CHANGE_APPROVED=0 -> no-label FAIL (both are required)", { timeout: TIMEOUT }, async () => {
    const res = await runSpoof(PROT, { FRAMEWORK_CHANGE_APPROVED: "0", PR_CURRENT_LABELS: "framework-change-approved" });
    expectLine(res, NO_LABEL);
    expectFail(res);
  });

  it("F2: PR_CURRENT_LABELS is only consulted when protected paths changed (set to '' on a code-only PR -> PASS)", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo().run({ PR_CURRENT_LABELS: "" });
    expectNoLine(res, "  FAIL  pipeline/framework");
    expectPass(res);
  });

  it("AC23: PR_CURRENT_BASE=main -> base PASS line, PASS", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo().run({ PR_CURRENT_BASE: "main" });
    expectLine(res, BASE_PASS);
    expectPass(res);
  });

  it.each([
    ["side (retargeted away from main)", "side"],
    ["empty", ""],
    ["two lines", "main\nside"],
    ["Main (case)", "Main"],
    ["main with a trailing space", "main "],
  ])("AC23: PR_CURRENT_BASE %s on a code-only PR -> FAIL 'PR base is not main', exit 1", { timeout: TIMEOUT }, async (_n, base) => {
    const res = await spoofRepo().run({ PR_CURRENT_BASE: base });
    expectLine(res, BASE_FAIL);
    expectNoLine(res, BASE_PASS);
    expectFail(res);
  });

  it("AC23/AC28: PR_CURRENT_BASE unset -> no base line (4b behaviour)", { timeout: TIMEOUT }, async () => {
    const res = await spoofRepo().run();
    expectNoLine(res, BASE_PASS);
    expectNoLine(res, BASE_FAIL);
    expectPass(res);
  });
});

// ---------- static checks: gate.yml and the gate-check.sh header ----------

const YML_LINES = WF_GATE.split("\n");
const stripComment = (l: string) => l.replace(/(^|\s)#.*$/, "");
interface Step {
  name: string;
  text: string;
}
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
function commands(text: string): string[] {
  return text
    .split("\n")
    .map(stripComment)
    .join("\n")
    .replace(/\\\n\s*/g, " ")
    .split("\n");
}
// The if-block (up to its `fi`) that starts at the first command matching re.
function block(text: string, re: RegExp): string {
  const cmds = commands(text);
  const i = cmds.findIndex((c) => re.test(c));
  if (i < 0) return "";
  const j = cmds.findIndex((c, k) => k > i && /^\s*fi\s*$/.test(c));
  return cmds.slice(i, j < 0 ? undefined : j + 1).join("\n");
}

describe("gate.yml and gate-check.sh static checks (task 4c AC22, AC23, AC25-AC27, AC32)", () => {
  const all = steps();
  const read = all.find((s) => /github\.token/.test(s.text));
  const gate = all.find((s) => /scripts\/gate-check\.sh/.test(s.text));
  const apis = commands(read?.text ?? "").filter((c) => /\bgh\s+api\b/.test(c));

  it("AC22: still pull_request_target only, with opened, synchronize, reopened, labeled, unlabeled, edited", () => {
    expect(WF_GATE).toMatch(/^on:\s*\n\s+pull_request_target:/m);
    const list = (WF_GATE.match(/^\s+types:\s*\[([^\]]*)\]/m)?.[1] ?? "").split(",").map((s) => s.trim());
    for (const t of ["opened", "synchronize", "reopened", "labeled", "unlabeled", "edited"]) expect(list).toContain(t);
    expect(WF_GATE).not.toMatch(/^\s+(pull_request|push|workflow_run|workflow_dispatch|schedule):/m);
  });

  it("AC26/AC23: the read step makes only GET calls (4: label events, activity, current labels, base), no write method", () => {
    expect(read).toBeDefined();
    expect(apis).toHaveLength(4);
    for (const c of apis) {
      expect(c).not.toMatch(/(--method|-X)\s+(POST|PUT|PATCH|DELETE)/i);
      if (/\s(-f|-F|--field|--raw-field)\s/.test(c)) expect(c).toMatch(/--method GET/);
      expect(c).not.toMatch(/--input/);
    }
    expect(read?.text).not.toMatch(/\bcurl\b|\bwget\b/);
  });

  it("AC26: current labels come from GET repos/$REPO/issues/$PR/labels, all pages, names only", () => {
    const labels = apis.find((c) => /issues\/\$PR\/labels/.test(c)) ?? "";
    expect(labels).toMatch(/--method GET/);
    expect(labels).toMatch(/--paginate/);
    expect(labels).toMatch(/per_page=100/);
    expect(labels).toMatch(/--jq '\.\[\]\.name'/);
    expect(read?.text).toMatch(/> "\$RUNNER_TEMP\/labels"/);
  });

  it("AC26: no expression in gate.yml reads github.event.pull_request.labels; the label decision uses the API list", () => {
    expect(WF_GATE).not.toMatch(/github\.event\.pull_request\.labels/);
    expect(WF_GATE).not.toMatch(/labels\.\*\.name/);
    expect(gate?.text).toMatch(/labels="\$\(cat "\$RUNNER_TEMP\/labels"\)"/);
    expect(gate?.text).toMatch(/grep -qxF framework-change-approved && approved=1/);
    expect(gate?.text).toMatch(/FRAMEWORK_CHANGE_APPROVED="\$approved"/);
    expect(gate?.text).toMatch(/PR_CURRENT_LABELS="\$labels"/);
  });

  it("AC26: the Gate step still gets no token; the token is only in the read step, which runs before Gate", () => {
    expect(all.filter((s) => /github\.token/.test(s.text)).map((s) => s.name)).toEqual([read?.name]);
    expect(WF_GATE).not.toMatch(/secrets\.|GITHUB_TOKEN/);
    expect(commands(gate?.text ?? "").join(" ")).not.toMatch(/GH_TOKEN|token/i);
    expect(all.indexOf(read as Step)).toBeLessThan(all.indexOf(gate as Step));
  });

  it("AC27: a failed labels read fails the job in the read step with an error naming the read", () => {
    const b = block(read?.text ?? "", /if ! labels=\$\(gh api .*issues\/\$PR\/labels/);
    expect(b, read?.text).not.toBe("");
    expect(b).toMatch(/::error::could not read the PR's current labels/);
    expect(b).toMatch(/exit 1/);
  });

  it("AC23: the current base comes from GET repos/$REPO/pulls/$PR .base.ref; a failed or empty read fails the job", () => {
    const base = apis.find((c) => /pulls\/\$PR"/.test(c)) ?? "";
    expect(base).toMatch(/--method GET/);
    expect(base).toMatch(/--jq '\.base\.ref'/);
    const b = block(read?.text ?? "", /if ! base=\$\(gh api .*pulls\/\$PR/);
    expect(b).toMatch(/\|\| \[ -z "\$base" \]/);
    expect(b).toMatch(/::error::could not read the PR's current base branch/);
    expect(b).toMatch(/exit 1/);
    expect(gate?.text).toMatch(/PR_CURRENT_BASE="\$\(cat "\$RUNNER_TEMP\/base"\)"/);
    // The payload's base is still checked too ("Only PRs into main", first step).
    expect(all[0].name).toMatch(/Only PRs into main/);
  });

  it("AC27/AC32: nothing softens the read or the gate (no continue-on-error, no if:, no || true); outputs emptied first", () => {
    expect(WF_GATE).not.toMatch(/continue-on-error/);
    for (const s of [read, gate]) {
      expect(s?.text).not.toMatch(/^\s+if:/m);
      expect(s?.text).not.toMatch(/\|\|\s*true|set \+e/);
    }
    expect(read?.text).toMatch(/: > "\$RUNNER_TEMP\/label-time"; : > "\$RUNNER_TEMP\/pushes"; : > "\$RUNNER_TEMP\/labels"; : > "\$RUNNER_TEMP\/base"/);
    expect(all[all.length - 1]).toBe(gate);
  });

  it("AC32: gate.yml keeps read/none permissions, a SHA-pinned checkout with persist-credentials: false", () => {
    const code = YML_LINES.map(stripComment).join("\n");
    expect(code).not.toMatch(/write-all|read-all|:\s*write\b/);
    expect(code).toMatch(/uses:\s*actions\/checkout@[0-9a-f]{40}\s*$/m);
    expect(code).toMatch(/^\s+persist-credentials:\s*false\s*$/m);
  });

  it("AC25/AC32: gate-check.sh header describes the spoof rules and the residuals (another base branch's gate.yml, posts from other branches)", () => {
    const script = readLF("scripts", "gate-check.sh");
    const header = script.split("\n").filter((l) => l.startsWith("#")).join("\n");
    for (const s of ["merge-gate spoofing", "S14-A", "B1", "B2", "B3", "Exempt gate file", "pull_request_target", "Residuals", "ANOTHER base branch", "another branch", "4c-app"]) {
      expect(header, s).toContain(s);
    }
  });

  it("AC32: gate-check.sh uses no new tool (no YAML parser, no python/node/jq/yq/perl)", () => {
    const code = readLF("scripts", "gate-check.sh")
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    expect(code).not.toMatch(/\b(python3?|node|npx|jq|yq|perl|ruby)\b/);
  });
});
