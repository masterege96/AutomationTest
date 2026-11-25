// Task 3, to-do happy paths and UI error states: AC10-AC17 (UI parts), AC42-AC44 (UI parts), AC15.
// Each test gets its own fresh user (session from support/auth, no email), so list contents are exact.
import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { testEmail } from "./support/env";
import { authUsersByEmail, todoById, todosOf, seedTodo } from "./support/db";
import { newUser, sessionFor } from "./support/auth";
import { LIST_PATH, TEXT, addSession, addTodoViaUi, expectSignInScreen, isStruckThrough, setDone, signInViaUi, ui } from "./support/ui";

/** Waits until every to-do API request this page started has a response. */
function trackApi(page: Page) {
  let started = 0;
  let finished = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/todos") && r.method() !== "GET") started++;
  });
  const done = () => finished++;
  page.on("requestfinished", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/todos") && r.method() !== "GET") done();
  });
  page.on("requestfailed", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/todos") && r.method() !== "GET") done();
  });
  return {
    started: () => started,
    settled: () => expect.poll(() => started > 0 && finished === started, { message: "API requests settled" }).toBe(true),
  };
}

test.describe("to-dos, happy paths (AC10-AC15)", () => {
  test("AC10: Add creates 'Buy milk' at the top, not done, one DB row owned by the user", async ({ page, context }) => {
    const user = await newUser("ac10");
    seedTodo(user.id, "Older one", { ageSeconds: 60 });
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    await addTodoViaUi(page, "Buy milk");
    await expect(ui.items(page).first()).toContainText("Buy milk");
    await expect(ui.checkbox(ui.item(page, "Buy milk"))).not.toBeChecked();
    await expect.poll(() => todosOf(user.id).filter((t) => t.title === "Buy milk").length).toBe(1);
    const row = todosOf(user.id).find((t) => t.title === "Buy milk")!;
    expect(row.user_id).toBe(user.id);
    expect(row.done).toBe(false);
  });

  test("AC11: the list shows exactly the user's 3 to-dos newest first and none of B's in any response", async ({ page, context }) => {
    const a = await newUser("ac11a");
    const b = await newUser("ac11b");
    const aTitles = ["A first", "A second", "A third"].map((t) => `${t} ${a.id.slice(0, 6)}`);
    aTitles.forEach((t, i) => seedTodo(a.id, t, { ageSeconds: 300 - i * 100 }));
    const bTitles = [`B one ${b.id.slice(0, 6)}`, `B two ${b.id.slice(0, 6)}`];
    bTitles.forEach((t, i) => seedTodo(b.id, t, { ageSeconds: 50 - i * 10 }));

    const bodies: string[] = [];
    page.on("response", async (r) => {
      try {
        bodies.push(await r.text());
      } catch {
        // no body
      }
    });
    await addSession(context, a.cookies);
    await page.goto(LIST_PATH);
    await expect(ui.items(page)).toHaveCount(3);
    for (const [i, t] of [...aTitles].reverse().entries()) await expect(ui.items(page).nth(i)).toContainText(t);
    await page.waitForLoadState("networkidle");
    for (const t of bTitles) {
      expect(bodies.some((x) => x.includes(t)), `B's title in a response`).toBe(false);
      await expect(page.getByText(t)).toHaveCount(0);
    }
  });

  test("AC12: checking marks done (checked, struck through, DB, survives reload); unchecking reverses it", async ({ page, context }) => {
    const user = await newUser("ac12");
    const id = seedTodo(user.id, "Toggle me");
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    for (const target of [true, false]) {
      const item = ui.item(page, "Toggle me");
      await setDone(item, target);
      await expect.poll(() => todoById(id)?.done).toBe(target);
      await page.reload();
      const after = ui.item(page, "Toggle me");
      if (target) await expect(ui.checkbox(after)).toBeChecked();
      else await expect(ui.checkbox(after)).not.toBeChecked();
      expect(await isStruckThrough(after, "Toggle me")).toBe(target);
    }
  });

  test("AC13: editing 'Buy milk' to 'Buy oat milk' updates list and DB, keeps done and owner", async ({ page, context }) => {
    const user = await newUser("ac13");
    const id = seedTodo(user.id, "Buy milk", { done: true });
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    await ui.editButton(ui.item(page, "Buy milk")).click();
    await expect(ui.editInput(page)).toHaveValue("Buy milk");
    await ui.editInput(page).fill("Buy oat milk");
    await ui.save(page).click();
    await expect(ui.item(page, "Buy oat milk")).toBeVisible();
    await expect.poll(() => todoById(id)?.title).toBe("Buy oat milk");
    const row = todoById(id)!;
    expect(row.done).toBe(true);
    expect(row.user_id).toBe(user.id);
  });

  test("AC14: delete removes the to-do from the list and the DB, and it stays gone after reload", async ({ page, context }) => {
    const user = await newUser("ac14");
    const id = seedTodo(user.id, "Delete me");
    seedTodo(user.id, "Keep me", { ageSeconds: 10 });
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    await ui.deleteButton(ui.item(page, "Delete me")).click();
    await expect(ui.item(page, "Delete me")).toHaveCount(0);
    await expect.poll(() => todoById(id)).toBeUndefined();
    await page.reload();
    await expect(ui.item(page, "Keep me")).toBeVisible();
    await expect(ui.item(page, "Delete me")).toHaveCount(0);
  });

  test("AC15: after sign-out and a new sign-in in a new browser context, the same to-dos and done states show", async ({ browser }) => {
    // First sign-in through the UI (Mailpit code). The second sign-in is a real session for the same address made
    // through the admin code (support/auth), because a second UI code request within 60 s is refused by design
    // (max_frequency, AC7) and an admin-generated code counts as a send too, so the order can't be reversed.
    const email = testEmail("ac15");
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    await signInViaUi(p1, email);
    const userId = authUsersByEmail(email)[0].id;
    await addTodoViaUi(p1, "Persist one");
    await expect(ui.item(p1, "Persist one")).toBeVisible();
    await addTodoViaUi(p1, "Persist two");
    await expect(ui.item(p1, "Persist two")).toBeVisible();
    await setDone(ui.item(p1, "Persist one"), true);
    await expect.poll(() => todosOf(userId).find((t) => t.title === "Persist one")?.done).toBe(true);
    await ui.signOut(p1).click();
    await expectSignInScreen(p1);
    await ctx1.close();

    const second = await sessionFor(email);
    expect(second.id).toBe(userId);
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await addSession(ctx2, second.cookies);
    await p2.goto(LIST_PATH);
    await expect(ui.items(p2)).toHaveCount(2);
    await expect(ui.checkbox(ui.item(p2, "Persist one"))).toBeChecked();
    await expect(ui.checkbox(ui.item(p2, "Persist two"))).not.toBeChecked();
    await ctx2.close();
  });
});

