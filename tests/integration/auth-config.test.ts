// Task 2b, baseline row 9 (guess the login code) and row 13 (no secrets in files): static config tests S1-S12 from
// specs/2b/threat-model.md section D, reading supabase/config.toml. The live checks (L1, AC6, AC7) are manual and
// recorded in tasks/2b/TASK_BRIEF.md; see specs/2b/test-plan.md.
//
// No TOML parser is in the dependencies (adding one needs the person's approval, AGENT_RULES §8), so this file has a
// small section-aware parser for the subset config.toml uses: [section] headers and single-line `key = value` with
// strings, integers, floats, booleans and arrays of strings. Anything else throws, so a format change is noticed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type TomlValue = string | number | boolean | string[];
type Toml = Map<string, Map<string, TomlValue>>;

const CONFIG_PATH = join(process.cwd(), "supabase", "config.toml");

// Removes a trailing `# comment` that is outside double quotes.
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && inString) {
      i++;
    } else if (c === '"') {
      inString = !inString;
    } else if (c === "#" && !inString) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseString(raw: string, where: string): string {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(raw);
  if (!m) throw new Error(`${where}: not a basic string: ${raw}`);
  return m[1].replace(/\\(["\\])/g, "$1");
}

function parseValue(raw: string, where: string): TomlValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^[+-]?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^[+-]?\d+\.\d+$/.test(raw)) return Number.parseFloat(raw);
  if (raw.startsWith('"')) return parseString(raw, where);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    return inner
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => parseString(s, where));
  }
  throw new Error(`${where}: unsupported value: ${raw}`);
}

function parseToml(text: string): Toml {
  const sections: Toml = new Map([["", new Map()]]);
  let current = sections.get("")!;
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const where = `config.toml line ${i + 1}`;
    const line = stripComment(rawLine).trim();
    if (line === "") return;
    const section = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (section) {
      if (sections.has(section[1])) throw new Error(`${where}: duplicate section [${section[1]}]`);
      current = new Map();
      sections.set(section[1], current);
      return;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) throw new Error(`${where}: unsupported line: ${line}`);
    if (current.has(kv[1])) throw new Error(`${where}: duplicate key ${kv[1]}`);
    current.set(kv[1], parseValue(kv[2].trim(), where));
  });
  return sections;
}

const text = readFileSync(CONFIG_PATH, "utf8");
const toml = parseToml(text);

function get(section: string, key: string): TomlValue | undefined {
  return toml.get(section)?.get(key);
}

describe("config.toml parser (test helper)", () => {
  it("parses by section: [auth.email] and [auth.sms] each have their own enable_confirmations", () => {
    expect(toml.has("auth")).toBe(true);
    expect(toml.has("auth.email")).toBe(true);
    expect(get("auth.sms", "enable_confirmations")).toBe(false);
    expect(get("auth.email", "enable_confirmations")).toBe(true);
  });

  it("handles strings, numbers, booleans, arrays and inline comments", () => {
    const t = parseToml('[a.b]\nx = "s # not a comment" # comment\ny = 12\nz = true\nw = ["p", "q"]\n');
    expect(t.get("a.b")).toEqual(
      new Map<string, TomlValue>([
        ["x", "s # not a comment"],
        ["y", 12],
        ["z", true],
        ["w", ["p", "q"]],
      ]),
    );
  });
});

describe("supabase/config.toml auth defaults (task 2b, row 9)", () => {
  it("S1: [auth] minimum_password_length is 12 (and >= 10)", () => {
    expect(get("auth", "minimum_password_length")).toBe(12);
    expect(get("auth", "minimum_password_length") as number).toBeGreaterThanOrEqual(10);
  });

  it('S2: [auth] password_requirements is "letters_digits"', () => {
    expect(get("auth", "password_requirements")).toBe("letters_digits");
  });

  it("S3: [auth.email] enable_confirmations is true", () => {
    expect(get("auth.email", "enable_confirmations")).toBe(true);
  });

  it("S4: [auth.email] secure_password_change and double_confirm_changes are true", () => {
    expect(get("auth.email", "secure_password_change")).toBe(true);
    expect(get("auth.email", "double_confirm_changes")).toBe(true);
  });

  it("S5: [auth.rate_limit] token_verifications is 5 (< 10: OTP guessing is limited before 10 attempts)", () => {
    expect(get("auth.rate_limit", "token_verifications")).toBe(5);
    expect(get("auth.rate_limit", "token_verifications") as number).toBeLessThan(10);
  });

  it("S6: [auth.rate_limit] sign_in_sign_ups is 10", () => {
    expect(get("auth.rate_limit", "sign_in_sign_ups")).toBe(10);
  });

  it.each([
    ["email_sent", 30],
    ["sms_sent", 30],
    ["anonymous_users", 30],
    ["token_refresh", 150],
    ["web3", 30],
  ])("S7: [auth.rate_limit] %s is %i", (key, value) => {
    expect(get("auth.rate_limit", key)).toBe(value);
  });

  it("S8: [auth.email] otp_expiry is 900 (<= 900) and otp_length is 6", () => {
    expect(get("auth.email", "otp_expiry")).toBe(900);
    expect(get("auth.email", "otp_expiry") as number).toBeLessThanOrEqual(900);
    expect(get("auth.email", "otp_length")).toBe(6);
  });

  it('S9: [auth.email] max_frequency is "60s"', () => {
    expect(get("auth.email", "max_frequency")).toBe("60s");
  });

  it("S10: anonymous sign-ins and the phone provider are off", () => {
    expect(get("auth", "enable_anonymous_sign_ins")).toBe(false);
    expect(get("auth.sms", "enabled")).toBe(false);
  });

  it("S11: no active [auth.captcha] (off locally and in CI); if present, its secret is an env() reference", () => {
    const captcha = toml.get("auth.captcha");
    if (captcha !== undefined) {
      expect(captcha.get("enabled"), "[auth.captcha] enabled").not.toBe(true);
      const secret = captcha.get("secret");
      if (secret !== undefined) expect(secret).toMatch(/^(env\([A-Z0-9_]+\))?$/);
    }
    expect(captcha).toBeUndefined();
  });

  it("AC5/AC7 context: the [auth] and [auth.email] providers are enabled", () => {
    expect(get("auth", "enabled")).toBe(true);
    expect(get("auth.email", "enabled")).toBe(true);
  });
});

describe("supabase/config.toml holds no literal secrets (task 2b S12, row 13)", () => {
  const SECRET_KEY = /^(secret|pass|password|auth_token|[a-z0-9_]+_(key|secret|token))$/;
  const SAFE_VALUE = /^"(env\([A-Z][A-Z0-9_]*\))?"$/;

  // Active and commented-out assignments, so uncommenting a line can't bring a literal secret in.
  const assignments = text
    .split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, m: /^\s*#?\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line) }))
    .filter((a) => a.m !== null && SECRET_KEY.test(a.m[1]))
    .map((a) => ({ line: a.line, key: a.m![1], value: stripComment(a.m![2]).trim() }));

  it("finds the secret-like keys the file has today (guards the scan itself)", () => {
    const keys = assignments.map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["openai_api_key", "auth_token", "secret", "pass"]));
  });

  it('S12: every secret-like key (secret, pass, auth_token, *_key, ...) is "" or "env(NAME)"', () => {
    for (const a of assignments) {
      expect(a.value, `line ${a.line}: ${a.key}`).toMatch(SAFE_VALUE);
    }
  });

  it("S12: no JWT or Supabase API key appears anywhere in the file", () => {
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(text).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/);
  });
});
