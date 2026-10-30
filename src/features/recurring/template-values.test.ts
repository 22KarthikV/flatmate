import { describe, expect, it } from "vitest";

import { buildTemplate } from "./template-input";
import { skippableMonths, valuesFromTemplate, type SavedTemplate } from "./template-values";

const SAM = "00000000-0000-0000-0000-000000000001";
const ALICE = "00000000-0000-0000-0000-000000000003";
const BOB = "00000000-0000-0000-0000-000000000004";
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const rent: SavedTemplate = {
  kind: "rent",
  name: "Rent",
  paidById: SAM,
  dueDay: 6,
  amountMode: "fixed",
  amountPence: null,
  splitMode: "amounts",
  activeMonths: ALL,
  rooms: [
    { id: "r1", name: "Front", rentPence: 80_000 },
    { id: "r2", name: "Big room", rentPence: 120_001 },
  ],
  shares: [
    { profileId: SAM, shareValue: 80_000, roomId: "r1" },
    { profileId: ALICE, shareValue: 60_001, roomId: "r2" },
    { profileId: BOB, shareValue: 60_000, roomId: "r2" },
  ],
};

describe("valuesFromTemplate", () => {
  it("fills a rent form from its rooms and people, and round-trips to the same template", () => {
    const values = valuesFromTemplate(rent);
    expect(values.rooms).toEqual([
      { key: "r1", name: "Front", rent: "800.00", occupants: [SAM] },
      { key: "r2", name: "Big room", rent: "1200.01", occupants: [ALICE, BOB] },
    ]);
    expect(values.collectorId).toBe(SAM);
    expect(values.custom).toEqual({});
    const built = buildTemplate(values);
    expect(built.ok && built.summary.totalPence).toBe(200_001);
  });

  it("recognises a custom amount (not the room's share)", () => {
    const values = valuesFromTemplate({
      ...rent,
      shares: rent.shares.map((s) => (s.profileId === BOB ? { ...s, shareValue: 55_000 } : s)),
    });
    expect(values.custom).toEqual({ [BOB]: "550.00" });
  });

  it("fills a fixed equal bill shared by everyone", () => {
    const values = valuesFromTemplate({
      ...rent,
      kind: "bill",
      name: "Wi-Fi",
      amountPence: 3200,
      splitMode: "equal",
      shares: [],
      rooms: [],
    });
    expect(values).toMatchObject({
      amount: "32.00",
      everyone: true,
      chosen: [],
      splitMode: "equal",
    });
  });

  it("fills a bill shared by named people and a percentage bill", () => {
    const equal = valuesFromTemplate({
      ...rent,
      kind: "bill",
      splitMode: "equal",
      rooms: [],
      shares: [{ profileId: ALICE, shareValue: null, roomId: null }],
    });
    expect(equal).toMatchObject({ everyone: false, chosen: [ALICE] });

    const split = valuesFromTemplate({
      ...rent,
      kind: "bill",
      splitMode: "percent",
      rooms: [],
      shares: [
        { profileId: ALICE, shareValue: 6667, roomId: null },
        { profileId: BOB, shareValue: 3333, roomId: null },
      ],
    });
    expect(split.splitMode).toBe("percent");
    expect(split.percent).toEqual({ [ALICE]: "66.67", [BOB]: "33.33" });
  });
});

describe("skippableMonths", () => {
  const base = { dueDay: 6, activeMonths: ALL, existing: [] as string[] };

  it("offers this month while it is not past due, then the next", () => {
    expect(skippableMonths({ ...base, today: "2026-11-02" })).toEqual(["2026-11-01", "2026-12-01"]);
  });

  it("does not offer a month already past due or already created", () => {
    expect(skippableMonths({ ...base, today: "2026-11-07" })).toEqual(["2026-12-01", "2027-01-01"]);
    expect(skippableMonths({ ...base, today: "2026-11-02", existing: ["2026-11-01"] })).toEqual([
      "2026-12-01",
      "2027-01-01",
    ]);
  });

  it("leaves out months the template does not run in", () => {
    expect(skippableMonths({ ...base, today: "2026-11-02", activeMonths: [1, 2, 3, 12] })).toEqual([
      "2026-12-01",
      "2027-01-01",
    ]);
  });
});
