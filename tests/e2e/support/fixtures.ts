// Shared Playwright fixtures for task 3. `userA` / `userB` are fresh confirmed users with live sessions, created
// once per worker (the suite runs with one worker against the shared local stack). Tests that need an empty list
// or exact counts make their own user with `newUser`.
import { test as base, expect } from "@playwright/test";
import { Api } from "./api";
import { newUser, type SessionCookie, type TestUser } from "./auth";

type TestFixtures = {
  /** Makes an API client with the given session cookies (or none); disposed after the test. */
  api: (cookies?: SessionCookie[]) => Promise<Api>;
};
type WorkerFixtures = { userA: TestUser; userB: TestUser };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  userA: [async ({}, provide) => provide(await newUser("a")), { scope: "worker" }],
  userB: [async ({}, provide) => provide(await newUser("b")), { scope: "worker" }],
  api: async ({}, provide) => {
    const made: Api[] = [];
    await provide(async (cookies) => {
      const a = await Api.create(cookies);
      made.push(a);
      return a;
    });
    for (const a of made) await a.dispose();
  },
});

export { expect };
