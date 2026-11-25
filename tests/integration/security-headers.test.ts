// Security headers in next.config.ts, baseline row 11 (XSS / clickjacking).
// Task 2b set six static headers here (H1-H7, specs/2b/threat-model.md section D). Task 3 moves the
// Content-Security-Policy to a per-request nonce policy in proxy.ts + lib/server/csp.ts (specs/3/threat-model.md 6.1),
// so this file now checks N3: no CSP in headers(), the five other 2b headers byte for byte, and the 6.5 rendering
// options. The CSP string itself is unit-tested in tests/integration/csp.test.ts; the live header in
// tests/e2e/csp.spec.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const NEXT_CONFIG_MODULE = "../../next.config";

// Local API URL from supabase/config.toml ([api] port 55421). A test value, not a secret.
const LOCAL_API = "http://127.0.0.1:55421";

// Exact values from specs/2b/threat-model.md A2 (unchanged by specs/3/threat-model.md 6.1). Copy changes from there only.
const FIVE_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

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

const PROD = { nodeEnv: "production", supabaseUrl: LOCAL_API };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("security headers in next.config.ts (task 2b row 11, task 3 N3)", () => {
  it("N3/H1: exactly one rule covers all paths and it carries exactly the five non-CSP headers", async () => {
    const rules = await loadRules(PROD);
    const allPaths = rules.filter((r) => r.source === "/(.*)");
    expect(allPaths).toHaveLength(1);
    const keys = allPaths[0].headers.map((h) => h.key).sort();
    expect(keys).toEqual(Object.keys(FIVE_HEADERS).sort());
  });

  it.each(["/", "/does-not-exist", "/api/todos", "/_next/static/chunks/main.js", "/next.svg"])(
    "H1/AC2: the all-paths rule source matches %s",
    async (path) => {
      const rules = await loadRules(PROD);
      const source = rules.find((r) => r.source === "/(.*)")?.source;
      expect(source).toBeDefined();
      expect(new RegExp(`^${source}$`).test(path)).toBe(true);
    },
  );

  it.each(Object.entries(FIVE_HEADERS))("N3/H2: %s equals %j exactly", async (name, value) => {
    const headers = await allPathsHeaders(PROD);
    expect(headers[name], `${name} header`).toBe(value);
  });

  it.each([
    ["production", LOCAL_API],
    ["development", LOCAL_API],
    ["test", LOCAL_API],
    ["production", undefined],
  ] as const)(
    "N3: no rule in headers() sets Content-Security-Policy (NODE_ENV=%s, NEXT_PUBLIC_SUPABASE_URL=%s); the proxy owns it",
    async (nodeEnv, supabaseUrl) => {
      const rules = await loadRules({ nodeEnv, supabaseUrl });
      for (const rule of rules) {
        for (const { key } of rule.headers) {
          expect(key.toLowerCase(), `rule ${rule.source}`).not.toBe("content-security-policy");
          expect(key.toLowerCase(), `rule ${rule.source}`).not.toBe("content-security-policy-report-only");
        }
      }
    },
  );

  it("N3: the five headers don't depend on NODE_ENV or NEXT_PUBLIC_SUPABASE_URL", async () => {
    const prod = await allPathsHeaders(PROD);
    expect(await allPathsHeaders({ nodeEnv: "development", supabaseUrl: LOCAL_API })).toEqual(prod);
    expect(await allPathsHeaders({ nodeEnv: "production", supabaseUrl: undefined })).toEqual(prod);
  });

  it("6.5: cacheComponents is false and partialPrefetching is not set (nonce CSP needs per-request rendering)", async () => {
    const config = (await loadConfig(PROD)) as NextConfig & {
      partialPrefetching?: unknown;
      experimental?: Record<string, unknown>;
    };
    expect(config.cacheComponents).toBe(false);
    expect("partialPrefetching" in config, "top-level partialPrefetching").toBe(false);
    expect(config.experimental?.partialPrefetching, "experimental.partialPrefetching").toBeUndefined();
    expect(config.experimental?.ppr, "experimental.ppr").toBeUndefined();
  });
});
