import { describe, expect, it } from "vitest";

import { isExpectedShoppingError, shoppingErrorMessage } from "./errors";

describe("shoppingErrorMessage", () => {
  it.each([
    ["list_full", "The shopping list is full (100 things). Tick or remove some first."],
    ["item_not_found", "We couldn’t find that item. It may have been removed."],
    ["already_in_expense", "That item is already part of an expense."],
    ["not_bought", "Tick everything you bought before making an expense."],
    ["not_allowed", "Only the person who added it, or an admin, can do that."],
  ])("explains %s", (message, text) => {
    expect(shoppingErrorMessage({ message })).toBe(text);
    expect(isExpectedShoppingError({ message })).toBe(true);
  });
  it("passes the ledger's own messages through", () => {
    expect(shoppingErrorMessage({ message: "shares_must_add_up" })).toBe(
      "The shares don’t add up to the amount. Please check them.",
    );
  });
  it("is general for anything else", () => {
    expect(shoppingErrorMessage({ message: "boom" })).toBe(
      "We couldn’t save that. Please try again.",
    );
    expect(shoppingErrorMessage(null)).toBe("We couldn’t save that. Please try again.");
    expect(isExpectedShoppingError({ message: "boom" })).toBe(false);
  });
});
