import { describe, expect, it } from "vitest";

import { MAX_PENCE, formatPence, parsePounds } from "./money";

describe("formatPence", () => {
  it.each([
    [0, "£0.00"],
    [1, "£0.01"],
    [9, "£0.09"],
    [420, "£4.20"],
    [840, "£8.40"],
    [100_000, "£1,000.00"],
    [1_000_000, "£10,000.00"],
    [-420, "-£4.20"],
    [-1, "-£0.01"],
  ])("formats %i pence as %s", (pence, text) => expect(formatPence(pence)).toBe(text));
});

describe("parsePounds", () => {
  it.each([
    ["4", 400],
    ["4.2", 420],
    ["4.20", 420],
    ["0.01", 1],
    ["0.5", 50],
    ["  12.50  ", 1250],
    ["£12.50", 1250],
    ["£ 12.50", 1250],
    ["1,234.50", 123_450],
    ["10000", 1_000_000],
    ["10,000.00", 1_000_000],
    ["007.10", 710],
  ])("reads %j as %i pence", (text, pence) =>
    expect(parsePounds(text)).toEqual({ ok: true, pence }),
  );

  it.each([
    ["", "Enter an amount."],
    ["   ", "Enter an amount."],
    ["abc", "Enter an amount like 4.20."],
    ["4.205", "Use pounds and pence, like 4.20. No more than two decimal places."],
    ["4.", "Enter an amount like 4.20."],
    [".5", "Enter an amount like 4.20."],
    ["-1", "Enter an amount like 4.20."],
    ["1e3", "Enter an amount like 4.20."],
    ["1,23.00", "Enter an amount like 4.20."],
    ["0", "The amount must be at least 1p."],
    ["0.00", "The amount must be at least 1p."],
    ["10000.01", "The amount can be at most £10,000.00."],
    ["99999999999999999999", "The amount can be at most £10,000.00."],
  ])("rejects %j", (text, message) => expect(parsePounds(text)).toEqual({ ok: false, message }));

  it("round-trips every amount the app allows", () => {
    for (const pence of [1, 9, 10, 99, 100, 101, 12_345, 999_999, MAX_PENCE]) {
      const text = formatPence(pence);
      expect(parsePounds(text)).toEqual({ ok: true, pence });
    }
  });

  it("is not a number type confusion: only strings are accepted", () => {
    expect(parsePounds(null as unknown as string)).toEqual({
      ok: false,
      message: "Enter an amount.",
    });
    expect(parsePounds(4.2 as unknown as string)).toEqual({
      ok: false,
      message: "Enter an amount.",
    });
  });
});
