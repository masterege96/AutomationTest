import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, isJsonContentType, readJsonBody } from "./body";

function req(body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Request("http://127.0.0.1:3000/api/todos", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

async function errorOf(r: Awaited<ReturnType<typeof readJsonBody>>) {
  if (r.ok) throw new Error("expected an error");
  return { status: r.response.status, body: await r.response.json() };
}

describe("isJsonContentType", () => {
  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON"])("accepts %s", (v) => {
    expect(isJsonContentType(v)).toBe(true);
  });
  it.each([null, "", "text/plain", "application/json-patch+json", "multipart/form-data"])("refuses %j", (v) => {
    expect(isJsonContentType(v)).toBe(false);
  });
});

describe("readJsonBody", () => {
  it("parses JSON", async () => {
    expect(await readJsonBody(req('{"title":"x"}'))).toEqual({ ok: true, value: { title: "x" } });
  });

  it("415 for text/plain", async () => {
    const e = await errorOf(await readJsonBody(req('{"title":"x"}', { "content-type": "text/plain" })));
    expect(e.status).toBe(415);
    expect(e.body.error.code).toBe("unsupported_media_type");
  });

  it("413 above 10 KB (bytes, not characters)", async () => {
    const e = await errorOf(await readJsonBody(req(JSON.stringify({ title: "é".repeat(MAX_BODY_BYTES / 2) }))));
    expect(e.status).toBe(413);
    expect(e.body.error.code).toBe("payload_too_large");
  });

  it("413 for a streamed body without Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 4; i++) c.enqueue(chunk);
        c.close();
      },
    });
    const e = await errorOf(await readJsonBody(req(stream)));
    expect(e.status).toBe(413);
  });

  it("exactly 10 KB is read", async () => {
    const body = JSON.stringify({ title: "a".repeat(MAX_BODY_BYTES - 12) });
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_BODY_BYTES);
    expect((await readJsonBody(req(body))).ok).toBe(true);
  });

  it.each(["", "{", "not json", "{'a':1}"])("400 invalid_json for %j", async (b) => {
    const e = await errorOf(await readJsonBody(req(b)));
    expect(e.status).toBe(400);
    expect(e.body).toEqual({ error: { code: "invalid_json", message: "Request body must be valid JSON." } });
  });

  it("400 for invalid UTF-8", async () => {
    const e = await errorOf(await readJsonBody(req(new Uint8Array([0x22, 0xff, 0x22]))));
    expect(e.status).toBe(400);
  });

  it("error responses are no-store", async () => {
    const r = await readJsonBody(req("{"));
    if (r.ok) throw new Error("expected an error");
    expect(r.response.headers.get("cache-control")).toContain("no-store");
  });
});
