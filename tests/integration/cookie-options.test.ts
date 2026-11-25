// Threat model 3.2 / C4: the session cookie's Secure flag is a pure function of the host the app is served from,
// never of NODE_ENV, so a production build on a real host can never drop Secure. SameSite=Lax and path=/ always.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cookieOptionsFor } from "../../lib/client/cookie-options";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cookieOptionsFor (threat model 3.2, C4)", () => {
  it.each(["127.0.0.1", "localhost", "LOCALHOST", "[::1]", "::1"])("C4: loopback host %s gets secure: false", (host) => {
    expect(cookieOptionsFor(host)).toEqual({ path: "/", sameSite: "lax", secure: false });
  });

  it.each(["todos.example.com", "abc.supabase.co", "127.0.0.2", "localhost.evil.example", "", "0.0.0.0"])(
    "C4 (HTTPS case): non-loopback host %j gets secure: true and SameSite=Lax",
    (host) => {
      expect(cookieOptionsFor(host)).toEqual({ path: "/", sameSite: "lax", secure: true });
    },
  );

  it.each(["development", "test", "production"])("C4: NODE_ENV=%s does not change the result", (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    expect(cookieOptionsFor("todos.example.com").secure).toBe(true);
    expect(cookieOptionsFor("127.0.0.1").secure).toBe(false);
  });
});
