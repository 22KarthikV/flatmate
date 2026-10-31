import { describe, expect, it } from "vitest";

import { buildBalancesView } from "@/features/ledger/balance-view";

import { moneyLine } from "./money-line";

const p = (profileId: string, pence: number) => ({
  profileId,
  displayName: profileId.toUpperCase(),
  pence,
  current: true,
});

describe("moneyLine", () => {
  it("says what you owe and with whom", () => {
    const view = buildBalancesView([p("me", -1240), p("sam", 1240)], "me");
    expect(moneyLine(view)).toEqual({ text: "You owe £12.40 in total", people: ["SAM"] });
  });

  it("says what you are owed", () => {
    const view = buildBalancesView([p("me", 3000), p("sam", -1000), p("kim", -2000)], "me");
    const line = moneyLine(view);
    expect(line.text).toBe("You're owed £30.00");
    expect([...line.people].sort()).toEqual(["KIM", "SAM"]);
  });

  it("is all square when nothing is owed", () => {
    expect(moneyLine(buildBalancesView([p("me", 0), p("sam", 0)], "me"))).toEqual({
      text: "All square",
      people: [],
    });
  });
});