test.describe("title validation in the UI (AC16, AC17)", () => {
  test("AC16 (UI): '  Buy milk  ' is stored and shown trimmed; 200 emoji are accepted", async ({ page, context }) => {
    const user = await newUser("ac16ui");
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    await addTodoViaUi(page, "  Buy milk  ");
    await expect(ui.item(page, "Buy milk")).toBeVisible();
    const emoji = "\u{1F600}".repeat(200);
    await addTodoViaUi(page, emoji);
    await expect(ui.item(page, emoji)).toBeVisible();
    await expect.poll(() => todosOf(user.id).map((t) => t.title).sort()).toEqual(["Buy milk", emoji].sort());
  });

  for (const [label, value] of [
    ["empty", ""],
    ["whitespace only", "   "],
    ["201 characters", "a".repeat(201)],
  ] as const) {
    test(`AC17 (UI): create with ${label} shows the title message, keeps the input, creates nothing`, async ({ page, context }) => {
      const user = await newUser("ac17ui");
      await addSession(context, user.cookies);
      await page.goto(LIST_PATH);
      await ui.newTitle(page).fill(value);
      await ui.add(page).click();
      await expect(page.getByText(TEXT.badTitle, { exact: true })).toBeVisible();
      await expect(ui.newTitle(page)).toHaveValue(value);
      expect(todosOf(user.id)).toHaveLength(0);
    });
  }

  test("AC17 (UI): editing to whitespace only or 201 characters shows the message and changes nothing", async ({ page, context }) => {
    const user = await newUser("ac17edit");
    const id = seedTodo(user.id, "Stay as is");
    const before = todoById(id);
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    for (const value of ["   ", "b".repeat(201)]) {
      await page.reload();
      await ui.editButton(ui.item(page, "Stay as is")).click();
      await ui.editInput(page).fill(value);
      await ui.save(page).click();
      await expect(page.getByText(TEXT.badTitle, { exact: true })).toBeVisible();
      await expect(ui.editInput(page)).toHaveValue(value);
      expect(todoById(id)).toEqual(before);
    }
  });
});

