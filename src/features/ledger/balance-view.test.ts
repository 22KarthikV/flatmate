import { describe, expect, it } from "vitest";

import { buildBalancesView, describePayment } from "./balance-view";

const ME = "00000000-0000-0000-0000-00000000000a";
const SAM = "00000000-0000-0000-0000-00000000000b";
const KIM = "00000000-0000-0000-0000-00000000000c";
const GONE = "00000000-0000-0000-0000-00000000000d";

const person = (profileId: string, displayName: string, pence: number, current = true) => ({
  profileId,
  displayName,
  pence,
  current,
});

describe("buildBalancesView", () => {
  it("says everyone is square for a new flat", () => {
    const view = buildBalancesView([person(ME, "Alice", 0), person(SAM, "Sam", 0)], ME);
    expect(view.summary).toEqual({ kind: "square", pence: 0 });
    expect(view.payments).toEqual([]);
    expect(view.settled).toBe(true);
    expect(view.people.map((p) => p.status)).toEqual(["square", "square"]);
  });

  it("tells the viewer what they are owed", () => {
    const view = buildBalancesView([person(ME, "Alice", 1200), person(SAM, "Sam", -1200)], ME);
    expect(view.summary).toEqual({ kind: "owed", pence: 1200 });
    expect(view.settled).toBe(false);
  });

  it("tells the viewer what they owe", () => {
    const view = buildBalancesView([person(ME, "Alice", -500), person(SAM, "Sam", 500)], ME);
    expect(view.summary).toEqual({ kind: "owes", pence: 500 });
  });

  it("lists people owed money first (most first), then people who owe (most first), then those square", () => {
    const view = buildBalancesView(
      [
        person(ME, "Alice", 0),
        person(SAM, "Sam", -300),
        person(KIM, "Kim", 800),
        person(GONE, "Dee", -500),
      ],
      ME,
    );
    expect(view.people.map((p) => [p.displayName, p.status, p.pence])).toEqual([
      ["Kim", "owed", 800],
      ["Dee", "owes", 500],
      ["Sam", "owes", 300],
      ["Alice", "square", 0],
    ]);
  });

  it("marks the viewer in the list", () => {
    const view = buildBalancesView([person(ME, "Alice", 100), person(SAM, "Sam", -100)], ME);
    expect(view.people.find((p) => p.profileId === ME)?.isYou).toBe(true);
    expect(view.people.find((p) => p.profileId === SAM)?.isYou).toBe(false);
  });

  it("keeps people who have left in their own list, so a debt is never hidden", () => {
    const view = buildBalancesView(
      [person(ME, "Alice", 500), person(SAM, "Sam", 0), person(GONE, "Dee", -500, false)],
      ME,
    );
    expect(view.people.map((p) => p.displayName)).toEqual(["Alice", "Sam"]);
    expect(view.former.map((p) => [p.displayName, p.status, p.pence])).toEqual([
      ["Dee", "owes", 500],
    ]);
  });

  it("works out the fewest payments, and names them from the viewer's side", () => {
    const view = buildBalancesView(
      [person(ME, "Alice", 700), person(SAM, "Sam", -300), person(KIM, "Kim", -400)],
      ME,
    );
    expect(view.payments.map((p) => describePayment(p))).toEqual([
      "Kim pays you £4.00",
      "Sam pays you £3.00",
    ]);
    expect(view.payments.every((p) => p.involvesYou)).toBe(true);
  });

  it("says 'You pay' when the viewer is the one who owes", () => {
    const view = buildBalancesView([person(ME, "Alice", -700), person(SAM, "Sam", 700)], ME);
    expect(view.payments.map((p) => describePayment(p))).toEqual(["You pay Sam £7.00"]);
  });

  it("shows other people's payments by name, and says they do not involve the viewer", () => {
    const view = buildBalancesView(
      [person(ME, "Alice", 0), person(SAM, "Sam", -300), person(KIM, "Kim", 300)],
      ME,
    );
    expect(view.payments.map((p) => describePayment(p))).toEqual(["Sam pays Kim £3.00"]);
    expect(view.payments[0].involvesYou).toBe(false);
  });

  it("includes former flatmates in the suggested payments so the books can be closed", () => {
    const view = buildBalancesView(
      [person(ME, "Alice", 500), person(GONE, "Dee", -500, false)],
      ME,
    );
    expect(view.payments.map((p) => describePayment(p))).toEqual(["Dee pays you £5.00"]);
  });

  it("flags balances that do not add up instead of showing wrong payments", () => {
    const view = buildBalancesView([person(ME, "Alice", 500), person(SAM, "Sam", -400)], ME);
    expect(view.inconsistent).toBe(true);
    expect(view.payments).toEqual([]);
  });

  it("treats a viewer who is not in the list as square", () => {
    const view = buildBalancesView([person(SAM, "Sam", 0)], ME);
    expect(view.summary).toEqual({ kind: "square", pence: 0 });
  });
});
