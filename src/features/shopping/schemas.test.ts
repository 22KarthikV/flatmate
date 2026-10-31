import { describe, expect, it } from "vitest";

import { parseItemFields, parseItemId, parseItemIds } from "./schemas";

const A = "b0000000-0000-0000-0000-000000000001";
const B = "b0000000-0000-0000-0000-000000000002";

describe("parseItemFields", () => {
  it("trims the name and note", () => {
    expect(parseItemFields("  Milk ", "  semi-skimmed ")).toEqual({
      ok: true,
      value: { name: "Milk", note: "semi-skimmed" },
    });
  });
  it("treats a blank note as none", () => {
    expect(parseItemFields("Milk", "   ")).toEqual({
      ok: true,
      value: { name: "Milk", note: null },
    });
    expect(parseItemFields("Milk", null)).toEqual({
      ok: true,
      value: { name: "Milk", note: null },
    });
  });
  it("refuses an empty or over-long name", () => {
    expect(parseItemFields("  ", "")).toMatchObject({ ok: false });
    expect(parseItemFields("x".repeat(61), "")).toMatchObject({ ok: false });
    expect(parseItemFields("x".repeat(60), "")).toMatchObject({ ok: true });
  });
  it("refuses an over-long note", () => {
    expect(parseItemFields("Milk", "x".repeat(41))).toMatchObject({ ok: false });
    expect(parseItemFields("Milk", "x".repeat(40))).toMatchObject({ ok: true });
  });
});

describe("parseItemId", () => {
  it("accepts a uuid and nothing else", () => {
    expect(parseItemId(A)).toBe(A);
    expect(parseItemId("nope")).toBeNull();
    expect(parseItemId(null)).toBeNull();
  });
});

describe("parseItemIds", () => {
  it("reads a comma separated list of uuids, once each", () => {
    expect(parseItemIds(`${A},${B},${A}`)).toEqual([A, B]);
  });
  it("refuses anything that is not all uuids, and more than 30", () => {
    expect(parseItemIds(`${A},nope`)).toEqual([]);
    expect(parseItemIds("")).toEqual([]);
    expect(parseItemIds(undefined)).toEqual([]);
    const many = Array.from(
      { length: 31 },
      (_, i) => `b0000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );
    expect(parseItemIds(many.join(","))).toEqual([]);
  });
});
