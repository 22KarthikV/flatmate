import { describe, expect, it } from "vitest";

import { canChangeExpense } from "./permissions";

const ME = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";

describe("canChangeExpense", () => {
  it("lets the person who added it correct or cancel it", () => {
    expect(
      canChangeExpense({ createdBy: ME, voided: false }, { profileId: ME, role: "member" }),
    ).toBe(true);
  });

  it("lets an owner or admin change anyone's expense", () => {
    expect(
      canChangeExpense({ createdBy: OTHER, voided: false }, { profileId: ME, role: "admin" }),
    ).toBe(true);
    expect(
      canChangeExpense({ createdBy: OTHER, voided: false }, { profileId: ME, role: "owner" }),
    ).toBe(true);
  });

  it("does not let another member", () => {
    expect(
      canChangeExpense({ createdBy: OTHER, voided: false }, { profileId: ME, role: "member" }),
    ).toBe(false);
  });

  it("allows nothing once it is cancelled, for anyone", () => {
    expect(
      canChangeExpense({ createdBy: ME, voided: true }, { profileId: ME, role: "owner" }),
    ).toBe(false);
  });
});
