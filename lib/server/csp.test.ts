import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce, supabaseOrigin } from "./csp";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const SB = "http://127.0.0.1:55421";

describe("buildCsp", () => {
  it("production string equals threat model 6.3 exactly", () => {
    expect(buildCsp({ nonce: NONCE, supabaseUrl: SB, isDev: false })).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ${SB}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
    );
  });

  it("development adds only 'unsafe-eval' to script-src", () => {
    expect(buildCsp({ nonce: NONCE, supabaseUrl: SB, isDev: true })).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ${SB}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
    );
  });

  it("never has 'unsafe-inline' in script-src", () => {
    for (const isDev of [true, false]) {
      const scriptSrc = buildCsp({ nonce: NONCE, supabaseUrl: SB, isDev })
        .split("; ")
        .find((d) => d.startsWith("script-src "));
      expect(scriptSrc).not.toContain("unsafe-inline");
    }
  });

  it.each([undefined, "", "not a url", "javascript:alert(1)", "ftp://x.example", "data:text/plain,x"])(
    "connect-src is 'self' only for %j",
    (url) => {
      expect(buildCsp({ nonce: NONCE, supabaseUrl: url, isDev: false })).toContain("connect-src 'self'; object-src");
    },
  );

  it("uses the origin only of a URL with path, query and an injected directive", () => {
    const csp = buildCsp({ nonce: NONCE, supabaseUrl: "https://x.supabase.co/a?b=c; script-src *", isDev: false });
    expect(csp).toContain("connect-src 'self' https://x.supabase.co; object-src");
    expect(csp).not.toContain("script-src *");
  });

  it.each(["", "abc", "AAAA'; script-src *", `${NONCE} `])("rejects a malformed nonce %j", (nonce) => {
    expect(() => buildCsp({ nonce, supabaseUrl: SB, isDev: false })).toThrow();
  });
});

describe("generateNonce", () => {
  it("returns 1,000 unique 16-byte base64 values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const n = generateNonce();
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      seen.add(n);
    }
    expect(seen.size).toBe(1000);
  });
});

describe("supabaseOrigin", () => {
  it("keeps the port and drops the path", () => {
    expect(supabaseOrigin("http://127.0.0.1:55421/rest/v1")).toBe("http://127.0.0.1:55421");
  });
});
