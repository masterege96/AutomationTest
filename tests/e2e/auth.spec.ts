// Task 3, sign-in and sign-out: AC1-AC9 (+ C4 cookie flags). Each test uses its own email address, so the 60 s
// resend limit (max_frequency) never couples two tests. Codes are read from the local Mailpit.
import { test, expect } from "./support/fixtures";
import { ANON_KEY, SUPABASE_URL, testEmail } from "./support/env";
import { countMessagesTo, latestCode, waitForMessageCount } from "./support/mailpit";
import { authUsersByEmail, seedTodo, todoById, todosWithTitle } from "./support/db";
import { ensureConfirmedUser, newUser, sessionFromCookies, tryRefresh } from "./support/auth";
import { RANDOM_UUID, expectError } from "./support/api";
import {
  LIST_PATH,
  TEXT,
  addSession,
  enterCode,
  expectSignInScreen,
  requestCode,
  sessionCookiesIn,
  signInViaUi,
  ui,
} from "./support/ui";

const isAuthCall = (url: string, endpoint: string) => url.startsWith(`${SUPABASE_URL()}/auth/v1/${endpoint}`);

test.describe("sign-in (AC1-AC7)", () => {
  test("AC1 + C4: the emailed code signs in, lands on the list with the email in the header; cookie is SameSite=Lax", async ({ page, context }) => {
    const email = testEmail("ac1");
    await requestCode(page, email);
    await expect(page.getByText(TEXT.codeSent, { exact: true })).toBeVisible();
    await waitForMessageCount(email, 1);
    await enterCode(page, await latestCode(email));
    await expect(ui.newTitle(page)).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    expect(await countMessagesTo(email), "exactly one email").toBe(1);

    // C4 (threat model 5): SameSite=Lax; Secure is off only because the e2e build is served over http://127.0.0.1.
    const cookies = await sessionCookiesIn(context);
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c.sameSite, `${c.name} SameSite`).toBe("Lax");
      expect(c.path, `${c.name} path`).toBe("/");
    }
  });

  test("AC2: a first sign-in creates exactly one confirmed auth.users row and an empty list", async ({ page }) => {
    const email = testEmail("ac2");
    expect(authUsersByEmail(email)).toHaveLength(0);
    await signInViaUi(page, email);
    await expect(page.getByText(TEXT.empty, { exact: true })).toBeVisible();
    const users = authUsersByEmail(email);
    expect(users).toHaveLength(1);
    expect(users[0].email_confirmed_at, "confirmed").not.toBeNull();
  });

  for (const [label, value] of [
    ["empty", ""],
    ["not-an-email", "not-an-email"],
    ["longer than 254 characters", `${"x".repeat(246)}@test.local`],
  ] as const) {
    test(`AC3: invalid email (${label}) shows the message, calls no auth endpoint, sends no email`, async ({ page }) => {
      const authCalls: string[] = [];
      page.on("request", (r) => {
        if (r.url().startsWith(`${SUPABASE_URL()}/auth/v1/`)) authCalls.push(r.url());
      });
      await page.goto(LIST_PATH);
      await expectSignInScreen(page);
      await ui.emailInput(page).fill(value);
      await ui.sendCode(page).click();
      await expect(page.getByText(TEXT.invalidEmail, { exact: true })).toBeVisible();
      await expect(page.getByText(TEXT.codeSent, { exact: true })).toHaveCount(0);
      expect(authCalls, "requests to the auth service").toEqual([]);
      if (value.includes("@")) expect(await countMessagesTo(value)).toBe(0);
    });
  }

  test("AC4: a wrong 6-digit code shows the message, sets no session cookie, and the list stays unreachable", async ({ page, context }) => {
    const email = testEmail("ac4");
    await requestCode(page, email);
    await expect(page.getByText(TEXT.codeSent, { exact: true })).toBeVisible();
    const real = await latestCode(email);
    const wrong = real === "000000" ? "111111" : "000000";
    const verify = page.waitForResponse((r) => isAuthCall(r.url(), "verify"));
    await enterCode(page, wrong);
    expect((await verify).status()).not.toBe(200);
    await expect(page.getByText(TEXT.wrongCode, { exact: true })).toBeVisible();
    expect(await sessionCookiesIn(context)).toEqual([]);
    await page.goto(LIST_PATH);
    await expectSignInScreen(page);
  });

  test("AC5: a code that was already used cannot sign in again after sign-out", async ({ page, context }) => {
    const email = testEmail("ac5");
    const used = await signInViaUi(page, email);
    await ui.signOut(page).click();
    await expectSignInScreen(page);
    // The code is entered again exactly as the browser client sends it (verifyOtp, type "email"). A new code
    // request in the UI is not possible within max_frequency (60 s, AC7) and would invalidate the old code anyway.
    const status = await page.evaluate(
      async ({ url, key, email: e, token }) => {
        const r = await fetch(`${url}/auth/v1/verify`, {
          method: "POST",
          headers: { apikey: key, "content-type": "application/json" },
          body: JSON.stringify({ type: "email", email: e, token }),
        });
        return r.status;
      },
      { url: SUPABASE_URL(), key: ANON_KEY(), email, token: used },
    );
    expect(status, "reused code is refused").toBeGreaterThanOrEqual(400);
    expect(await sessionCookiesIn(context)).toEqual([]);
    await page.goto(LIST_PATH);
    await expectSignInScreen(page);
  });

  test("AC6: known and unknown addresses get the same screen text and the same auth status", async ({ page }) => {
    const known = testEmail("ac6-known");
    await ensureConfirmedUser(known);
    const unknown = testEmail("ac6-unknown");
    const statuses: number[] = [];
    for (const email of [known, unknown]) {
      const otp = page.waitForResponse((r) => isAuthCall(r.url(), "otp"));
      await requestCode(page, email);
      statuses.push((await otp).status());
      await expect(page.getByText(TEXT.codeSent, { exact: true })).toBeVisible();
    }
    expect(statuses[0]).toBe(statuses[1]);
  });

  test("AC7: a second code request within 60 s shows the wait message and sends no second email", async ({ page }) => {
    const email = testEmail("ac7");
    await requestCode(page, email);
    await expect(page.getByText(TEXT.codeSent, { exact: true })).toBeVisible();
    await waitForMessageCount(email, 1);
    const second = page.waitForResponse((r) => isAuthCall(r.url(), "otp"));
    await requestCode(page, email);
    const status = (await second).status();
    await expect(page.getByText(TEXT.tooFast, { exact: true })).toBeVisible();
    expect(status, "second request is rate limited").toBe(429);
    expect(await countMessagesTo(email), "still exactly one email").toBe(1);
  });
});

