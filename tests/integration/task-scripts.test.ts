// Task 4a: tests for scripts/board.sh and scripts/lessons.sh (AC1-AC9), plus static checks for AC10 and AC13.
// The scripts read tasks/ relative to the current directory, so each test writes a fixture tasks/ tree into a fresh
// temp dir (fs.mkdtemp) and runs the script there. AC5 and AC9 run once against this repo's own tasks/ tree.
// Offline and deterministic: no network, no sleeps; git is used read-only for AC10 and AC13.
//
// Windows: call Git Bash explicitly. A plain `bash` may resolve to WSL (C:\Windows\System32\bash.exe), which can't
// read Windows paths the same way (brief Handoff, product-spec and devops-cicd). CI (ubuntu) uses `bash`.
// Fixtures are written with LF; one test checks that CRLF files parse the same.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BASH =
  process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe") : "bash";
// Forward slashes: Git Bash accepts C:/... paths; on Linux this is a no-op.
const script = (name: string) => join(ROOT, "scripts", name).split("\\").join("/");

type Run = { code: number | null; stdout: string; stderr: string };

function run(name: "board.sh" | "lessons.sh", cwd: string, args: string[] = []): Run {
  const r = spawnSync(BASH, [script(name), ...args], { cwd, encoding: "utf8", timeout: 30_000 });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const lines = (s: string) => s.split("\n").filter((l) => l !== "");

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

/** Creates a temp dir and writes the given files (relative path -> content, LF). Returns the dir. */
function fixture(files: Record<string, string>, opts: { tasksDir?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "task-scripts-"));
  temps.push(dir);
  if (opts.tasksDir !== false) mkdirSync(join(dir, "tasks"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

/** A brief like templates/TASK_BRIEF.md: heading, field table, then a Handoff section. */
function brief(id: string, title: string, state: string | null, owner = "devops-cicd", extra = ""): string {
  const stateRow = state === null ? "" : `| State | ${state} |\n`;
  return (
    `# Task ${id}: ${title}\n\n| Field | Value |\n|-------|-------|\n${stateRow}| Owner role | ${owner} |\n` +
    `| Branch | \`chore/${id}-x\` |\n\n## Request\n\nSomething.\n\n## Handoff\n\n${extra}`
  );
}

const HEADER = ["| Id | Title | State | Owner |", "|----|-------|-------|-------|"];
const STATES = ["BACKLOG", "SPEC_READY", "IN_PROGRESS", "IN_REVIEW", "VERIFYING", "DONE", "BLOCKED"];

describe("scripts/board.sh", () => {
  it("AC1: prints the Markdown table (id, title, full State cell, full Owner cell), exit 0, no stderr", () => {
    const dir = fixture({
      "tasks/0/TASK_BRIEF.md": brief("0", "Phase 0 bootstrap", "DONE", "git-release, devops-cicd"),
      // Extra spaces around cells are trimmed; a note after the state word is kept.
      "tasks/2b/TASK_BRIEF.md":
        "# Task 2b: Security headers in next.config\n\n| Field | Value |\n|-------|-------|\n" +
        "|   State   |   VERIFYING (the person: dashboard items 1-21, item 22 before any real user)   |\n" +
        "|  Owner role  |  devops-cicd (`next.config.*`); qa-test (`tests/integration/**`)  |\n",
    });
    const r = run("board.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      [
        ...HEADER,
        "| 0 | Phase 0 bootstrap | DONE | git-release, devops-cicd |",
        "| 2b | Security headers in next.config | VERIFYING (the person: dashboard items 1-21, item 22 before any real user) | devops-cicd (`next.config.*`); qa-test (`tests/integration/**`) |",
      ].join("\n") + "\n",
    );
  });

  it("AC1: a brief checked out with CRLF line endings prints the same row", () => {
    const dir = fixture({
      "tasks/0/TASK_BRIEF.md": brief("0", "Phase 0 bootstrap", "DONE", "git-release").replace(/\n/g, "\r\n"),
    });
    const r = run("board.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(lines(r.stdout)).toEqual([...HEADER, "| 0 | Phase 0 bootstrap | DONE | git-release |"]);
  });

  it("AC2: rows in order 0, 2, 2b, 3c, 10; directories without a brief are skipped without error", () => {
    const files: Record<string, string> = {
      "tasks/4/PLAN.md": "# Plan\n",
      "tasks/incidents/2026-11-25-drift.md": "# Incident\n",
      "tasks/decisions/2026-11-25-4a-x.md": "# Decision\n",
      "tasks/lessons.md": "# Lessons\n",
    };
    for (const id of ["10", "2b", "2", "3c", "0"]) files[`tasks/${id}/TASK_BRIEF.md`] = brief(id, `title ${id}`, "DONE");
    const r = run("board.sh", fixture(files));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(lines(r.stdout).slice(2).map((l) => l.split("|")[1].trim())).toEqual(["0", "2", "2b", "3c", "10"]);
  });

  it("AC2: numeric part first, then the letter suffix (2 before 2a, 1b before 12)", () => {
    const files: Record<string, string> = {};
    for (const id of ["12", "2a", "1b", "2", "1", "2c", "11"]) files[`tasks/${id}/TASK_BRIEF.md`] = brief(id, "t", "BACKLOG");
    const r = run("board.sh", fixture(files));
    expect(r.code).toBe(0);
    expect(lines(r.stdout).slice(2).map((l) => l.split("|")[1].trim())).toEqual(["1", "1b", "2", "2a", "2c", "11", "12"]);
  });

  it("AC3: malformed briefs still get a row, one stderr line per problem, exit 1", () => {
    const dir = fixture({
      // well-formed, with a later "State" word and a later State table row in the Handoff: only the first row counts
      "tasks/1/TASK_BRIEF.md": brief("1", "good one", "IN_PROGRESS", "qa-test", "State moved to DONE.\n\n| State | BLOCKED |\n"),
      // no State row; a "State" word in the Handoff text must not count as one
      "tasks/5/TASK_BRIEF.md": brief("5", "no state row", null, "o5", "- State: DONE (said in prose, not a table row)\n"),
      "tasks/6/TASK_BRIEF.md": brief("6", "empty state", "  ", "o6"),
      "tasks/7/TASK_BRIEF.md": brief("7", "unknown state", "WAITING (for the person)", "o7"),
      // starts like a valid word but isn't one
      "tasks/7b/TASK_BRIEF.md": brief("7b", "prefix trap", "DONEISH", "o7b"),
      "tasks/8/TASK_BRIEF.md": brief("99", "heading names another id", "DONE", "o8"),
      "tasks/9/TASK_BRIEF.md": brief("9", "fine", "BLOCKED", "o9"),
    });
    // tasks/8's heading must be the raw first line
    const r = run("board.sh", dir);
    expect(r.code).toBe(1);
    expect(lines(r.stdout)).toEqual([
      ...HEADER,
      "| 1 | good one | IN_PROGRESS | qa-test |",
      "| 5 | no state row | MISSING | o5 |",
      "| 6 | empty state | MISSING | o6 |",
      "| 7 | unknown state | WAITING (for the person) | o7 |",
      "| 7b | prefix trap | DONEISH | o7b |",
      "| 8 | # Task 99: heading names another id | DONE | o8 |",
      "| 9 | fine | BLOCKED | o9 |",
    ]);
    const err = lines(r.stderr);
    expect(err).toHaveLength(5);
    const errFor = (id: string) => err.filter((l) => l.startsWith(`board.sh: tasks/${id}/TASK_BRIEF.md: `));
    for (const id of ["5", "6", "7", "7b", "8"]) expect(errFor(id), `stderr for tasks/${id}`).toHaveLength(1);
    expect(errFor("5")[0]).toMatch(/State/);
    expect(errFor("6")[0]).toMatch(/empty/i);
    expect(errFor("7")[0]).toContain("WAITING");
    expect(errFor("7b")[0]).toContain("DONEISH");
    expect(errFor("8")[0]).toMatch(/first line/i);
    expect(errFor("1")).toEqual([]);
    expect(errFor("9")).toEqual([]);
  });

  it.each([
    ["no State row", brief("3", "t", null)],
    ["empty State cell", brief("3", "t", "")],
    ["unknown state word", brief("3", "t", "done")],
    ["heading without the id", "# Phase 3\n\n| State | DONE |\n| Owner role | x |\n"],
    ["heading with an empty title", "# Task 3:\n\n| State | DONE |\n| Owner role | x |\n"],
  ])("AC3: %s alone gives exactly one stderr line and exit 1", (_name, content) => {
    const r = run("board.sh", fixture({ "tasks/3/TASK_BRIEF.md": content }));
    expect(r.code).toBe(1);
    expect(lines(r.stderr)).toHaveLength(1);
    expect(r.stderr.startsWith("board.sh: tasks/3/TASK_BRIEF.md: ")).toBe(true);
    expect(lines(r.stdout)).toHaveLength(3);
  });

  it.each(STATES)("AC3: %s (with and without a note) is a valid state", (s) => {
    const dir = fixture({
      "tasks/1/TASK_BRIEF.md": brief("1", "t", s),
      "tasks/2/TASK_BRIEF.md": brief("2", "t", `${s} (note: x)`),
    });
    const r = run("board.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("AC4: any argument -> one-line usage on stderr, exit 2, nothing on stdout", () => {
    const dir = fixture({ "tasks/0/TASK_BRIEF.md": brief("0", "t", "DONE") });
    for (const args of [["x"], ["--help"], [""]]) {
      const r = run("board.sh", dir, args);
      expect(r.code, `args ${JSON.stringify(args)}`).toBe(2);
      expect(lines(r.stderr)).toHaveLength(1);
      expect(r.stderr).toMatch(/usage/i);
      expect(r.stdout).toBe("");
    }
  });

  it("AC4: no tasks/ directory -> the fixed message on stderr, exit 2", () => {
    const r = run("board.sh", fixture({}, { tasksDir: false }));
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("board.sh: no tasks/ directory (run from the repo root)\n");
    expect(r.stdout).toBe("");
  });

  it("AC4: tasks/ with no briefs -> only the two header lines, exit 0", () => {
    const cases: Record<string, string>[] = [{}, { "tasks/4/PLAN.md": "x\n", "tasks/decisions/a.md": "x\n" }];
    for (const files of cases) {
      const r = run("board.sh", fixture(files));
      expect(r.code).toBe(0);
      expect(r.stderr).toBe("");
      expect(r.stdout).toBe(HEADER.join("\n") + "\n");
    }
  });

  it("AC4: brief content is never executed (command substitutions are printed as text)", () => {
    const dir = fixture({
      "tasks/1/TASK_BRIEF.md": brief("1", "$(touch pwned1) `touch pwned2`", "DONE (note $(touch pwned3))", "${HOME} $(touch pwned4)"),
    });
    const r = run("board.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(lines(r.stdout)[2]).toBe("| 1 | $(touch pwned1) `touch pwned2` | DONE (note $(touch pwned3)) | ${HOME} $(touch pwned4) |");
    expect(readdirSync(dir).filter((f) => f.startsWith("pwned"))).toEqual([]);
    expect(readdirSync(join(dir, "tasks")).filter((f) => f.startsWith("pwned"))).toEqual([]);
  });

  it("AC5: on this repo, board.md is gone and the briefs carry its states (3c DONE per the orchestrator), exit 0", () => {
    expect(existsSync(join(ROOT, "tasks", "board.md"))).toBe(false);
    const r = run("board.sh", ROOT);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const out = lines(r.stdout);
    expect(out.slice(0, 2)).toEqual(HEADER);
    const rows = new Map(out.slice(2).map((l) => {
      const c = l.split(" | ");
      return [c[0].replace(/^\| /, ""), c[2]] as const;
    }));
    // board.md at origin/main 5c3aa7e, word for word. DONE is final; the two VERIFYING rows may only move on to DONE.
    const done = ["0", "1", "2a", "2c", "2d", "2e"];
    for (const id of done) expect(rows.get(id), `tasks/${id}`).toBe("DONE");
    expect(["VERIFYING (the person: dashboard items 1-21, item 22 before any real user)", "DONE"]).toContain(rows.get("2b"));
    expect(["VERIFYING (the person: release checklist R1-R10 in the brief)", "DONE"]).toContain(rows.get("3"));
    expect(rows.get("3c")).toBe("DONE");
    expect(rows.has("4a")).toBe(true);
    // Every row's State starts with a valid word (exit 0 already says so; this names the row if not).
    for (const [id, state] of rows) expect(STATES, `tasks/${id}: ${state}`).toContain(state.split(/[ (]/)[0]);
  });
});

// ---------------------------------------------------------------------------------------------------------------

const ARCHIVE = [
  "# Lessons",
  "",
  "Intro text. ## L99. is not a heading here.",
  "",
  "## L1. Fixed one (fixed in PR #3)",
  "## L2. Closed one (Closed)",
  "## L3. Info one (INFO, no action)",
  "## L4. Open one (open)",
  "## L5. No status",
  "## L6. Mid status (fixed) then open (open)",
  "## L7. Closed by a Closes line in another file (open, devops-cicd)",
  "## L8. Prefix trap (unfixed)",
  "## L9. Trailing blanks after status (Fixed by task 2c)   ",
  "## L10. Parens not at the end (fixed) here",
  "## L11. Starts with fixed counts as closed (fixed-ish)",
  "### L12. Not a level-2 heading (open)",
  "## L13 Missing dot (open)",
  "",
  "Body text with ## L14. inside is not a heading.",
  "",
].join("\n");

describe("scripts/lessons.sh", () => {
  it("AC6/AC7: exactly the open lessons, archive in id order, then per-task in task and <n> order, summary line", () => {
    const dir = fixture({
      "tasks/lessons.md": ARCHIVE,
      "tasks/2/lessons.md": "# Lessons from task 2\n\n## L2.10. Tenth (open)\n\n## L2.9. Ninth\n\n## L2.1. Done one (closed)\n",
      "tasks/9/lessons.md":
        "# Lessons from task 9\n\n## Notes\n\n## L9.1. Per-task open (open, qa-test)\n## L9.2. Per-task fixed (Fixed)\n" +
        "## L9.3. Closed from task 10 (open)\n\nCloses: L7\n",
      "tasks/10/lessons.md": "# Lessons from task 10\n\n## L10.1. Later task (open)\n\n   Closes: L9.3 , L1\n",
      "tasks/3c/TASK_BRIEF.md": brief("3c", "no lessons file", "DONE"),
    });
    const r = run("lessons.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      [
        "L4 tasks/lessons.md: Open one (open)",
        "L5 tasks/lessons.md: No status",
        "L6 tasks/lessons.md: Mid status (fixed) then open (open)",
        "L8 tasks/lessons.md: Prefix trap (unfixed)",
        "L10 tasks/lessons.md: Parens not at the end (fixed) here",
        "L2.9 tasks/2/lessons.md: Ninth",
        "L2.10 tasks/2/lessons.md: Tenth (open)",
        "L9.1 tasks/9/lessons.md: Per-task open (open, qa-test)",
        "L10.1 tasks/10/lessons.md: Later task (open)",
        "lessons.sh: 9 open (5 archive, 4 per-task)",
      ].join("\n") + "\n",
    );
  });

  it("AC6: a Closes: line closes a per-task lesson in its own file and in another task's file", () => {
    const dir = fixture({
      "tasks/1/lessons.md": "## L1.1. A (open)\n## L1.2. B (open)\nCloses: L1.1\n",
      "tasks/2/lessons.md": "## L2.1. C (open)\nCloses: L1.2\n",
    });
    const r = run("lessons.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(lines(r.stdout)).toEqual(["L2.1 tasks/2/lessons.md: C (open)", "lessons.sh: 1 open (0 archive, 1 per-task)"]);
  });

  it("AC6: CRLF lesson files parse the same", () => {
    const dir = fixture({
      "tasks/lessons.md": "# Lessons\r\n## L1. A (open)\r\n## L2. B (fixed)\r\n",
      "tasks/4/lessons.md": "## L4.1. C (open)\r\nCloses: L1\r\n",
    });
    const r = run("lessons.sh", dir);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(lines(r.stdout)).toEqual(["L4.1 tasks/4/lessons.md: C (open)", "lessons.sh: 1 open (0 archive, 1 per-task)"]);
  });

  it("AC7: no open lessons -> only the zero summary line, exit 0", () => {
    const cases: Record<string, string>[] = [
      {},
      { "tasks/lessons.md": "# Lessons\n\n## L1. A (fixed)\n## L2. B (info)\n" },
      { "tasks/lessons.md": "## L1. A (open)\n", "tasks/1/lessons.md": "## L1.1. B (closed)\nCloses: L1\n" },
    ];
    for (const files of cases) {
      const r = run("lessons.sh", fixture(files));
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("lessons.sh: 0 open (0 archive, 0 per-task)\n");
    }
  });

  it("AC8: malformed per-task file -> one stderr line per problem, well-formed open lessons still listed, exit 1", () => {
    const dir = fixture({
      "tasks/lessons.md": "## L1. Archive open (open)\n",
      "tasks/5x/lessons.md": [
        "# Lessons from task 5x",
        "## L5x.1. Good open (open)",
        "## L5y.1. Wrong task id (open)",
        "## L5x.0. Zero (open)",
        "## L5x.a. Letter (open)",
        "## L5x.2. First of a pair (open)",
        "## L5x.2. Duplicate (open)",
        "## L5x.3. Good fixed (fixed)",
        "Closes: L99",
        "",
      ].join("\n"),
    });
    const r = run("lessons.sh", dir);
    expect(r.code).toBe(1);
    expect(lines(r.stdout)).toEqual([
      "L1 tasks/lessons.md: Archive open (open)",
      "L5x.1 tasks/5x/lessons.md: Good open (open)",
      "L5x.2 tasks/5x/lessons.md: First of a pair (open)",
      "lessons.sh: 3 open (1 archive, 2 per-task)",
    ]);
    const err = lines(r.stderr);
    expect(err).toHaveLength(5);
    for (const l of err) expect(l.startsWith("lessons.sh: tasks/5x/lessons.md: ")).toBe(true);
    const one = (re: RegExp) => expect(err.filter((l) => re.test(l)), String(re)).toHaveLength(1);
    one(/L5y\.1/);
    one(/L5x\.0\b/);
    one(/L5x\.a\b/);
    one(/duplicate.*L5x\.2|L5x\.2.*duplicate/i);
    one(/L99\b/);
  });

  it.each([
    ["wrong task id", "## L5y.1. X (open)\n"],
    ["number 0", "## L5x.0. X (open)\n"],
    ["letter number", "## L5x.a. X (open)\n"],
    ["duplicate id", "## L5x.2. X (open)\n## L5x.2. Y (open)\n"],
    ["Closes: an id that exists nowhere", "## L5x.1. X (fixed)\nCloses: L5x.9\n"],
  ])("AC8: %s alone gives exactly one stderr line and exit 1", (_name, content) => {
    const r = run("lessons.sh", fixture({ "tasks/5x/lessons.md": content }));
    expect(r.code).toBe(1);
    expect(lines(r.stderr)).toHaveLength(1);
    expect(r.stderr.startsWith("lessons.sh: tasks/5x/lessons.md: ")).toBe(true);
    expect(lines(r.stdout).at(-1)).toMatch(/^lessons\.sh: \d+ open \(\d+ archive, \d+ per-task\)$/);
  });

  it("AC8: any argument -> usage on stderr, exit 2; no tasks/ -> exit 2", () => {
    const dir = fixture({ "tasks/lessons.md": "## L1. A (open)\n" });
    for (const args of [["x"], ["--help"]]) {
      const r = run("lessons.sh", dir, args);
      expect(r.code).toBe(2);
      expect(lines(r.stderr)).toHaveLength(1);
      expect(r.stderr).toMatch(/usage/i);
      expect(r.stdout).toBe("");
    }
    const r = run("lessons.sh", fixture({}, { tasksDir: false }));
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("lessons.sh: no tasks/ directory (run from the repo root)\n");
    expect(r.stdout).toBe("");
  });

  it("AC8: a missing tasks/lessons.md is not an error", () => {
    const r = run("lessons.sh", fixture({ "tasks/3/lessons.md": "## L3.1. Only per-task (open)\n" }));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(lines(r.stdout)).toEqual(["L3.1 tasks/3/lessons.md: Only per-task (open)", "lessons.sh: 1 open (0 archive, 1 per-task)"]);
  });

  it("AC8: lesson content is never executed", () => {
    const dir = fixture({ "tasks/1/lessons.md": "## L1.1. $(touch pwned1) `touch pwned2` (open)\n" });
    const r = run("lessons.sh", dir);
    expect(r.code).toBe(0);
    expect(lines(r.stdout)[0]).toBe("L1.1 tasks/1/lessons.md: $(touch pwned1) `touch pwned2` (open)");
    expect(readdirSync(dir).filter((f) => f.startsWith("pwned"))).toEqual([]);
  });

  it("AC9: on this repo, the archive part is exactly the 14 open lessons (L16, L19, L23 closed by tasks/4a), exit 0", () => {
    const r = run("lessons.sh", ROOT);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const out = lines(r.stdout);
    const archive = out.filter((l) => / tasks\/lessons\.md: /.test(l)).map((l) => l.split(" ")[0]);
    // Later tasks may close more archived lessons with their own Closes: lines; those drop out of the expected list.
    const closesElsewhere = new Set<string>();
    for (const d of readdirSync(join(ROOT, "tasks"))) {
      const f = join(ROOT, "tasks", d, "lessons.md");
      if (d === "4a" || !existsSync(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/^[ \t]*Closes:(.*)$/gm)) for (const id of m[1].split(",")) closesElsewhere.add(id.trim());
    }
    const expected = ["L5", "L11", "L12", "L13", "L14", "L15", "L17", "L20", "L21", "L22", "L24", "L25", "L26", "L27"];
    expect(archive).toEqual(expected.filter((id) => !closesElsewhere.has(id)));
    expect(readFileSync(join(ROOT, "tasks", "4a", "lessons.md"), "utf8")).toMatch(/^Closes: L16, L19, L23$/m);
    // Archive lines come first; per-task lines (4a's own, if any) after them.
    const firstPerTask = out.findIndex((l) => /^L[^ ]+\.\d+ tasks\/[^/]+\/lessons\.md: /.test(l));
    if (firstPerTask >= 0) expect(firstPerTask).toBe(archive.length);
    const total = out.length - 1;
    expect(out.at(-1)).toBe(`lessons.sh: ${total} open (${archive.length} archive, ${total - archive.length} per-task)`);
  });
});

// ---------------------------------------------------------------------------------------------------------------

function git(args: string[]): Run {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// The branch base named in AC5. CI checks out with fetch-depth 0 (ci.yml), so it is there; a shallow clone without it
// skips this test rather than guessing.
const BASE = "5c3aa7e";
const hasBase = git(["cat-file", "-e", `${BASE}^{commit}`]).code === 0;

describe("frozen archives and docs (static, git)", () => {
  it.skipIf(!hasBase).each([
    ["tasks/lessons.md", "# Lessons", "frozen; new entries go to tasks/<id>/lessons.md"],
    ["tasks/decisions.md", "# Decisions", "frozen; new entries go to tasks/decisions/"],
  ])("AC10: %s differs from the base only by one header line under the title", (file, title, phrase) => {
    const d = git(["diff", "--no-color", "--unified=0", BASE, "--", file]);
    expect(d.code).toBe(0);
    const body = d.stdout.split("\n");
    const added = body.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = body.filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(removed).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]).toContain(phrase);
    const now = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
    expect(now[0]).toBe(title);
    expect(now[1]).toContain(phrase);
  });

  it("AC13: outside tasks/ and specs/, the archive files are only cited or described as frozen; no tasks/board.md", () => {
    // This file is excluded: it names the paths it checks for.
    const g = git(["grep", "-n", "-E", "tasks/(board|lessons|decisions)\\.md", "--", ":!tasks/", ":!specs/", ":(exclude)tests/integration/task-scripts.test.ts"]);
    expect(g.code === 0 || g.code === 1, g.stderr).toBe(true);
    const hits = lines(g.stdout);
    expect(hits.filter((l) => l.includes("tasks/board.md"))).toEqual([]);
    const bad = hits.filter((hit) => {
      const [file] = hit.split(":");
      if (file === "scripts/lessons.sh") return false; // the reader of the archive
      if (/frozen|archive/i.test(hit)) return false;
      // Every mention must be a citation of an archived entry: "`tasks/lessons.md` L11" or "(the person, <date>, `tasks/decisions.md`)".
      const mentions = [...hit.matchAll(/`?tasks\/(lessons|decisions)\.md`?/g)];
      return !mentions.every((m) => {
        const after = hit.slice(m.index! + m[0].length);
        const before = hit.slice(0, m.index!);
        return /^,? ?L\d+/.test(after) || /\d{4}-\d{2}-\d{2}, $/.test(before);
      });
    });
    expect(bad).toEqual([]);
  });
});
