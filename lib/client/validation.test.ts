import { describe, expect, it } from "vitest";
import { isValidCode, isValidEmail, normalizeTitle } from "./validation";

describe("isValidEmail (UX check, AC3)", () => {
  it.each(["a@b.co", "  user@example.com  ", `${"a".repeat(242)}@example.com`])("accepts %j", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "   ", "not-an-email", "a@b", "a b@c.de", `${"a".repeat(243)}@example.com`])("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("isValidCode", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidCode("123456")).toBe(true);
    expect(isValidCode(" 123456 ")).toBe(true);
  });

  it.each(["", "12345", "1234567", "12345a", "12 456"])("rejects %j", (code) => {
    expect(isValidCode(code)).toBe(false);
  });
});

describe("normalizeTitle (AC16/AC17 mirror)", () => {
  it("trims and keeps 1 to 200 code points", () => {
    expect(normalizeTitle("  Buy milk  ")).toBe("Buy milk");
    expect(normalizeTitle("x")).toBe("x");
    expect(normalizeTitle("a".repeat(200))).toBe("a".repeat(200));
    expect(normalizeTitle("\u{1F600}".repeat(200))).toBe("\u{1F600}".repeat(200));
  });

  it("rejects empty, whitespace-only and over-long titles", () => {
    expect(normalizeTitle("")).toBeNull();
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle("\t\n ")).toBeNull();
    expect(normalizeTitle("a".repeat(201))).toBeNull();
    expect(normalizeTitle(` ${"a".repeat(201)} `)).toBeNull();
    expect(normalizeTitle("\u{1F600}".repeat(201))).toBeNull();
  });

  it("keeps markup as plain text", () => {
    expect(normalizeTitle("<script>window.__xss=1</script>")).toBe("<script>window.__xss=1</script>");
  });
});
