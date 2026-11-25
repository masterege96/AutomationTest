// Task 2b, baseline row 11 (XSS / clickjacking): static header tests H1-H7 from specs/2b/threat-model.md section D.
// Reads the real next.config.ts and calls its headers(); no server needed. The live check (H8) is manual, see
// specs/2b/test-plan.md.
//
// The CSP is computed when next.config.ts is loaded, so every test stubs the env and re-imports the module.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const NEXT_CONFIG_MODULE = "../../next.config";

// Local API URL from supabase/config.toml ([api] port 55421). A test value, not a secret.
const LOCAL_API = "http://127.0.0.1:55421";

// Exact values from specs/2b/threat-model.md A1/A2. Copy changes from there only.
function expectedCsp(opts: { dev?: boolean; connect?: string } = {}): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline'${opts.dev ? " 'unsafe-eval'" : ""}`;
  const connectSrc = `connect-src 'self'${opts.connect ? ` ${opts.connect}` : ""}`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const PROD_CSP_LOCAL_API =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://127.0.0.1:55421; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const OTHER_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

const ALL_HEADER_NAMES = ["Content-Security-Policy", ...Object.keys(OTHER_HEADERS)];

async function loadConfig(env: { nodeEnv: string; supabaseUrl: string | undefined }): Promise<NextConfig> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env.nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl);
  const mod = (await import(NEXT_CONFIG_MODULE)) as { default: NextConfig };
  return mod.default;
}

async function loadRules(env: { nodeEnv: string; supabaseUrl: string | undefined }): Promise<HeaderRule[]> {
  const config = await loadConfig(env);
  if (typeof config.headers !== "function") throw new Error("next.config.ts has no headers() function");
  return (await config.headers()) as HeaderRule[];
}

// The one rule for all paths, as a header-name -> value map. Fails if a header appears twice.
async function allPathsHeaders(env: {
  nodeEnv: string;
  supabaseUrl: string | undefined;
}): Promise<Record<string, string>> {
  const rules = await loadRules(env);
  const allPaths = rules.filter((r) => r.source === "/(.*)");
  expect(allPaths, 'rules with source "/(.*)"').toHaveLength(1);
  const map: Record<string, string> = {};
  for (const { key, value } of allPaths[0].headers) {
    expect(map[key], `header ${key} is set more than once`).toBeUndefined();
    map[key] = value;
  }
  return map;
}

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

const PROD = { nodeEnv: "production", supabaseUrl: LOCAL_API };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("security headers in next.config.ts (task 2b, row 11)", () => {
  it("H1: exactly one rule covers all paths and it carries exactly the six headers", async () => {
    const rules = await loadRules(PROD);
    const allPaths = rules.filter((r) => r.source === "/(.*)");
    expect(allPaths).toHaveLength(1);
    const keys = allPaths[0].headers.map((h) => h.key).sort();
    expect(keys).toEqual([...ALL_HEADER_NAMES].sort());
  });

  it.each(["/", "/does-not-exist", "/_next/static/chunks/main.js", "/next.svg"])(
    "H1/AC2: the all-paths rule source matches %s",
    async (path) => {
      const rules = await loadRules(PROD);
      const source = rules.find((r) => r.source === "/(.*)")?.source;
      expect(source).toBeDefined();
      expect(new RegExp(`^${source}$`).test(path)).toBe(true);
    },
  );

  it("H2: Content-Security-Policy (production, local API URL) equals the threat model string exactly", async () => {
    const headers = await allPathsHeaders(PROD);
    expect(PROD_CSP_LOCAL_API).toBe(expectedCsp({ connect: LOCAL_API }));
    expect(headers["Content-Security-Policy"], "Content-Security-Policy header").toBe(PROD_CSP_LOCAL_API);
  });

  it.each(Object.entries(OTHER_HEADERS))("H2: %s equals %j exactly", async (name, value) => {
    const headers = await allPathsHeaders(PROD);
    expect(headers[name], `${name} header`).toBe(value);
  });

  it("H3: production CSP has no 'unsafe-eval', no wildcard or scheme script sources, and the locking directives", async () => {
    const headers = await allPathsHeaders(PROD);
    const csp = directives(headers["Content-Security-Policy"]);
    const scriptSrc = csp.get("script-src") ?? [];
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    for (const bad of ["*", "https:", "http:", "data:"]) {
      expect(scriptSrc, `script-src contains ${bad}`).not.toContain(bad);
    }
    for (const [name, values] of csp) {
      expect(values.some((v) => v.includes("*")), `${name} contains *`).toBe(false);
    }
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
  });

  it("H4: with NODE_ENV=development only script-src changes, adding 'unsafe-eval'", async () => {
    const dev = await allPathsHeaders({ nodeEnv: "development", supabaseUrl: LOCAL_API });
    expect(directives(dev["Content-Security-Policy"]).get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
    ]);
    expect(dev["Content-Security-Policy"]).toBe(expectedCsp({ dev: true, connect: LOCAL_API }));
    for (const [name, value] of Object.entries(OTHER_HEADERS)) {
      expect(dev[name], `${name} header (dev)`).toBe(value);
    }
  });

  it.each(["production", "test"])("H4: 'unsafe-eval' is absent when NODE_ENV=%s", async (nodeEnv) => {
    const headers = await allPathsHeaders({ nodeEnv, supabaseUrl: LOCAL_API });
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
  });

  it("H5: with NEXT_PUBLIC_SUPABASE_URL unset, connect-src is exactly 'self'", async () => {
    const headers = await allPathsHeaders({ nodeEnv: "production", supabaseUrl: undefined });
    expect(directives(headers["Content-Security-Policy"]).get("connect-src")).toEqual(["'self'"]);
    expect(headers["Content-Security-Policy"]).toBe(expectedCsp());
  });

  it("H5: with NEXT_PUBLIC_SUPABASE_URL empty, connect-src is exactly 'self'", async () => {
    const headers = await allPathsHeaders({ nodeEnv: "production", supabaseUrl: "" });
    expect(headers["Content-Security-Policy"]).toBe(expectedCsp());
  });

  it("H6: a URL with a path, query and an injected directive yields the origin only", async () => {
    const headers = await allPathsHeaders({
      nodeEnv: "production",
      supabaseUrl: `${LOCAL_API}/rest/v1?x=1; script-src *`,
    });
    const csp = headers["Content-Security-Policy"];
    expect(directives(csp).get("connect-src")).toEqual(["'self'", LOCAL_API]);
    expect(csp).toBe(PROD_CSP_LOCAL_API);
    expect(csp).not.toContain("/rest/v1");
    expect(csp.match(/script-src/g)).toHaveLength(1);
  });

  it.each(["javascript:alert(1)", "ftp://127.0.0.1:55421", "not a url", "data:text/html,x"])(
    "H6: NEXT_PUBLIC_SUPABASE_URL=%j fails closed to connect-src 'self'",
    async (supabaseUrl) => {
      const headers = await allPathsHeaders({ nodeEnv: "production", supabaseUrl });
      expect(headers["Content-Security-Policy"]).toBe(expectedCsp());
    },
  );

  it("AC1: the existing options cacheComponents and partialPrefetching stay on", async () => {
    const config = (await loadConfig(PROD)) as NextConfig & { partialPrefetching?: unknown };
    expect(config.cacheComponents).toBe(true);
    expect(config.partialPrefetching).toBe(true);
  });
});
