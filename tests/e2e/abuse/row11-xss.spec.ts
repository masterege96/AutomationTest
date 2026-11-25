// Baseline row 11 (XSS): AC34 (titles render as text, stored unchanged) and threat model T6 (server-rendered list).
// The CSP side (AC35-AC37) is in tests/e2e/csp.spec.ts; the dangerouslySetInnerHTML check is verify.sh's.
import { test, expect } from "../support/fixtures";
import { newUser } from "../support/auth";
import { seedTodo, todosOf } from "../support/db";
import { APP_ORIGIN } from "../support/env";
import { LIST_PATH, addSession, addTodoViaUi, ui } from "../support/ui";

const PAYLOADS = [
  `<script>window.__xss=1</script>`,
  `<img src=x onerror="window.__xss=1">`,
  `"><svg onload="window.__xss=1">`,
  `javascript:window.__xss=1`,
];

const xssFlag = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss);

test("AC34: script/HTML titles created and edited in the UI show as literal text, never run, and are stored unchanged", async ({ page, context }) => {
  const user = await newUser("ac34");
  let dialogs = 0;
  page.on("dialog", async (d) => {
    dialogs++;
    await d.dismiss();
  });
  await addSession(context, user.cookies);
  await page.goto(LIST_PATH);

  for (const payload of PAYLOADS) {
    await addTodoViaUi(page, payload);
    await expect(ui.item(page, payload)).toBeVisible();
  }
  await page.reload();
  for (const payload of PAYLOADS) {
    const item = ui.item(page, payload);
    await expect(item).toHaveCount(1);
    await ui.editButton(item).click();
    await expect(ui.editInput(page)).toHaveValue(payload);
    // Save it with a suffix, so every payload also goes through the edit path.
    const next = `${payload} (edited)`;
    await ui.editInput(page).fill(next);
    await ui.save(page).click();
    await expect(ui.item(page, next)).toBeVisible();
  }
  await page.reload();
  for (const payload of PAYLOADS) await expect(ui.item(page, `${payload} (edited)`)).toHaveCount(1);
  expect(await xssFlag(page)).toBeUndefined();
  expect(dialogs, "dialogs opened").toBe(0);
  expect(todosOf(user.id).map((t) => t.title).sort()).toEqual(PAYLOADS.map((p) => `${p} (edited)`).sort());
});

test("T6: a </script> title in the server-rendered list stays text and is escaped in the HTML", async ({ page, context, request }) => {
  const user = await newUser("t6");
  const title = `</script><script>window.__xss=1</script>`;
  seedTodo(user.id, title);
  await addSession(context, user.cookies);
  // Raw HTML of the first response (before hydration).
  const cookie = (await context.cookies(APP_ORIGIN)).map((c) => `${c.name}=${c.value}`).join("; ");
  const raw = await (await request.get(LIST_PATH, { headers: { cookie } })).text();
  expect(raw.includes(title), "unescaped payload in the HTML").toBe(false);
  await page.goto(LIST_PATH);
  await expect(ui.item(page, title)).toBeVisible();
  expect(await xssFlag(page)).toBeUndefined();
});
