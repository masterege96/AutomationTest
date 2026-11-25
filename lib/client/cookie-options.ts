// Supabase session cookie options, shared by the browser client, the server client and the proxy
// (specs/3/threat-model.md 3.2). `secure` depends only on the host the app is served from, never on
// NODE_ENV: false only for loopback hosts (local dev and the e2e build over http), true everywhere else,
// so a production build on a real host can never drop `Secure`.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function cookieOptionsFor(hostname: string): { path: "/"; sameSite: "lax"; secure: boolean } {
  const host = hostname.trim().toLowerCase();
  return { path: "/", sameSite: "lax", secure: !LOOPBACK_HOSTS.has(host) };
}