test.describe("duplicate and rapid actions in the UI (AC42-AC44)", () => {
  test("AC42: double-clicking Add creates exactly one to-do", async ({ page, context }) => {
    const user = await newUser("ac42a");
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    const api = trackApi(page);
    await ui.newTitle(page).fill("Only once (click)");
    await ui.add(page).dblclick();
    await expect(ui.item(page, "Only once (click)")).toHaveCount(1);
    await api.settled();
    expect(todosOf(user.id).filter((t) => t.title === "Only once (click)")).toHaveLength(1);
    await page.reload();
    await expect(ui.item(page, "Only once (click)")).toHaveCount(1);
  });

  test("AC42: pressing Enter twice quickly creates exactly one to-do", async ({ page, context }) => {
    const user = await newUser("ac42b");
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    const api = trackApi(page);
    await ui.newTitle(page).fill("Only once (enter)");
    await ui.newTitle(page).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(ui.item(page, "Only once (enter)")).toHaveCount(1);
    await api.settled();
    expect(todosOf(user.id).filter((t) => t.title === "Only once (enter)")).toHaveLength(1);
  });

  test("AC43 (UI): 5 quick checkbox clicks end with UI and DB in the same state after reload", async ({ page, context }) => {
    const user = await newUser("ac43ui");
    const id = seedTodo(user.id, "Click storm");
    await addSession(context, user.cookies);
    await page.goto(LIST_PATH);
    const api = trackApi(page);
    for (let i = 0; i < 5; i++) await ui.checkbox(ui.item(page, "Click storm")).click();
    await api.settled();
    await page.reload();
    const done = todoById(id)!.done;
    if (done) await expect(ui.checkbox(ui.item(page, "Click storm"))).toBeChecked();
    else await expect(ui.checkbox(ui.item(page, "Click storm"))).not.toBeChecked();
  });

  test("AC44 (UI): acting on a to-do deleted in another tab shows the message, removes it, creates nothing", async ({ context }) => {
    const user = await newUser("ac44ui");
    const ids = {
      toggle: seedTodo(user.id, "Gone toggle", { ageSeconds: 30 }),
      edit: seedTodo(user.id, "Gone edit", { ageSeconds: 20 }),
      del: seedTodo(user.id, "Gone delete", { ageSeconds: 10 }),
    };
    await addSession(context, user.cookies);
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();
    await tab1.goto(LIST_PATH);
    await tab2.goto(LIST_PATH);
    await expect(ui.items(tab2)).toHaveCount(3);
    for (const title of ["Gone toggle", "Gone edit", "Gone delete"]) {
      await ui.deleteButton(ui.item(tab1, title)).click();
      await expect(ui.item(tab1, title)).toHaveCount(0);
    }
    await expect.poll(() => todosOf(user.id).length).toBe(0);

    await ui.checkbox(ui.item(tab2, "Gone toggle")).click();
    await expect(tab2.getByText(TEXT.gone, { exact: true })).toBeVisible();
    await expect(ui.item(tab2, "Gone toggle")).toHaveCount(0);

    await ui.editButton(ui.item(tab2, "Gone edit")).click();
    await ui.editInput(tab2).fill("Gone edit renamed");
    await ui.save(tab2).click();
    await expect(ui.item(tab2, "Gone edit")).toHaveCount(0);
    await expect(ui.item(tab2, "Gone edit renamed")).toHaveCount(0);

    await ui.deleteButton(ui.item(tab2, "Gone delete")).click();
    await expect(ui.item(tab2, "Gone delete")).toHaveCount(0);
    await expect(tab2.getByText(TEXT.gone, { exact: true }).first()).toBeVisible();

    expect(todosOf(user.id)).toHaveLength(0);
    for (const id of Object.values(ids)) expect(todoById(id)).toBeUndefined();
  });
});
