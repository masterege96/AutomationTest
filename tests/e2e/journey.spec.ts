// Task 3, one full journey in a real browser on the production build: AC1 -> AC10 -> AC12 -> AC13 -> AC14 -> AC8.
// While it runs, every request and response is recorded for AC25 (no secret ever reaches the browser) and every
// CSP violation / console error for AC36 (nonce CSP doesn't break the app).
// Secret values come from `npx supabase status` in memory; assertions report only the secret's NAME, never a value.
import { test, expect } from "./support/fixtures";
import { ANON_KEY, SUPABASE_URL, localStack, testEmail } from "./support/env";
import { authUsersByEmail, todosOf } from "./support/db";
import { addTodoViaUi, expectSignInScreen, setDone, signInViaUi, ui } from "./support/ui";

type Seen = { where: string; text: string };

test("AC25 + AC36: full journey leaks no secret, uses only the anon key, and has no CSP violation", async ({ page }) => {
  const seen: Seen[] = [];
  const pending: Promise<void>[] = [];
  const apikeys = new Set<string>();
  const authStatuses: Record<string, number[]> = {};
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  // Reported to the test process, so violations on every page of the journey survive navigations.
  const violations: string[] = [];
  await page.exposeFunction("__qaReportCsp", (v: string) => {
    violations.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __qaReportCsp: (v: string) => void }).__qaReportCsp(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r) => {
    const headers = r.headers();
    seen.push({ where: `request ${r.method()} ${new URL(r.url()).pathname}`, text: `${r.url()}\n${JSON.stringify(headers)}\n${r.postData() ?? ""}` });
    if (r.url().startsWith(SUPABASE_URL()) && headers.apikey) apikeys.add(headers.apikey);
  });
  page.on("response", (r) => {
    const where = `response ${r.status()} ${new URL(r.url()).pathname}`;
    const m = /\/auth\/v1\/(\w+)/.exec(new URL(r.url()).pathname);
    if (r.url().startsWith(SUPABASE_URL()) && m) (authStatuses[m[1]] ??= []).push(r.status());
    pending.push(
      (async () => {
        const headers = JSON.stringify(await r.allHeaders());
        let body = "";
        try {
          body = await r.text();
        } catch {
          // redirects / aborted responses have no body
        }
        seen.push({ where, text: `${headers}\n${body}` });
      })(),
    );
  });

  const email = testEmail("journey");
  // AC1
  await signInViaUi(page, email);
  const userId = authUsersByEmail(email)[0].id;
  // AC10
  await addTodoViaUi(page, "Journey milk");
  await expect(ui.item(page, "Journey milk")).toBeVisible();
  // AC12
  await setDone(ui.item(page, "Journey milk"), true);
  await expect.poll(() => todosOf(userId)[0]?.done).toBe(true);
  // AC13
  await ui.editButton(ui.item(page, "Journey milk")).click();
  await ui.editInput(page).fill("Journey oat milk");
  await ui.save(page).click();
  await expect(ui.item(page, "Journey oat milk")).toBeVisible();
  // AC14
  await ui.deleteButton(ui.item(page, "Journey oat milk")).click();
  await expect(ui.item(page, "Journey oat milk")).toHaveCount(0);
  await expect.poll(() => todosOf(userId).length).toBe(0);
  // AC8
  await ui.signOut(page).click();
  await expectSignInScreen(page);
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);

  // AC25: no secret value anywhere in what the browser sent or received.
  const stack = localStack();
  expect(stack.secrets.length, "secret values to look for").toBeGreaterThan(0);
  for (const { name, value } of stack.secrets) {
    const hit = seen.find((s) => s.text.includes(value));
    expect(hit === undefined, `${name} found in ${hit?.where ?? ""}`).toBe(true);
  }
  // The only Supabase key the browser uses is the anon/publishable key.
  const allowed = new Set([ANON_KEY(), stack.publishableKey].filter(Boolean));
  expect(apikeys.size, "browser called Supabase with an apikey").toBeGreaterThan(0);
  for (const k of apikeys) expect(allowed.has(k), "apikey sent by the browser is the anon/publishable key").toBe(true);

  // AC36: Supabase auth calls were allowed by connect-src and worked; no CSP violation; no page errors.
  expect(authStatuses.otp, "code request reached Supabase").toEqual([200]);
  expect(authStatuses.verify, "code verification reached Supabase").toEqual([200]);
  expect(violations, "CSP violations during the journey").toEqual([]);
  expect(consoleErrors.filter((e) => /content security policy|refused to (execute|load|connect)/i.test(e)), "CSP console errors").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
});
