import { describe, expect, it } from "vitest";

import { parseHouseholdName } from "./schemas";

describe("parseHouseholdName", () => {
  it("trims and tidies spaces", () => {
    expect(parseHouseholdName("  Flat   12 ")).toEqual({ ok: true, value: "Flat 12" });
  });

  it("accepts 50 characters and refuses 51", () => {
    expect(parseHouseholdName("x".repeat(50)).ok).toBe(true);
    expect(parseHouseholdName("x".repeat(51))).toEqual({
      ok: false,
      error: "Use 50 characters or fewer.",
    });
  });

  it.each([null, "", "   ", 42])("asks for a name when given %s", (value) => {
    expect(parseHouseholdName(value as FormDataEntryValue | null)).toEqual({
      ok: false,
      error: "Enter a name for your flat.",
    });
  });

  it("refuses control characters, even a trailing one", () => {
    expect(parseHouseholdName("Flat\u0000 12").ok).toBe(false);
    expect(parseHouseholdName("Flat 12\n\u0007").ok).toBe(false);
  });
});
