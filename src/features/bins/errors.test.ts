import { describe, expect, it } from "vitest";

import { binErrorMessage, isExpectedBinError } from "./errors";

describe("binErrorMessage", () => {
  it.each([
    ["not_allowed", "Only an owner or admin can change the bins."],
    ["not_a_collection_day", "That isn’t one of this bin’s collection days."],
    ["too_many_bins", "A flat can have up to 20 bins. Remove one first."],
    ["bin_not_found", "We couldn’t find that bin."],
  ])("explains %s", (message, text) => {
    expect(binErrorMessage({ message })).toBe(text);
    expect(isExpectedBinError({ message })).toBe(true);
  });
  it("is general for anything else", () => {
    expect(binErrorMessage({ message: "boom" })).toBe("We couldn’t save that. Please try again.");
    expect(binErrorMessage(null)).toBe("We couldn’t save that. Please try again.");
    expect(isExpectedBinError({ message: "boom" })).toBe(false);
  });
});