test.describe("sign-out and signed-out access (AC8, AC9)", () => {
  test("AC8: sign-out clears the session; reload/Back show sign-in; old cookies get 401; old refresh token is revoked", async ({ page, context, api }) => {
    const user = await newUser("ac8");
    const title = `AC8 private ${user.id.slice(0, 8)}`;
    seedTodo(user.id, title);
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    await expect(ui.item(page, title)).toBeVisible();
    const before = (await sessionCookiesIn(context)).map((c) => ({ name: c.name, value: c.value }));
    const oldRefresh = sessionFromCookies(before).refresh_token;
    expect(oldRefresh, "refresh token in the session cookie").toBeTruthy();

    await ui.signOut(page).click();
    await expectSignInScreen(page);
    expect(await sessionCookiesIn(context), "no Supabase session cookie").toEqual([]);

    await page.reload();
    await expectSignInScreen(page);
    await page.goBack();
    await expectSignInScreen(page);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

    const replay = await (await api(before)).list();
    expectError(replay, 401, "unauthorized");
    expect(replay.text).not.toContain(title);

    expect(await tryRefresh(oldRefresh!), "old refresh token is refused").toBeGreaterThanOrEqual(400);
  });

  test("AC9: signed out, the list page shows sign-in with no to-do data, and every API call is 401 with no DB change", async ({ page, api, userA }) => {
    const title = `AC9 secret ${userA.id.slice(0, 8)}`;
    const id = seedTodo(userA.id, title);
    const bodies: string[] = [];
    page.on("response", async (r) => {
      try {
        bodies.push(await r.text());
      } catch {
        // redirects and aborted responses have no body
      }
    });
    await page.goto(LIST_PATH);
    await expectSignInScreen(page);
    await page.waitForLoadState("networkidle");
    expect(bodies.some((b) => b.includes(title)), "to-do title in any response").toBe(false);

    const anon = await api();
    const before = todoById(id);
    expectError(await anon.list(), 401, "unauthorized");
    expectError(await anon.get(id), 401, "unauthorized");
    expectError(await anon.create({ title: "AC9 should not exist" }), 401, "unauthorized");
    expectError(await anon.patch(id, { done: true }), 401, "unauthorized");
    expectError(await anon.del(id), 401, "unauthorized");
    expectError(await anon.del(RANDOM_UUID), 401, "unauthorized");
    expect(todoById(id)).toEqual(before);
    expect(todosWithTitle("AC9 should not exist")).toHaveLength(0);
  });
});
