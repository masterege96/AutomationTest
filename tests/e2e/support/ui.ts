// UI contract the e2e tests rely on. Screen texts are the exact quotes from tasks/3/TASK_BRIEF.md. Paths and
// accessible names that the brief does not fix are qa-test's assumptions, listed in specs/3/test-plan.md
// ("UI contract"): frontend-dev either uses them or tells qa-test, and only this file changes.
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { APP_ORIGIN } from "./env";
import { authCookieName, type SessionCookie } from "./auth";
import { latestCode } from "./mailpit";

// Paths (assumed): the to-do list is the root page; the sign-in screen has its own path. Signed-out visitors of the
// list are sent to the sign-in screen. Tests never depend on the sign-in path except AC35 (CSP on that screen).
export const LIST_PATH = "/";
export const SIGN_IN_PATH = "/login";

export const TEXT = {
  codeSent: "Check your email for a sign-in code.",
  invalidEmail: "Enter a valid email address.",
  wrongCode: "That code is wrong or has expired. Request a new code.",
  tooFast: "Please wait a minute before requesting another code.",
  empty: "No to-dos yet.",
  badTitle: "Title must be 1 to 200 characters.",
  gone: "This to-do no longer exists.",
} as const;

// Accessible names (assumed, except "Add" and "Sign out", which the brief quotes).
export const ui = {
  emailInput: (p: Page) => p.getByLabel("Email address", { exact: true }),
  sendCode: (p: Page) => p.getByRole("button", { name: "Send code", exact: true }),
  codeInput: (p: Page) => p.getByLabel("Sign-in code", { exact: true }),
  signIn: (p: Page) => p.getByRole("button", { name: "Sign in", exact: true }),
  signOut: (p: Page) => p.getByRole("button", { name: "Sign out", exact: true }),
  newTitle: (p: Page) => p.getByLabel("New to-do", { exact: true }),
  add: (p: Page) => p.getByRole("button", { name: "Add", exact: true }),
  list: (p: Page) => p.getByRole("list", { name: "To-dos" }),
  items: (p: Page) => ui.list(p).getByRole("listitem"),
  item: (p: Page, title: string) =>
    ui.items(p).filter({ has: p.getByText(title, { exact: true }) }),
  checkbox: (item: Locator) => item.getByRole("checkbox"),
  editButton: (item: Locator) => item.getByRole("button", { name: /^Edit\b/ }),
  deleteButton: (item: Locator) => item.getByRole("button", { name: /^Delete\b/ }),
  editInput: (p: Page) => p.getByLabel("Edit title", { exact: true }),
  save: (p: Page) => p.getByRole("button", { name: "Save", exact: true }),
};

/** The sign-in screen is showing (email field visible, no to-do list). */
export async function expectSignInScreen(page: Page): Promise<void> {
  await expect(ui.emailInput(page)).toBeVisible();
  await expect(ui.list(page)).toHaveCount(0);
}

export async function requestCode(page: Page, email: string): Promise<void> {
  await page.goto(LIST_PATH);
  await expectSignInScreen(page);
  await ui.emailInput(page).fill(email);
  await ui.sendCode(page).click();
}

export async function enterCode(page: Page, code: string): Promise<void> {
  await ui.codeInput(page).fill(code);
  await ui.signIn(page).click();
}

/** Full UI sign-in with the code from Mailpit (AC1). Returns the code that was used. */
export async function signInViaUi(page: Page, email: string): Promise<string> {
  await requestCode(page, email);
  await expect(page.getByText(TEXT.codeSent, { exact: true })).toBeVisible();
  const code = await latestCode(email);
  await enterCode(page, code);
  await expect(ui.signOut(page)).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  return code;
}

/** Puts an existing session (from support/auth) into a browser context. */
export async function addSession(context: BrowserContext, cookies: SessionCookie[]): Promise<void> {
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, url: APP_ORIGIN, sameSite: "Lax" as const })));
}

export async function sessionCookiesIn(context: BrowserContext) {
  const base = authCookieName();
  return (await context.cookies(APP_ORIGIN)).filter((c) => c.name === base || c.name.startsWith(`${base}.`));
}

export async function addTodoViaUi(page: Page, title: string): Promise<void> {
  await ui.newTitle(page).fill(title);
  await ui.add(page).click();
}

/** True if the title text (or an ancestor inside its list item) is struck through. */
export async function isStruckThrough(item: Locator, title: string): Promise<boolean> {
  return item.getByText(title, { exact: true }).evaluate((el) => {
    let node: Element | null = el;
    while (node && node.tagName !== "LI") {
      if (["S", "DEL", "STRIKE"].includes(node.tagName)) return true;
      if (getComputedStyle(node).textDecorationLine.includes("line-through")) return true;
      node = node.parentElement;
    }
    return false;
  });
}
