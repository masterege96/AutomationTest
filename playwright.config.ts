import { defineConfig, devices } from "@playwright/test";

// Task 3 e2e + HTTP abuse suites (tests/e2e/**, abuse tests under tests/e2e/abuse/** because they need the running
// app; Vitest excludes tests/e2e/**). verify.sh runs `npm run test:e2e` before `npm run build`, and the CSP ACs need
// a production build, so the web server below builds and starts the app itself.
//
// Required environment (names only; values come from `npx supabase status -o env` at run time, never from a file):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY  (also used by `next build`)
//   MAILPIT_URL                                              (tests read sign-in codes from the local Mailpit)
// Local (Git Bash, stack running):
//   eval "$(npx supabase status -o env | sed -nE 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p; s/^MAILPIT_URL=/export MAILPIT_URL=/p')"
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "MAILPIT_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Playwright: ${missing.join(", ")} not set. Start the local stack and export them from ` +
      "`npx supabase status -o env` (see the comment at the top of playwright.config.ts). Never write them to a file.",
  );
}

// Fixed port: supabase/config.toml site_url is http://127.0.0.1:3000.
const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // One worker, no parallel files: every test shares the local Supabase stack and Mailpit.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // No HTML report, traces or videos: they would record cookies and request headers (threat model row 13).
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm start -- --hostname 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    // Always a fresh production build: a running `next dev` must never be tested by mistake (AC35-AC37).
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
