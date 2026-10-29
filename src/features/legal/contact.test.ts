import { describe, expect, it } from "vitest";

import { resolveContact } from "./contact";

describe("resolveContact", () => {
  it("uses the configured email address", () => {
    expect(resolveContact("hello@example.com")).toEqual({
      kind: "email",
      email: "hello@example.com",
    });
    expect(resolveContact("  hello@example.com ")).toEqual({
      kind: "email",
      email: "hello@example.com",
    });
  });

  it.each([undefined, "", "   ", "not-an-email", "a@b", "two words@example.com"])(
    "falls back to the public issue tracker for %s",
    (value) => {
      expect(resolveContact(value)).toEqual({
        kind: "issues",
        url: "https://github.com/22KarthikV/flatmate/issues",
      });
    },
  );
});
