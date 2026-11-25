// Task 3, nonce CSP on the production build (row 11): AC35, AC37 and threat model 6.6 N2 (live), N4, N6.
// Expected strings are copied from specs/3/threat-model.md 6.3. Copy changes from there only.
import { request as pwRequest } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { APP_ORIGIN, RUN_ID, SUPABASE_URL } from "./support/env";
import { authCookieName, cookieHeader, newUser, sessionFromCookies, type SessionCookie } from "./support/auth";
import { LIST_PATH, SIGN_IN_PATH, addSession, ui } from "./support/ui";

const NONCE_RE = /^[A-Za-z0-9+/]{22}==$/;

function expectedProdCsp(nonce: string): string {
  const origin = new URL(SUPABASE_URL()).origin;
  return (
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; ` +
    `img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ${origin}; object-src 'none'; base-uri 'self'; ` +
    `form-action 'self'; frame-ancestors 'none'`
  );
}

type Got = { status: number; url: string; csp: string[]; headers: Record<string, string>; body: string; setCookies: string[] };

/** GET with a fresh request context (no stored cookies), following redirects; returns all CSP header values. */
async function get(path: string, opts: { cookies?: SessionCookie[]; headers?: Record<string, string> } = {}): Promise<Got> {
  const ctx = await pwRequest.newContext({ baseURL: APP_ORIGIN });
  try {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.cookies) headers.cookie = cookieHeader(opts.cookies);
    const r = await ctx.get(path, { headers, failOnStatusCode: false });
    const arr = r.headersArray();
    return {
      status: r.status(),
      url: r.url(),
      csp: arr.filter((h) => h.name.toLowerCase() === "content-security-policy").map((h) => h.value),
      headers: r.headers(),
      body: await r.text(),
      setCookies: arr.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value),
    };
  } finally {
    await ctx.dispose();
  }
}

function nonceOf(csp: string): string {
  const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";
  const m = /'nonce-([^']+)'/.exec(scriptSrc);
  expect(m, "script-src has a nonce").not.toBeNull();
  return m![1];
}

/** Exactly one CSP header, equal to the threat model string with its nonce; returns the nonce. */
function expectOneProdCsp(got: Got, where: string): string {
  expect(got.csp, `${where}: number of Content-Security-Policy headers`).toHaveLength(1);
  const nonce = nonceOf(got.csp[0]);
  expect(nonce, `${where}: nonce format`).toMatch(NONCE_RE);
  expect(got.csp[0], `${where}: CSP value`).toBe(expectedProdCsp(nonce));
  const scriptSrc = got.csp[0].split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "))!;
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  return nonce;
}

/** Every <script> in the HTML carries exactly the response's nonce (N4). */
function expectAllScriptsNonced(html: string, nonce: string, where: string): void {
  const tags = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  expect(tags.length, `${where}: scripts in the HTML`).toBeGreaterThan(0);
  for (const tag of tags) expect(tag, `${where}: script tag nonce`).toContain(`nonce="${nonce}"`);
}

const OTHER_HEADERS: Record<string, string> = {
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
};

test.describe("nonce CSP headers (AC35, N4, N2, N6)", () => {
  test("AC35 + N4: /, sign-in, list, 404 and an API response each carry one exact CSP plus the five 2b headers", async ({ userA }) => {
    const cases: [string, Got][] = [
      ["/ (signed out)", await get("/")],
      ["sign-in screen", await get(SIGN_IN_PATH)],
      ["list page (signed in)", await get(LIST_PATH, { cookies: userA.cookies })],
      ["404 page", await get(`/qa-does-not-exist-${RUN_ID}`)],
      ["API response (GET /api/todos, signed out)", await get("/api/todos")],
      ["API response (GET /api/todos, signed in)", await get("/api/todos", { cookies: userA.cookies })],
    ];
    expect(cases[3][1].status, "404 page status").toBe(404);
    expect(cases[4][1].status, "signed-out API status").toBe(401);
    for (const [where, got] of cases) {
      const nonce = expectOneProdCsp(got, where);
      for (const [name, value] of Object.entries(OTHER_HEADERS)) expect(got.headers[name], `${where}: ${name}`).toBe(value);
      if ((got.headers["content-type"] ?? "").includes("text/html")) expectAllScriptsNonced(got.body, nonce, where);
    }
  });

  test("AC35: two requests to the same page get different nonces", async ({ userA }) => {
    for (const [path, cookies] of [["/", undefined], [LIST_PATH, userA.cookies]] as const) {
      const one = nonceOf((await get(path, { cookies })).csp[0]);
      const two = nonceOf((await get(path, { cookies })).csp[0]);
      expect(one).not.toBe(two);
    }
  });

  test("N2 (live): 30 requests give 30 distinct 16-byte base64 nonces", async () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const n = nonceOf((await get(SIGN_IN_PATH)).csp[0]);
      expect(n).toMatch(NONCE_RE);
      nonces.add(n);
    }
    expect(nonces.size).toBe(30);
  });

  test("N4: a client-sent Content-Security-Policy / x-nonce request header cannot choose the nonce", async () => {
    const chosen = "AAAAAAAAAAAAAAAAAAAAAA==";
    const got = await get(SIGN_IN_PATH, {
      headers: { "content-security-policy": `script-src 'nonce-${chosen}'`, "x-nonce": chosen },
    });
    const nonce = expectOneProdCsp(got, "sign-in with forged CSP request header");
    expect(nonce).not.toBe(chosen);
    expect(got.body).not.toContain(`nonce="${chosen}"`);
    expectAllScriptsNonced(got.body, nonce, "sign-in with forged CSP request header");
  });

  test("N4 (6.4): a proxy session refresh keeps the CSP header and sets the new session cookie", async () => {
    const user = await newUser("csp-refresh");
    // Same tokens, but expires_at in the past, so the proxy's getClaims() refreshes the session.
    const session = sessionFromCookies(user.cookies) as Record<string, unknown>;
    session.expires_at = Math.floor(Date.now() / 1000) - 10;
    const stale: SessionCookie[] = [
      { name: authCookieName(), value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` },
    ];
    const got = await get(LIST_PATH, { cookies: stale });
    expectOneProdCsp(got, "list page during a session refresh");
    expect(
      got.setCookies.some((c) => c.startsWith(`${authCookieName()}=`) || c.startsWith(`${authCookieName()}.0=`)),
      "refreshed session cookie is set",
    ).toBe(true);
  });

  test("N6: HTML and API responses for a signed-in user have Cache-Control with no-store", async ({ userA }) => {
    for (const [where, got] of [
      ["list page", await get(LIST_PATH, { cookies: userA.cookies })],
      ["GET /api/todos", await get("/api/todos", { cookies: userA.cookies })],
      ["sign-in screen", await get(SIGN_IN_PATH)],
    ] as const) {
      expect(got.headers["cache-control"] ?? "", `${where}: Cache-Control`).toContain("no-store");
    }
  });
});

