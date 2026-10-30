import { describe, expect, it } from "vitest";

import { isExpectedRotaError, rotaErrorMessage } from "./errors";

describe("rota errors", () => {
  it("turns each known database message into a sentence", () => {
    expect(rotaErrorMessage({ message: "duplicate_name" })).toBe(
      "Another chore already has that name.",
    );
    expect(rotaErrorMessage({ message: "not_allowed" })).toMatch(/owner or admin/);
  });

  it("falls back to a general sentence for anything else", () => {
    expect(rotaErrorMessage({ message: "something odd" })).toMatch(/try again/);
    expect(rotaErrorMessage(null)).toMatch(/try again/);
  });

  it("calls only the known messages expected", () => {
    expect(isExpectedRotaError({ message: "too_many_chores" })).toBe(true);
    expect(isExpectedRotaError({ message: "boom" })).toBe(false);
    expect(isExpectedRotaError(null)).toBe(false);
  });
});
