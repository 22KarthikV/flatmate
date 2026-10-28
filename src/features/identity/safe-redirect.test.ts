import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard?tab=1", "/dashboard?tab=1"],
    ["/more/account", "/more/account"],
    ["/rota#top", "/rota"],
    ["/money?a=1&b=two", "/money?a=1&b=two"],
  ])("accepts the same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["an empty string", ""],
    ["a relative path", "dashboard"],
    ["a protocol-relative URL", "//evil.com"],
    ["three slashes", "///evil.com"],
    ["a backslash host", "/\\evil.com"],
    ["a slash-backslash host", "/\\/evil.com"],
    ["an absolute URL", "https://evil.com/dashboard"],
    ["an absolute URL to this site", "https://flatmate-ten.vercel.app/dashboard"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["an encoded protocol-relative URL", "/%2F%2Fevil.com"],
    ["an encoded backslash host", "/%5Cevil.com"],
    ["a double-encoded host", "/%252F%252Fevil.com"],
    ["a dot-segment trick", "/..//evil.com"],
    ["a tab inside", "/\tevil.com"],
    ["a newline inside", "/dashboard\nSet-Cookie: x=1"],
    ["an encoded newline", "/dashboard%0d%0aSet-Cookie:x=1"],
    ["a null byte", "/dashboard\u0000"],
    ["malformed percent-encoding", "/%E0%A4%A"],
    ["an enormous value", "/" + "a".repeat(3000)],
    ["a non-string", 42 as unknown as string],
  ])("falls back for %s", (_label, input) => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });

  it("never sends people back into the sign-in flow", () => {
    expect(safeNextPath("/sign-in")).toBe("/dashboard");
    expect(safeNextPath("/sign-in?next=/rota")).toBe("/dashboard");
    expect(safeNextPath("/auth/callback?code=abc")).toBe("/dashboard");
    expect(safeNextPath("/auth/error")).toBe("/dashboard");
  });

  it("uses the fallback you give it", () => {
    expect(safeNextPath("//evil.com", "/rota")).toBe("/rota");
    expect(safeNextPath(undefined, "/")).toBe("/");
  });
});