test.describe("nonce CSP in the browser (AC37)", () => {
  test("AC37: an inline script without the nonce, added to the DOM, does not run and fires a script-src violation", async ({ page, context, userA }) => {
    const violations: string[] = [];
    const consoleErrors: string[] = [];
    await page.exposeFunction("__qaReportCsp", (v: string) => {
      violations.push(v);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __qaReportCsp: (v: string) => void }).__qaReportCsp(e.violatedDirective);
      });
    });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await addSession(context, userA.cookies);
    await page.goto(LIST_PATH);
    await expect(ui.newTitle(page)).toBeVisible();
    await page.evaluate(() => {
      const s = document.createElement("script");
      s.textContent = "window.__csp = 1";
      document.body.appendChild(s);
    });
    await expect.poll(() => violations.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __csp?: number }).__csp)).toBeUndefined();
    expect(violations.every((v) => v === "script-src" || v === "script-src-elem"), `violated: ${violations.join(", ")}`).toBe(true);
    await expect.poll(() => consoleErrors.some((e) => /content security policy/i.test(e))).toBe(true);
  });

  test("AC37: an inline script without the nonce in the served HTML does not run and fires a violation", async ({ page, context, userA }) => {
    const violations: string[] = [];
    await page.exposeFunction("__qaReportCsp", (v: string) => {
      violations.push(v);
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __qaReportCsp: (v: string) => void }).__qaReportCsp(e.violatedDirective);
      });
    });
    await addSession(context, userA.cookies);
    // Inject into the real response for the list page document; its headers (and so its CSP) are kept.
    await page.route(
      (url) => url.origin === APP_ORIGIN && url.pathname === LIST_PATH,
      async (route) => {
        if (route.request().resourceType() !== "document") return route.continue();
        const response = await route.fetch();
        const html = (await response.text()).replace("</body>", "<script>window.__csp2 = 1</script></body>");
        await route.fulfill({ response, body: html });
      },
    );
    await page.goto(LIST_PATH);
    await expect(ui.newTitle(page)).toBeVisible();
    await expect.poll(() => violations.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __csp2?: number }).__csp2)).toBeUndefined();
    expect(violations.every((v) => v === "script-src" || v === "script-src-elem"), `violated: ${violations.join(", ")}`).toBe(true);
  });
});
