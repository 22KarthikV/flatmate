import { describe, expect, it } from "vitest";

import { ALL_MONTHS } from "./dates";
import {
  buildTemplate,
  describeTotal,
  emptyValues,
  toRpcPayload,
  type FormValues,
} from "./template-input";

const SAM = "00000000-0000-0000-0000-000000000001";
const ALICE = "00000000-0000-0000-0000-000000000003";
const BOB = "00000000-0000-0000-0000-000000000004";
const CARA = "00000000-0000-0000-0000-000000000005";

function bill(extra: Partial<FormValues> = {}): FormValues {
  return {
    ...emptyValues("bill", { profileId: SAM }),
    name: "Wi-Fi",
    dueDay: 12,
    amount: "32",
    ...extra,
  };
}

function rent(extra: Partial<FormValues> = {}): FormValues {
  return {
    ...emptyValues("rent", { profileId: SAM }),
    dueDay: 6,
    rooms: [
      { key: "a", name: "Front", rent: "800", occupants: [SAM] },
      { key: "b", name: "Big room", rent: "1200.01", occupants: [ALICE, BOB] },
      { key: "c", name: "Box room", rent: "550", occupants: [CARA] },
    ],
    ...extra,
  };
}

describe("emptyValues", () => {
  it("starts a rent named Rent and a bill with no name, running every month", () => {
    expect(emptyValues("rent", { profileId: SAM }).name).toBe("Rent");
    expect(emptyValues("bill", { profileId: SAM }).name).toBe("");
    expect(emptyValues("bill", { profileId: SAM }).months).toEqual([...ALL_MONTHS]);
  });
});

describe("a bill", () => {
  it("builds a fixed equal bill shared by everyone", () => {
    const built = buildTemplate(bill());
    expect(built.ok && built.input).toMatchObject({
      kind: "bill",
      amountMode: "fixed",
      amountPence: 3200,
      splitMode: "equal",
      people: [],
    });
    expect(built.ok && built.summary.totalPence).toBe(3200);
  });

  it("builds a bill whose amount changes each month with no amount", () => {
    const built = buildTemplate(bill({ amountMode: "variable", amount: "" }));
    expect(built.ok && built.summary.totalPence).toBeNull();
  });

  it("lists the chosen people when not everyone shares it", () => {
    const built = buildTemplate(bill({ everyone: false, chosen: [ALICE, BOB] }));
    expect(built.ok && built.input).toMatchObject({
      people: [{ profileId: ALICE }, { profileId: BOB }],
    });
    expect(buildTemplate(bill({ everyone: false, chosen: [] }))).toEqual({
      ok: false,
      message: "Choose who shares this bill.",
    });
  });

  it("builds percentages and refuses ones that do not add up", () => {
    const ok = buildTemplate(
      bill({ splitMode: "percent", percent: { [ALICE]: "60", [BOB]: "40" } }),
    );
    expect(ok.ok && ok.input).toMatchObject({
      people: [
        { profileId: ALICE, basisPoints: 6000 },
        { profileId: BOB, basisPoints: 4000 },
      ],
    });
    const bad = buildTemplate(
      bill({ splitMode: "percent", percent: { [ALICE]: "60", [BOB]: "30" } }),
    );
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toMatch(/add up to 100%/);
  });

  it("explains a bad amount, name or due day", () => {
    expect(buildTemplate(bill({ amount: "4.205" })).ok).toBe(false);
    expect(buildTemplate(bill({ amount: "" })).ok).toBe(false);
    const noName = buildTemplate(bill({ name: "  " }));
    expect(!noName.ok && noName.message).toMatch(/Enter a name/);
    const badDay = buildTemplate(bill({ dueDay: 30 }));
    expect(!badDay.ok && badDay.message).toMatch(/between 1 and 28/);
    const noMonths = buildTemplate(bill({ months: [] }));
    expect(!noMonths.ok && noMonths.message).toMatch(/at least one month/);
  });
});

describe("a rent", () => {
  it("works out each person's amount and the total as you type", () => {
    const built = buildTemplate(rent());
    if (!built.ok) throw new Error(built.message);
    expect(built.summary.totalPence).toBe(255_001);
    expect(Object.fromEntries(built.summary.amounts.map((a) => [a.profileId, a.pence]))).toEqual({
      [SAM]: 80_000,
      [ALICE]: 60_001,
      [BOB]: 60_000,
      [CARA]: 55_000,
    });
    expect(describeTotal(built.summary)).toBe("£2,550.01 a month across 4 people");
  });

  it("lets a custom amount replace a room's share", () => {
    const built = buildTemplate(rent({ custom: { [CARA]: "500" } }));
    if (!built.ok) throw new Error(built.message);
    expect(built.summary.amounts.find((a) => a.profileId === CARA)?.pence).toBe(50_000);
    expect(built.summary.totalPence).toBe(250_001);
  });

  it("refuses a room with nobody in it, a person in two rooms and a bad rent", () => {
    const empty = buildTemplate(
      rent({ rooms: [{ key: "a", name: "Front", rent: "800", occupants: [] }] }),
    );
    expect(!empty.ok && empty.message).toMatch(/who lives/);
    const twice = buildTemplate(
      rent({
        rooms: [
          { key: "a", name: "A", rent: "500", occupants: [ALICE] },
          { key: "b", name: "B", rent: "500", occupants: [ALICE] },
        ],
      }),
    );
    expect(!twice.ok && twice.message).toMatch(/one room/);
    const noRent = buildTemplate(
      rent({ rooms: [{ key: "a", name: "Front", rent: "", occupants: [SAM] }] }),
    );
    expect(!noRent.ok && noRent.message).toMatch(/^Front: /);
  });
});

describe("toRpcPayload", () => {
  it("builds the bill JSON the database takes", () => {
    const built = buildTemplate(
      bill({ splitMode: "percent", percent: { [ALICE]: "60", [BOB]: "40" } }),
    );
    if (!built.ok) throw new Error(built.message);
    expect(toRpcPayload(built.value)).toEqual({
      kind: "bill",
      name: "Wi-Fi",
      paid_by: SAM,
      due_day: 12,
      amount_mode: "fixed",
      amount_pence: 3200,
      split_mode: "percent",
      people: [
        { profile_id: ALICE, basis_points: 6000 },
        { profile_id: BOB, basis_points: 4000 },
      ],
      active_months: [...ALL_MONTHS],
    });
  });

  it("builds the rent JSON with each person's pence fixed", () => {
    const built = buildTemplate(rent());
    if (!built.ok) throw new Error(built.message);
    const payload = toRpcPayload(built.value) as {
      kind: string;
      collector_id: string;
      rooms: {
        name: string;
        rent_pence: number;
        people: { profile_id: string; pence: number }[];
      }[];
    };
    expect(payload.kind).toBe("rent");
    expect(payload.collector_id).toBe(SAM);
    expect(payload.rooms.map((room) => room.name)).toEqual(["Front", "Big room", "Box room"]);
    expect(payload.rooms[1].people).toEqual([
      { profile_id: ALICE, pence: 60_001 },
      { profile_id: BOB, pence: 60_000 },
    ]);
    const total = payload.rooms.flatMap((r) => r.people).reduce((sum, p) => sum + p.pence, 0);
    expect(total).toBe(255_001);
  });
});
