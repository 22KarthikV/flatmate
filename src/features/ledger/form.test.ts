import { describe, expect, it } from "vitest";

import {
  buildSplit,
  deriveInitialSplit,
  parseExpenseId,
  londonToday,
  parseExpenseFields,
  parsePercent,
  rawFromFormData,
  type RawExpense,
} from "./form";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const MEMBERS = [A, B, C];
const TODAY = "2026-10-30";

function raw(overrides: Partial<RawExpense> = {}): RawExpense {
  return {
    amount: "9.00",
    description: "Kitchen roll",
    category: "household",
    occurredOn: TODAY,
    paidBy: A,
    mode: "equal",
    who: [A, B, C],
    exact: {},
    percent: {},
    one: "",
    ...overrides,
  };
}

describe("parsePercent", () => {
  it.each([
    ["50", 5000],
    ["33.33", 3333],
    ["33.3", 3330],
    ["0", 0],
    ["100", 10_000],
    [" 12.5% ", 1250],
    ["7%", 700],
  ])("reads %j as %i hundredths of a percent", (text, basisPoints) =>
    expect(parsePercent(text)).toEqual({ ok: true, basisPoints }),
  );

  it.each([
    ["abc", "Enter a percentage like 33.33."],
    ["-5", "Enter a percentage like 33.33."],
    ["1e2", "Enter a percentage like 33.33."],
    ["33.333", "Use at most two decimal places for a percentage."],
    ["100.01", "A percentage can't be more than 100."],
    ["101", "A percentage can't be more than 100."],
  ])("rejects %j", (text, message) => expect(parsePercent(text)).toEqual({ ok: false, message }));
});

describe("buildSplit", () => {
  it("splits equally between the people ticked", () => {
    expect(buildSplit(raw({ who: [A, B] }), MEMBERS)).toEqual({
      ok: true,
      amountPence: 900,
      shares: [
        { profileId: A, pence: 450 },
        { profileId: B, pence: 450 },
      ],
    });
  });

  it("splits by exact amounts, treating blanks as nothing", () => {
    expect(
      buildSplit(raw({ mode: "exact", exact: { [A]: "5", [B]: "4.00", [C]: "" } }), MEMBERS),
    ).toEqual({
      ok: true,
      amountPence: 900,
      shares: [
        { profileId: A, pence: 500 },
        { profileId: B, pence: 400 },
      ],
    });
  });

  it("says how far out exact amounts are", () => {
    const result = buildSplit(raw({ mode: "exact", exact: { [A]: "5", [B]: "3" } }), MEMBERS);
    expect(result).toEqual({
      ok: false,
      message: "The amounts add up to £8.00, but the expense is £9.00. £1.00 is left to share out.",
    });
  });

  it("splits by percentages", () => {
    expect(
      buildSplit(raw({ mode: "percent", percent: { [A]: "50", [B]: "25", [C]: "25" } }), MEMBERS),
    ).toEqual({
      ok: true,
      amountPence: 900,
      shares: [
        { profileId: A, pence: 450 },
        { profileId: B, pence: 225 },
        { profileId: C, pence: 225 },
      ],
    });
  });

  it("explains percentages that do not make 100", () => {
    expect(
      buildSplit(raw({ mode: "percent", percent: { [A]: "50", [B]: "30" } }), MEMBERS),
    ).toEqual({
      ok: false,
      message: "The percentages must add up to 100%. They add up to 80%.",
    });
  });

  it("puts the whole amount on one person", () => {
    expect(buildSplit(raw({ mode: "one", one: C }), MEMBERS)).toEqual({
      ok: true,
      amountPence: 900,
      shares: [{ profileId: C, pence: 900 }],
    });
  });

  it("needs someone to be chosen", () => {
    expect(buildSplit(raw({ mode: "one", one: "" }), MEMBERS)).toEqual({
      ok: false,
      message: "Choose who this is for.",
    });
    expect(buildSplit(raw({ who: [] }), MEMBERS)).toEqual({
      ok: false,
      message: "Choose at least one person.",
    });
  });

  it("refuses anyone who is not in the flat", () => {
    const stranger = "00000000-0000-0000-0000-0000000000ff";
    const message = "Choose from the people in your flat.";
    expect(buildSplit(raw({ who: [A, stranger] }), MEMBERS)).toEqual({ ok: false, message });
    expect(buildSplit(raw({ mode: "one", one: stranger }), MEMBERS)).toEqual({
      ok: false,
      message,
    });
    expect(buildSplit(raw({ mode: "exact", exact: { [stranger]: "9" } }), MEMBERS)).toEqual({
      ok: false,
      message,
    });
  });

  it("reports a bad amount before anything else", () => {
    expect(buildSplit(raw({ amount: "abc" }), MEMBERS)).toEqual({
      ok: false,
      message: "Enter an amount like 4.20.",
    });
    expect(buildSplit(raw({ amount: "" }), MEMBERS)).toEqual({
      ok: false,
      message: "Enter an amount.",
    });
  });

  it("reports an unknown split mode", () => {
    expect(buildSplit(raw({ mode: "weird" }), MEMBERS)).toEqual({
      ok: false,
      message: "Choose how to split it.",
    });
  });

  it("explains a bad share amount by name of the problem", () => {
    expect(buildSplit(raw({ mode: "exact", exact: { [A]: "x", [B]: "9" } }), MEMBERS)).toEqual({
      ok: false,
      message: "Enter an amount like 4.20.",
    });
  });
});

