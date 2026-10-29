import { describe, expect, it } from "vitest";

import { isSafeInternalPath, parseNotificationId } from "./schemas";

describe("parseNotificationId", () => {
  it("accepts a uuid", () => {
    expect(parseNotificationId("5f0c1b2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f")).toBe(
      "5f0c1b2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f",
    );
  });

  it.each([null, undefined, "", "not-a-uuid", 42, "5f0c1b2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f; drop"])(
    "rejects %s",
    (value) => {
      expect(parseNotificationId(value)).toBeNull();
    },
  );
});

describe("isSafeInternalPath", () => {
  it("allows paths inside the app", () => {
    expect(isSafeInternalPath("/")).toBe(true);
    expect(isSafeInternalPath("/more/flat")).toBe(true);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "more/flat",
    "",
    "javascript:alert(1)",
  ])("refuses %s", (value) => {
    expect(isSafeInternalPath(value)).toBe(false);
  });
});
