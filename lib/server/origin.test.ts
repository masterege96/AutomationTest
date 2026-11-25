import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("isSameOrigin", () => {
  it("accepts an Origin whose host equals Host", () => {
    expect(isSameOrigin(h({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://app.example", host: "app.example" }))).toBe(true);
  });

  it.each<[Record<string, string>, string]>([
    [{ host: "127.0.0.1:3000" }, "missing Origin"],
    [{ origin: "null", host: "127.0.0.1:3000" }, "Origin null"],
    [{ origin: "https://evil.example", host: "127.0.0.1:3000" }, "foreign Origin"],
    [{ origin: "http://127.0.0.1:3001", host: "127.0.0.1:3000" }, "other port"],
    [{ origin: "http://127.0.0.1:3000.evil.example", host: "127.0.0.1:3000" }, "suffix trick"],
    [{ origin: "http://127.0.0.1:3000/path", host: "127.0.0.1:3000" }, "not a bare origin"],
    [{ origin: "file://127.0.0.1:3000", host: "127.0.0.1:3000" }, "non-http scheme"],
    [{ origin: "garbage", host: "127.0.0.1:3000" }, "unparsable"],
    [{ origin: "http://127.0.0.1:3000" }, "missing Host"],
  ])("refuses %j (%s)", (init) => {
    expect(isSameOrigin(h(init))).toBe(false);
  });
});
