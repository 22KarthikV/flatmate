import { describe, expect, it } from "vitest";

import { NUDGE_CHOICES, nudgeValue, parseNudgeChoice } from "./nudge";

describe("parseNudgeChoice", () => {
  it.each([
    ["off", null],
    ["3", 3],
    ["7", 7],
    ["14", 14],
  ])("reads %j as %s days", (value, days) => {
    expect(parseNudgeChoice(value)).toEqual({ ok: true, days });
  });

  it.each(["", "5", "0", "-7", "7.5", "seven", "OFF", null, undefined, 7, {}])(
    "rejects %j",
    (value) => {
      expect(parseNudgeChoice(value)).toEqual({ ok: false });
    },
  );
});

describe("nudgeValue", () => {
  it("is the form value for a saved setting", () => {
    expect(nudgeValue(null)).toBe("off");
    expect(nudgeValue(7)).toBe("7");
    expect(nudgeValue(14)).toBe("14");
  });

  it("falls back to the usual 7 days for anything unexpected", () => {
    expect(nudgeValue(undefined)).toBe("7");
    expect(nudgeValue(5)).toBe("7");
  });
});

describe("NUDGE_CHOICES", () => {
  it("offers off, 3, 7 and 14 days, with plain labels", () => {
    expect(NUDGE_CHOICES.map((choice) => [choice.value, choice.label])).toEqual([
      ["off", "Never"],
      ["3", "After 3 days"],
      ["7", "After 7 days (usual)"],
      ["14", "After 14 days"],
    ]);
  });
});
