import { describe, expect, it } from "vitest";

import { expenseErrorMessage } from "./errors";

describe("expenseErrorMessage", () => {
  it.each([
    [{ code: "42501", message: "not_allowed" }, "You can’t do that in this flat."],
    [{ code: "22023", message: "invalid_amount" }, "The amount must be between 1p and £10,000.00."],
    [
      { code: "22023", message: "invalid_description" },
      "Add a short description of up to 80 characters.",
    ],
    [{ code: "22023", message: "invalid_category" }, "Choose a category."],
    [
      { code: "22023", message: "invalid_date" },
      "That date isn’t allowed. Use a date from the last 5 years up to 30 days ahead.",
    ],
    [{ code: "22023", message: "invalid_shares" }, "Check who the expense is shared between."],
    [
      { code: "23514", message: "shares_must_add_up" },
      "The shares don’t add up to the amount. Please check them.",
    ],
    [
      { code: "P0001", message: "not_a_member" },
      "Everyone on an expense must still be in the flat.",
    ],
    [{ code: "P0001", message: "expense_not_found" }, "We couldn’t find that expense."],
    [{ code: "P0001", message: "already_voided" }, "That expense has already been cancelled."],
    [{ code: "22023", message: "invalid_recipient" }, "Choose who you paid."],
    [
      { code: "P0001", message: "not_owed" },
      "They aren’t owed that much any more, so you can’t record that payment to them.",
    ],
    [{ code: "P0001", message: "settlement_not_found" }, "We couldn’t find that payment."],
    [
      { code: "P0001", message: "settlement_not_pending" },
      "That payment has already been dealt with.",
    ],
  ])("explains %j", (error, message) => expect(expenseErrorMessage(error)).toBe(message));

  it("falls back to a general message for anything unexpected", () => {
    const general = "We couldn’t save that. Please try again.";
    expect(expenseErrorMessage({ code: "XX000", message: "boom" })).toBe(general);
    expect(expenseErrorMessage({ code: "P0001", message: "something_new" })).toBe(general);
    expect(expenseErrorMessage(null)).toBe(general);
  });
});
