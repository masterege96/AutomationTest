// Baseline row 9 (guess the login code): AC31. This is a FUNCTIONAL test only. The local stack does not enforce
// the per-IP verify limit (lesson L21), so it does NOT prove row 9 and must not be counted as its proof. Row 9 is
// proven by AC32: tests/integration/auth-config.test.ts (S5, otp_length/expiry, max_frequency) plus the
// production check P1-revised (tasks/3/TASK_BRIEF.md, devops-cicd Handoff), run by the person.
// One code request for one address (well under the local limits); 10 wrong guesses are the AC's own number.
import { test, expect } from "../support/fixtures";
import { SUPABASE_URL, testEmail } from "../support/env";
import { latestCode, waitForMessageCount } from "../support/mailpit";
import { LIST_PATH, TEXT, enterCode, expectSignInScreen, requestCode, sessionCookiesIn } from "../support/ui";

test("AC31 (not row 9 proof, L21): 10 wrong codes through the UI each show the message and never create a session", async ({ page, context }) => {
  const email = testEmail("ac31");
  await requestCode(page, email);
  await expect(page.getByText(TEXT.codeSent, { exact: true })).toBeVisible();
  await waitForMessageCount(email, 1);
  const real = await latestCode(email);
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) {
    let guess = String(100000 + i * 7919).slice(0, 6);
    if (guess === real) guess = String(999999 - i);
    const verify = page.waitForResponse((r) => r.url().startsWith(`${SUPABASE_URL()}/auth/v1/verify`));
    await enterCode(page, guess);
    statuses.push((await verify).status());
    await expect(page.getByText(TEXT.wrongCode, { exact: true })).toBeVisible();
    expect(await sessionCookiesIn(context), `session cookie after attempt ${i + 1}`).toEqual([]);
  }
  expect(statuses.every((s) => s !== 200), `verify statuses: ${statuses.join(",")}`).toBe(true);
  test.info().annotations.push({ type: "AC31 observed verify statuses", description: statuses.join(",") });
  await page.goto(LIST_PATH);
  await expectSignInScreen(page);
});
