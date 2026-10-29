import { describe, expect, it } from "vitest";

import { originFromHeaders } from "./origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("originFromHeaders", () => {
  it("uses the forwarded host and protocol behind a proxy", () => {
    expect(
      originFromHeaders(
        h({ "x-forwarded-host": "flatmate-ten.vercel.app", "x-forwarded-proto": "https" }),
      ),
    ).toBe("https://flatmate-ten.vercel.app");
  });

  it("falls back to the host header", () => {
    expect(originFromHeaders(h({ host: "flatmate-ten.vercel.app" }))).toBe(
      "https://flatmate-ten.vercel.app",
    );
  });

  it("uses http for localhost", () => {
    expect(originFromHeaders(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(originFromHeaders(h({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
  });

  it("takes the first value when a header lists several", () => {
    expect(
      originFromHeaders(
        h({
          "x-forwarded-host": "a.example.com, b.example.com",
          "x-forwarded-proto": "https, http",
        }),
      ),
    ).toBe("https://a.example.com");
  });

  it.each([
    ["missing", {}],
    ["with a path", { host: "evil.com/path" }],
    ["with credentials", { host: "user:pw@evil.com" }],
    ["with spaces", { host: "evil .com" }],
    ["with a scheme", { host: "https://evil.com" }],
  ])("returns null when the host is %s", (_label, headers) => {
    expect(originFromHeaders(h(headers))).toBeNull();
  });

  it("ignores an unknown protocol and assumes https", () => {
    expect(originFromHeaders(h({ host: "flatmate.test", "x-forwarded-proto": "javascript" }))).toBe(
      "https://flatmate.test",
    );
  });
});
