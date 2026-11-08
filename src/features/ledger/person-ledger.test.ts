import { describe, expect, it } from "vitest";

import { buildBalancesView } from "./balance-view";
import {
  ledgerTotal,
  paymentsFor,
  signedPence,
  toLedgerItems,
  type PersonLedgerRow,
} from "./person-ledger";

const row = (overrides: Partial<PersonLedgerRow>): PersonLedgerRow => ({
  kind: "expense",
  item_id: "e1",
  occurred_on: "2026-11-01",
  description: "Shopping",
  other_id: "sam",
  other_name: "Sam",
  amount_pence: 9000,
  share_pence: 3000,
  effect_pence: -3000,
  counts: true,
  status: "active",
  ...overrides,
});

describe("toLedgerItems", () => {
  it("maps the database rows, and treats anything but a settlement as an expense", () => {
    const [expense, payment] = toLedgerItems([
      row({}),
      row({ kind: "settlement", item_id: "s1", effect_pence: 1000, status: "confirmed" }),
    ]);
    expect(expense).toMatchObject({
      kind: "expense",
      id: "e1",
      sharePence: 3000,
      effectPence: -3000,
    });
    expect(payment).toMatchObject({ kind: "settlement", id: "s1", status: "confirmed" });
  });
});

describe("ledgerTotal", () => {
  it("adds up only what counts", () => {
    const items = toLedgerItems([
      row({ effect_pence: -3000 }),
      row({ item_id: "e2", effect_pence: -1000 }),
      row({ item_id: "e3", effect_pence: -2500, counts: false, status: "cancelled" }),
      row({ kind: "settlement", item_id: "s1", effect_pence: 1000, status: "confirmed" }),
      row({
        kind: "settlement",
        item_id: "s2",
        effect_pence: 500,
        counts: false,
        status: "pending",
      }),
    ]);
    expect(ledgerTotal(items)).toBe(-3000);
  });

  it("is zero for nothing", () => {
    expect(ledgerTotal([])).toBe(0);
  });
});

describe("signedPence and paymentsFor", () => {
  const view = buildBalancesView(
    [
      { profileId: "me", displayName: "Me", pence: 1500, current: true },
      { profileId: "sam", displayName: "Sam", pence: -1000, current: true },
      { profileId: "kim", displayName: "Kim", pence: -500, current: true },
    ],
    "me",
  );

  it("turns a row back into a signed position", () => {
    const byId = new Map(view.people.map((person) => [person.profileId, person]));
    expect(signedPence(byId.get("me")!)).toBe(1500);
    expect(signedPence(byId.get("sam")!)).toBe(-1000);
  });

  it("keeps only the suggested payments that involve the person", () => {
    expect(paymentsFor(view.payments, "sam").map((payment) => payment.fromId)).toEqual(["sam"]);
    expect(paymentsFor(view.payments, "me")).toHaveLength(2);
    expect(paymentsFor(view.payments, "nobody")).toEqual([]);
  });
});
