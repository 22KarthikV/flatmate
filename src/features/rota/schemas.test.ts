import { describe, expect, it } from "vitest";

import { parseChoreFields, parseChoreId, rawChoreFromFormData, type RawChore } from "./schemas";

const base: RawChore = {
  name: "Kitchen",
  cadence: "weekly",
  preferredDow: "3",
  everyNDays: "",
  effort: "3",
  needsSignoff: false,
  items: ["Wipe the worktops", "Sweep"],
};

describe("parseChoreFields", () => {
  it("accepts a weekly chore and drops the every-N-days field", () => {
    const result = parseChoreFields({ ...base, everyNDays: "5" });
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Kitchen",
        cadence: "weekly",
        preferredDow: 3,
        everyNDays: null,
        effort: 3,
        needsSignoff: false,
        items: ["Wipe the worktops", "Sweep"],
      },
    });
  });

  it("accepts an every-N-days chore and drops the day", () => {
    const result = parseChoreFields({ ...base, cadence: "every_n_days", everyNDays: "2" });
    expect(result).toMatchObject({
      ok: true,
      value: { cadence: "every_n_days", preferredDow: null, everyNDays: 2 },
    });
  });

  it("trims the name and drops blank steps", () => {
    const result = parseChoreFields({ ...base, name: "  Bins  ", items: [" a ", "  ", "b"] });
    expect(result).toMatchObject({ ok: true, value: { name: "Bins", items: ["a", "b"] } });
  });

  it.each([
    ["a blank name", { name: "   " }],
    ["a name over 40 characters", { name: "x".repeat(41) }],
    ["an unknown cadence", { cadence: "monthly" }],
    ["a weekly chore with no day", { preferredDow: "" }],
    ["a day above 6", { preferredDow: "7" }],
    ["an every-N-days chore with no number", { cadence: "every_n_days", everyNDays: "" }],
    ["N above 14", { cadence: "every_n_days", everyNDays: "15" }],
    ["N of 0", { cadence: "every_n_days", everyNDays: "0" }],
    ["an effort of 0", { effort: "0" }],
    ["an effort of 6", { effort: "6" }],
    ["a step over 80 characters", { items: ["y".repeat(81)] }],
    ["more than 20 steps", { items: Array.from({ length: 21 }, (_, i) => `step ${i}`) }],
  ])("refuses %s", (_label, change) => {
    const result = parseChoreFields({ ...base, ...change });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("rawChoreFromFormData", () => {
  it("reads every field, treating a ticked box as on and keeping step order", () => {
    const form = new FormData();
    form.set("name", "Bathroom");
    form.set("cadence", "weekly");
    form.set("preferredDow", "5");
    form.set("effort", "2");
    form.set("needsSignoff", "on");
    form.append("item", "First");
    form.append("item", "Second");
    expect(rawChoreFromFormData(form)).toEqual({
      name: "Bathroom",
      cadence: "weekly",
      preferredDow: "5",
      everyNDays: "",
      effort: "2",
      needsSignoff: true,
      items: ["First", "Second"],
    });
  });
});

describe("parseChoreId", () => {
  it("accepts a uuid and nothing else", () => {
    expect(parseChoreId("d1000000-0000-0000-0000-000000000001")).toBe(
      "d1000000-0000-0000-0000-000000000001",
    );
    expect(parseChoreId("nope")).toBeNull();
    expect(parseChoreId(null)).toBeNull();
  });
});