describe("parseExpenseFields", () => {
  it("accepts a complete expense", () => {
    expect(parseExpenseFields(raw({ description: "  Kitchen roll " }), MEMBERS, TODAY)).toEqual({
      ok: true,
      value: {
        amountPence: 900,
        description: "Kitchen roll",
        category: "household",
        occurredOn: TODAY,
        paidBy: A,
        profileIds: [A, B, C],
        sharePence: [300, 300, 300],
      },
    });
  });

  it.each([
    [{ description: "   " }, "Add a short description."],
    [{ description: "x".repeat(81) }, "Keep the description to 80 characters or fewer."],
    [{ category: "cars" }, "Choose a category."],
    [{ occurredOn: "" }, "Choose the date."],
    [{ occurredOn: "30/10/2026" }, "Choose the date."],
    [{ occurredOn: "2026-02-30" }, "Choose the date."],
    [{ occurredOn: "2026-12-01" }, "That date is too far ahead."],
    [{ occurredOn: "2021-10-29" }, "That date is too long ago."],
    [{ paidBy: "" }, "Choose who paid."],
    [{ paidBy: "00000000-0000-0000-0000-0000000000ff" }, "Choose who paid."],
  ])("rejects %j", (overrides, message) => {
    expect(parseExpenseFields(raw(overrides), MEMBERS, TODAY)).toEqual({ ok: false, message });
  });

  it("allows the edges of the date range", () => {
    expect(parseExpenseFields(raw({ occurredOn: "2026-11-29" }), MEMBERS, TODAY).ok).toBe(true);
    expect(parseExpenseFields(raw({ occurredOn: "2021-10-30" }), MEMBERS, TODAY).ok).toBe(true);
    expect(parseExpenseFields(raw({ occurredOn: "2026-11-30" }), MEMBERS, TODAY).ok).toBe(false);
    expect(parseExpenseFields(raw({ occurredOn: "2021-10-29" }), MEMBERS, TODAY).ok).toBe(false);
  });

  it("passes on the split's own message", () => {
    expect(parseExpenseFields(raw({ mode: "one", one: "" }), MEMBERS, TODAY)).toEqual({
      ok: false,
      message: "Choose who this is for.",
    });
  });
});

describe("rawFromFormData", () => {
  it("reads every field, including the per-person amounts and percentages", () => {
    const form = new FormData();
    form.set("amount", "12.50");
    form.set("description", "Pizza");
    form.set("category", "takeaway");
    form.set("occurredOn", TODAY);
    form.set("paidBy", B);
    form.set("mode", "exact");
    form.append("who", A);
    form.append("who", C);
    form.set("one", C);
    form.set(`exact:${A}`, "7.50");
    form.set(`exact:${B}`, "5");
    form.set(`percent:${A}`, "60");
    expect(rawFromFormData(form)).toEqual({
      amount: "12.50",
      description: "Pizza",
      category: "takeaway",
      occurredOn: TODAY,
      paidBy: B,
      mode: "exact",
      who: [A, C],
      one: C,
      exact: { [A]: "7.50", [B]: "5" },
      percent: { [A]: "60" },
    });
  });

  it("treats missing fields as empty, and ignores files and unknown fields", () => {
    const form = new FormData();
    form.set("surprise", "boo");
    form.set("amount", new File(["x"], "x.txt"));
    expect(rawFromFormData(form)).toEqual({
      amount: "",
      description: "",
      category: "",
      occurredOn: "",
      paidBy: "",
      mode: "",
      who: [],
      one: "",
      exact: {},
      percent: {},
    });
  });
});

describe("londonToday", () => {
  it("is the London calendar date, which can differ from UTC", () => {
    // 23:30 UTC on 25 October 2026 is 23:30 in London (clocks went back on the 25th).
    expect(londonToday(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
    // 23:30 UTC on 30 June is already the next day in London (British Summer Time).
    expect(londonToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});

describe("parseExpenseId", () => {
  it("accepts a uuid and nothing else", () => {
    expect(parseExpenseId(A)).toBe(A);
    expect(parseExpenseId("nope")).toBeNull();
    expect(parseExpenseId("../etc")).toBeNull();
    expect(parseExpenseId(null)).toBeNull();
    expect(parseExpenseId(7)).toBeNull();
  });
});

describe("deriveInitialSplit", () => {
  it("shows an equal split as ticked people", () => {
    expect(
      deriveInitialSplit(900, [
        { profileId: A, pence: 300 },
        { profileId: B, pence: 300 },
        { profileId: C, pence: 300 },
      ]),
    ).toEqual({ mode: "equal", who: [A, B, C], exact: {} });
  });

  it("treats the leftover-penny split as equal too", () => {
    expect(
      deriveInitialSplit(1000, [
        { profileId: A, pence: 334 },
        { profileId: B, pence: 333 },
        { profileId: C, pence: 333 },
      ]).mode,
    ).toBe("equal");
  });

  it("falls back to exact amounts for anything else", () => {
    expect(
      deriveInitialSplit(1000, [
        { profileId: A, pence: 700 },
        { profileId: B, pence: 300 },
      ]),
    ).toEqual({ mode: "exact", who: [A, B], exact: { [A]: "7.00", [B]: "3.00" } });
  });

  it("shows one person's whole share as an equal split of one", () => {
    expect(deriveInitialSplit(500, [{ profileId: B, pence: 500 }])).toEqual({
      mode: "equal",
      who: [B],
      exact: {},
    });
  });
});
