import { describe, expect, it } from "vitest";

import {
  parseBillAmount,
  parseRentPayment,
  parseSkip,
  parseTemplate,
  parseWaiver,
  TEMPLATE_NAME_MAX,
} from "./schemas";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const wifi = {
  kind: "bill" as const,
  name: "Wi-Fi",
  paidBy: A,
  dueDay: 12,
  amountMode: "fixed" as const,
  amountPence: 3200,
  splitMode: "equal" as const,
  people: [],
  activeMonths: ALL,
};

const rent = {
  kind: "rent" as const,
  name: "Rent",
  collectorId: A,
  dueDay: 6,
  rooms: [
    { name: "Big room", rentPence: 120_000, occupantIds: [A, B] },
    { name: "Box room", rentPence: 55_000, occupantIds: [C] },
  ],
  custom: [],
  activeMonths: ALL,
};

const error = (input: unknown) => {
  const result = parseTemplate(input);
  if (result.ok) throw new Error("expected a problem");
  return result.error;
};

describe("a bill template", () => {
  it("accepts a fixed equal bill", () => {
    const result = parseTemplate(wifi);
    expect(result.ok).toBe(true);
  });

  it("tidies the name and limits it to 50 characters", () => {
    const tidy = parseTemplate({ ...wifi, name: "  Council   tax " });
    expect(tidy.ok && tidy.value.name).toBe("Council tax");
    expect(error({ ...wifi, name: "x".repeat(TEMPLATE_NAME_MAX + 1) })).toMatch(/50 characters/);
    expect(error({ ...wifi, name: "   " })).toMatch(/Enter a name/);
  });

  it("limits the due day to 1 to 28", () => {
    expect(parseTemplate({ ...wifi, dueDay: 1 }).ok).toBe(true);
    expect(parseTemplate({ ...wifi, dueDay: 28 }).ok).toBe(true);
    expect(error({ ...wifi, dueDay: 0 })).toMatch(/between 1 and 28/);
    expect(error({ ...wifi, dueDay: 29 })).toMatch(/between 1 and 28/);
    expect(error({ ...wifi, dueDay: 31 })).toMatch(/between 1 and 28/);
  });

  it("needs an amount when fixed", () => {
    expect(error({ ...wifi, amountPence: null })).toMatch(/Enter the amount/);
  });

  it("must not have an amount when variable", () => {
    expect(error({ ...wifi, amountMode: "variable" })).toMatch(/no fixed amount/);
    expect(parseTemplate({ ...wifi, amountMode: "variable", amountPence: null }).ok).toBe(true);
  });

  it("limits the amount to 1p to £10,000", () => {
    expect(error({ ...wifi, amountPence: 0 })).toMatch(/at least 1p/);
    expect(error({ ...wifi, amountPence: 1_000_001 })).toMatch(/at most £10,000.00/);
    expect(error({ ...wifi, amountPence: 3200.5 })).toMatch(/whole pence/);
  });

  it("needs percentages that add up to 100", () => {
    const split = (a: number, b: number) =>
      ({
        ...wifi,
        splitMode: "percent",
        people: [
          { profileId: A, basisPoints: a },
          { profileId: B, basisPoints: b },
        ],
      }) as const;
    expect(parseTemplate(split(6000, 4000)).ok).toBe(true);
    expect(error(split(6000, 3000))).toMatch(/add up to 100%. They add up to 90%/);
    expect(error({ ...wifi, splitMode: "percent", people: [] })).toMatch(/Choose who shares/);
  });

  it("lists each person once", () => {
    expect(error({ ...wifi, people: [{ profileId: A }, { profileId: A }] })).toMatch(
      /only appear once/,
    );
  });

  it("needs at least one active month and tidies the list", () => {
    expect(error({ ...wifi, activeMonths: [] })).toMatch(/at least one month/);
    const result = parseTemplate({ ...wifi, activeMonths: [3, 1, 3] });
    expect(result.ok && result.value.activeMonths).toEqual([1, 3]);
    expect(parseTemplate({ ...wifi, activeMonths: [13] }).ok).toBe(false);
  });
});

describe("a rent template", () => {
  it("accepts rooms with people in them", () => {
    expect(parseTemplate(rent).ok).toBe(true);
  });

  it("limits a room's rent to 1p to £10,000", () => {
    const room = (rentPence: number) => ({
      ...rent,
      rooms: [{ name: "R", rentPence, occupantIds: [A] }],
    });
    expect(error(room(0))).toMatch(/at least 1p/);
    expect(error(room(1_000_001))).toMatch(/at most £10,000.00/);
    expect(parseTemplate(room(1_000_000)).ok).toBe(true);
  });

  it("limits a custom amount to 1p to £10,000", () => {
    expect(error({ ...rent, custom: [{ profileId: A, pence: 0 }] })).toMatch(/at least 1p/);
    expect(error({ ...rent, custom: [{ profileId: A, pence: 1_000_001 }] })).toMatch(/at most/);
    expect(parseTemplate({ ...rent, custom: [{ profileId: A, pence: 50_000 }] }).ok).toBe(true);
  });

  it("needs a name for each room, someone in each, and no one in two", () => {
    expect(error({ ...rent, rooms: [{ name: "", rentPence: 1000, occupantIds: [A] }] })).toMatch(
      /Name each room/,
    );
    expect(error({ ...rent, rooms: [{ name: "R", rentPence: 1000, occupantIds: [] }] })).toMatch(
      /who lives/,
    );
    expect(
      error({
        ...rent,
        rooms: [
          { name: "R1", rentPence: 1000, occupantIds: [A] },
          { name: "R2", rentPence: 1000, occupantIds: [A] },
        ],
      }),
    ).toMatch(/one room/);
    expect(error({ ...rent, rooms: [] })).toMatch(/at least one room/);
  });
});

describe("other inputs", () => {
  it("a variable amount is at least 1p", () => {
    expect(parseBillAmount({ instanceId: A, amountPence: 8450 }).ok).toBe(true);
    expect(parseBillAmount({ instanceId: A, amountPence: 0 }).ok).toBe(false);
  });

  it("a rent payment is at least 1p", () => {
    expect(parseRentPayment({ amountPence: 1 }).ok).toBe(true);
    expect(parseRentPayment({ amountPence: 0 }).ok).toBe(false);
    expect(parseRentPayment({ amountPence: 52_000.5 }).ok).toBe(false);
  });

  it("a waiver needs a reason", () => {
    expect(parseWaiver({ payerId: A, amountPence: 500, reason: "  " }).ok).toBe(false);
    expect(
      parseWaiver({ payerId: A, amountPence: 500, reason: "Left owing, agreed with landlord" }).ok,
    ).toBe(true);
  });

  it("skipping needs the first of a month", () => {
    expect(parseSkip({ templateId: A, period: "2026-12-01" }).ok).toBe(true);
    expect(parseSkip({ templateId: A, period: "2026-12-06" }).ok).toBe(false);
  });
});
