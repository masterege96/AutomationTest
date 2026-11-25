import { describe, expect, it } from "vitest";
import { cookieOptionsFor } from "./cookie-options";

describe("cookieOptionsFor (threat model 3.2, C4)", () => {
  it.each(["localhost", "127.0.0.1", "[::1]", "::1", "LOCALHOST", "LocalHost"])(
    "loopback host %j: secure false",
    (host) => {
      expect(cookieOptionsFor(host)).toEqual({ path: "/", sameSite: "lax", secure: false });
    },
  );

  it.each(["example.com", "app.example.com", "EXAMPLE.COM", "todo.vercel.app", "127.0.0.2", "localhost.evil.example", "my-localhost", "10.0.0.1"])(
    "other host %j: secure true",
    (host) => {
      expect(cookieOptionsFor(host)).toEqual({ path: "/", sameSite: "lax", secure: true });
    },
  );

  it("always sets path / and SameSite=Lax", () => {
    for (const host of ["localhost", "example.com"]) {
      const options = cookieOptionsFor(host);
      expect(options.path).toBe("/");
      expect(options.sameSite).toBe("lax");
    }
  });
});
