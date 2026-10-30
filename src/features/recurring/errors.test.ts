import { describe, expect, it } from "vitest";

import { isExpectedRecurringError, recurringErrorMessage } from "./errors";

describe("recurring errors", () => {
  it("turns the database's words into sentences", () => {
    expect(recurringErrorMessage({ message: "already_entered" })).toMatch(/already been entered/);
    expect(recurringErrorMessage({ message: "amount_exceeds_owed" })).toMatch(
      /more than you still owe/,
    );
    expect(recurringErrorMessage({ message: "cannot_resume" })).toMatch(/Edit it first/);
  });

  it("falls back to a general sentence for anything unexpected", () => {
    expect(recurringErrorMessage({ message: "boom" })).toBe(
      "We couldn’t save that. Please try again.",
    );
    expect(recurringErrorMessage(null)).toBe("We couldn’t save that. Please try again.");
  });

  it("knows which outcomes are expected", () => {
    expect(isExpectedRecurringError({ message: "not_allowed" })).toBe(true);
    expect(isExpectedRecurringError({ message: "boom" })).toBe(false);
    expect(isExpectedRecurringError(null)).toBe(false);
  });
});
