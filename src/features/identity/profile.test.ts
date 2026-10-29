import { describe, expect, it } from "vitest";

import { parseDisplayName } from "./profile";

describe("parseDisplayName", () => {
  it("accepts an ordinary name", () => {
    expect(parseDisplayName("Alice Adams")).toEqual({ ok: true, value: "Alice Adams" });
  });

  it("trims and tidies spacing", () => {
    expect(parseDisplayName("  Alice   Adams  ")).toEqual({ ok: true, value: "Alice Adams" });
  });

  it("accepts accents, other scripts and punctuation", () => {
    expect(parseDisplayName("Zoë O'Neil-Smith")).toEqual({ ok: true, value: "Zoë O'Neil-Smith" });
    expect(parseDisplayName("田中 太郎")).toEqual({ ok: true, value: "田中 太郎" });
  });

  it("accepts exactly 50 characters and rejects 51", () => {
    expect(parseDisplayName("a".repeat(50)).ok).toBe(true);
    expect(parseDisplayName("a".repeat(51))).toEqual({
      ok: false,
      error: "Use 50 characters or fewer.",
    });
  });

  it.each([
    ["an empty value", ""],
    ["only spaces", "    "],
    ["nothing", null],
    ["a file", new File([], "x.txt")],
  ])("asks for a name when given %s", (_label, input) => {
    expect(parseDisplayName(input)).toEqual({ ok: false, error: "Enter a name." });
  });

  it("rejects control characters", () => {
    expect(parseDisplayName("Alice\u0000")).toEqual({
      ok: false,
      error: "Use letters, numbers and ordinary punctuation only.",
    });
    expect(parseDisplayName("Ali\nce").ok).toBe(false);
  });
});
