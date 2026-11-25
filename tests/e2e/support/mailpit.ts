// Reads sign-in emails from the local stack's Mailpit ([local_smtp]) through its HTTP API. Each test uses its own
// address (testEmail), so other tests' and other agents' messages on the shared stack never interfere, and nothing
// is deleted from the shared mailbox.
import { expect } from "@playwright/test";
import { MAILPIT_URL } from "./env";

type Summary = { ID: string; To: { Address: string }[]; Created: string };

export async function messagesTo(email: string): Promise<Summary[]> {
  const url = `${MAILPIT_URL()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mailpit search failed with ${res.status}`);
  const body = (await res.json()) as { messages?: Summary[] };
  return (body.messages ?? []).filter((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
}

export async function countMessagesTo(email: string): Promise<number> {
  return (await messagesTo(email)).length;
}

/** Waits until exactly `count` emails for the address are in Mailpit (fails if more arrive). */
export async function waitForMessageCount(email: string, count: number): Promise<void> {
  await expect.poll(() => countMessagesTo(email), { message: `emails to the test address`, timeout: 15_000 }).toBe(count);
}

/**
 * The 6-digit sign-in code from the newest email to the address. The local email template must show the code
 * (`{{ .Token }}`, brief Question 4b); a link-only email fails here with a clear message.
 */
export async function latestCode(email: string): Promise<string> {
  let messages: Summary[] = [];
  await expect
    .poll(async () => (messages = await messagesTo(email)).length, { message: "sign-in email arrives", timeout: 15_000 })
    .toBeGreaterThan(0);
  const newest = [...messages].sort((a, b) => (a.Created < b.Created ? 1 : -1))[0];
  const res = await fetch(`${MAILPIT_URL()}/api/v1/message/${encodeURIComponent(newest.ID)}`);
  if (!res.ok) throw new Error(`Mailpit message read failed with ${res.status}`);
  const msg = (await res.json()) as { Text?: string; HTML?: string };
  const text = `${msg.Text ?? ""}\n${(msg.HTML ?? "").replace(/<[^>]*>/g, " ")}`;
  // Drop URLs first so digits inside a link's token never count as the code.
  const m = /(?<![\d])(\d{6})(?![\d])/.exec(text.replace(/https?:\/\/\S+/g, " "));
  if (!m) {
    throw new Error(
      "The sign-in email has no 6-digit code. The local templates (supabase/templates/**, devops-cicd) must show {{ .Token }} for both the magic-link and the confirm-signup email.",
    );
  }
  return m[1];
}
