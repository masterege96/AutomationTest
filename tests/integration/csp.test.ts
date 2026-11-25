// Task 3, baseline row 11: unit tests for the nonce CSP builder (specs/3/threat-model.md 6.3, 6.6 N1).
// These are 2b's H2-H6 moved from next.config.ts to `buildCsp({ nonce, supabaseUrl, isDev })` in lib/server/csp.ts
// (backend-dev). Relative import: Vitest has no `@/` alias configured (vitest.config.ts, devops-cicd).
// Expected strings are copied from the threat model. Copy changes from there only.
import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "../../lib/server/csp";

// Local API URL from supabase/config.toml ([api] port 55421) and a fixed test nonce (16 zero bytes, base64).
// Test values, not secrets.
const LOCAL_API = "http://127.0.0.1:55421";
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

const PROD_LOCAL =
  "default-src 'self'; script-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://127.0.0.1:55421; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const DEV_LOCAL =
  "default-src 'self'; script-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'strict-dynamic' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://127.0.0.1:55421; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// Same as PROD_LOCAL with connect-src 'self' only (origin omitted together with its leading space).
const PROD_NO_ORIGIN = PROD_LOCAL.replace(" http://127.0.0.1:55421", "");

function directives(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens;
    expect(out.has(name), `CSP directive ${name} appears more than once`).toBe(false);
    out.set(name, values);
  }
  return out;
}

const prod = (supabaseUrl: string | undefined, nonce = NONCE) => buildCsp({ nonce, supabaseUrl, isDev: false });
const dev = (supabaseUrl: string | undefined, nonce = NONCE) => buildCsp({ nonce, supabaseUrl, isDev: true });

describe("buildCsp (task 3 nonce CSP, threat model 6.3 / N1)", () => {
  it("N1: production string equals the threat model exactly", () => {
    expect(prod(LOCAL_API)).toBe(PROD_LOCAL);
  });

  it("N1: development string equals the threat model exactly (only 'unsafe-eval' added to script-src)", () => {
    expect(dev(LOCAL_API)).toBe(DEV_LOCAL);
    const p = directives(prod(LOCAL_API));
    const d = directives(dev(LOCAL_API));
    for (const [name, values] of p) {
      if (name === "script-src") expect(d.get(name)).toEqual([...values, "'unsafe-eval'"]);
      else expect(d.get(name), name).toEqual(values);
    }
  });

  it.each([false, true])("N1/AC35: script-src has no 'unsafe-inline' (isDev=%s)", (isDev) => {
    const csp = buildCsp({ nonce: NONCE, supabaseUrl: LOCAL_API, isDev });
    expect(directives(csp).get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("N1/H3: production has no 'unsafe-eval', no wildcard or scheme script sources, and the locking directives", () => {
    const csp = directives(prod(LOCAL_API));
    const scriptSrc = csp.get("script-src") ?? [];
    expect(scriptSrc).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    for (const bad of ["*", "https:", "http:", "data:", "blob:"]) expect(scriptSrc, `script-src contains ${bad}`).not.toContain(bad);
    for (const [name, values] of csp) expect(values.some((v) => v.includes("*")), `${name} contains *`).toBe(false);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.has("report-uri")).toBe(false);
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("N1: the nonce appears exactly once, in script-src, in the form Next.js extracts", () => {
    const nonce = "q83vEjRWeJCrze8SNFZ4kA==";
    const csp = prod(LOCAL_API, nonce);
    expect(csp.split(nonce)).toHaveLength(2);
    const token = (directives(csp).get("script-src") ?? []).find((t) => t.startsWith("'nonce-"));
    // Regex Next.js 16 uses (node_modules/next/dist/server/app-render/get-script-nonce-from-header.js, per the threat model).
    const m = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/.exec(token ?? "");
    expect(m?.[1]).toBe(nonce);
    expect(directives(csp).get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("N1: different nonces give different policies (the nonce is not cached)", () => {
    expect(prod(LOCAL_API, "AAAAAAAAAAAAAAAAAAAAAA==")).not.toBe(prod(LOCAL_API, "BBBBBBBBBBBBBBBBBBBBBA=="));
  });

  it.each([undefined, ""])("N1/H5: with supabaseUrl %j, connect-src is exactly 'self'", (supabaseUrl) => {
    const csp = prod(supabaseUrl);
    expect(directives(csp).get("connect-src")).toEqual(["'self'"]);
    expect(csp).toBe(PROD_NO_ORIGIN);
  });

  it("N1/H6: a URL with a path, query and an injected directive yields the origin only", () => {
    const csp = prod(`${LOCAL_API}/rest/v1?x=1; script-src *`);
    expect(directives(csp).get("connect-src")).toEqual(["'self'", LOCAL_API]);
    expect(csp).toBe(PROD_LOCAL);
    expect(csp).not.toContain("/rest/v1");
    expect(csp.match(/script-src/g)).toHaveLength(1);
  });

  it("N1/H6: an https URL keeps its scheme, host and port", () => {
    expect(directives(prod("https://abc.supabase.co")).get("connect-src")).toEqual(["'self'", "https://abc.supabase.co"]);
  });

  it.each(["javascript:alert(1)", "ftp://127.0.0.1:55421", "not a url", "data:text/html,x"])(
    "N1/H6: supabaseUrl %j fails closed to connect-src 'self'",
    (supabaseUrl) => {
      expect(prod(supabaseUrl)).toBe(PROD_NO_ORIGIN);
    },
  );
});

describe("generateNonce (threat model 6.2 / N2)", () => {
  it("N2: 1,000 nonces are unique and each is 16 bytes of standard base64", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const n = generateNonce();
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(Buffer.from(n, "base64")).toHaveLength(16);
      seen.add(n);
    }
    expect(seen.size).toBe(1000);
  });

  it("N2: a generated nonce is accepted by buildCsp and lands in script-src", () => {
    const n = generateNonce();
    expect(buildCsp({ nonce: n, supabaseUrl: LOCAL_API, isDev: false })).toBe(PROD_LOCAL.replace(NONCE, n));
  });
});
