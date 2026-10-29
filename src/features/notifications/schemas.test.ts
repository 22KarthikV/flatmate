import { describe, expect, it } from "vitest";

import {
  availableSnoozeChoices,
  isSafeInternalPath,
  parseNotificationId,
  parsePreferenceForm,
  parseSnoozeChoice,
  snoozeUntil,
} from "./schemas";

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

describe("snoozeUntil", () => {
  it("an hour is an hour", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    expect(snoozeUntil("hour", now).toISOString()).toBe("2026-10-29T11:00:00.000Z");
  });

  it("evening is 18:00 and tomorrow is 08:00 in London, in winter", () => {
    const now = new Date("2026-12-10T10:00:00Z");
    expect(snoozeUntil("evening", now).toISOString()).toBe("2026-12-10T18:00:00.000Z");
    expect(snoozeUntil("tomorrow", now).toISOString()).toBe("2026-12-11T08:00:00.000Z");
  });

  it("follows summer time (BST is an hour ahead of UTC)", () => {
    const now = new Date("2026-07-10T10:00:00Z");
    expect(snoozeUntil("evening", now).toISOString()).toBe("2026-07-10T17:00:00.000Z");
    expect(snoozeUntil("tomorrow", now).toISOString()).toBe("2026-07-11T07:00:00.000Z");
  });

  it("uses London's date, not UTC's, just after midnight in summer", () => {
    // 23:30 UTC on 10 July is 00:30 on 11 July in London.
    const now = new Date("2026-07-10T23:30:00Z");
    expect(snoozeUntil("tomorrow", now).toISOString()).toBe("2026-07-12T07:00:00.000Z");
  });

  it("crosses the clock change correctly", () => {
    // Clocks go back on 25 Oct 2026: tomorrow morning from the 24th is already GMT.
    const now = new Date("2026-10-24T12:00:00Z");
    expect(snoozeUntil("tomorrow", now).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
});

describe("availableSnoozeChoices", () => {
  it("offers everything in the morning", () => {
    expect(availableSnoozeChoices(new Date("2026-12-10T09:00:00Z"))).toEqual([
      "hour",
      "evening",
      "tomorrow",
    ]);
  });

  it("drops this evening once it is nearly or already evening", () => {
    expect(availableSnoozeChoices(new Date("2026-12-10T17:50:00Z"))).toEqual(["hour", "tomorrow"]);
    expect(availableSnoozeChoices(new Date("2026-12-10T20:00:00Z"))).toEqual(["hour", "tomorrow"]);
  });
});

describe("parseSnoozeChoice", () => {
  it("accepts the three choices and nothing else", () => {
    expect(parseSnoozeChoice("hour")).toBe("hour");
    expect(parseSnoozeChoice("tomorrow")).toBe("tomorrow");
    expect(parseSnoozeChoice("next week")).toBeNull();
    expect(parseSnoozeChoice(null)).toBeNull();
  });
});

describe("parsePreferenceForm", () => {
  const known = (value: unknown) => value === "role_changed";
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };

  it("reads the checkboxes, absent meaning off", () => {
    expect(parsePreferenceForm(form({ type: "role_changed", in_app: "on" }), known)).toEqual({
      type: "role_changed",
      inApp: true,
      push: false,
    });
    expect(parsePreferenceForm(form({ type: "role_changed" }), known)).toEqual({
      type: "role_changed",
      inApp: false,
      push: false,
    });
  });

  it("refuses an unknown or missing type", () => {
    expect(parsePreferenceForm(form({ type: "nonsense", in_app: "on" }), known)).toBeNull();
    expect(parsePreferenceForm(form({ in_app: "on" }), known)).toBeNull();
  });
});
