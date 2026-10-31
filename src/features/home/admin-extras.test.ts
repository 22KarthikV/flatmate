import { describe, expect, it } from "vitest";

import { buildAdminExtras } from "./admin-extras";

describe("buildAdminExtras", () => {
  it("is empty when there is nothing to fix", () => {
    expect(
      buildAdminExtras({ pendingRentPayments: 0, unassignedChores: [], inviteOpen: false }),
    ).toEqual([]);
  });

  it("lists rent to confirm, unassigned chores and an open invite, in that order", () => {
    const items = buildAdminExtras({
      pendingRentPayments: 2,
      unassignedChores: ["Bins"],
      inviteOpen: true,
    });
    expect(items.map((i) => i.text)).toEqual([
      "2 rent payments waiting to confirm",
      "Nobody could do Bins this week",
      "Your invite link is still open. Not everyone may have joined",
    ]);
  });

  it("uses the singular for one payment", () => {
    expect(
      buildAdminExtras({ pendingRentPayments: 1, unassignedChores: [], inviteOpen: false })[0].text,
    ).toBe("1 rent payment waiting to confirm");
  });
});
