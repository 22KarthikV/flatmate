import { describe, expect, it } from "vitest";

import { meterErrorMessage, isExpectedMeterError } from "./errors";
import { kindLabel, meterTitle, unitOptions } from "./constants";
import { parseMeterFields, parseMeterId, parseReadingFields } from "./schemas";

const ID = "a0000000-0000-0000-0000-00000000000a";
const TODAY = "2026-11-10";

describe("parseMeterFields", () => {
  it("trims and defaults", () => {
    expect(parseMeterFields({ kind: "electricity", label: "  Hall ", unit: "kWh" })).toEqual({
      ok: true,
      value: { kind: "electricity", label: "Hall", unit: "kWh" },
    });
    expect(parseMeterFields({ kind: "gas", label: " ", unit: "m3" })).toEqual({
      ok: true,
      value: { kind: "gas", label: null, unit: "m3" },
    });
  });
  it("refuses an unknown kind, electricity in m3, and a long label", () => {
    expect(parseMeterFields({ kind: "steam", label: "", unit: "kWh" })).toMatchObject({
      ok: false,
    });
    expect(parseMeterFields({ kind: "electricity", label: "", unit: "m3" })).toMatchObject({
      ok: false,
    });
    expect(parseMeterFields({ kind: "gas", label: "x".repeat(31), unit: "kWh" })).toMatchObject({
      ok: false,
    });
  });
});

describe("parseReadingFields", () => {
  const good = { readOn: "2026-11-01", value: "1,214.5", note: " Checked ", reset: false };
  it("reads a value with commas and decimals", () => {
    expect(parseReadingFields(good, TODAY)).toEqual({
      ok: true,
      value: { readOn: "2026-11-01", value: 1214.5, note: "Checked", isReset: false },
    });
  });
  it("refuses a bad number", () => {
    for (const value of ["", "abc", "-5", "1.2345", "10000000"]) {
      expect(parseReadingFields({ ...good, value }, TODAY)).toMatchObject({ ok: false });
    }
    expect(parseReadingFields({ ...good, value: "0" }, TODAY)).toMatchObject({ ok: true });
    expect(parseReadingFields({ ...good, value: "9999999.999" }, TODAY)).toMatchObject({
      ok: true,
    });
  });
  it("refuses a future date, an old date and a fake date", () => {
    expect(parseReadingFields({ ...good, readOn: "2026-11-11" }, TODAY)).toMatchObject({
      ok: false,
    });
    expect(parseReadingFields({ ...good, readOn: "2025-11-09" }, TODAY)).toMatchObject({
      ok: false,
    });
    expect(parseReadingFields({ ...good, readOn: "2025-11-10" }, TODAY)).toMatchObject({
      ok: true,
    });
    expect(parseReadingFields({ ...good, readOn: "2026-02-30" }, TODAY)).toMatchObject({
      ok: false,
    });
  });
  it("refuses a long note and passes the reset flag through", () => {
    expect(parseReadingFields({ ...good, note: "x".repeat(101) }, TODAY)).toMatchObject({
      ok: false,
    });
    expect(parseReadingFields({ ...good, reset: true }, TODAY)).toMatchObject({
      ok: true,
      value: { isReset: true },
    });
  });
});

describe("ids and labels", () => {
  it("accepts a uuid only", () => {
    expect(parseMeterId(ID)).toBe(ID);
    expect(parseMeterId("x")).toBeNull();
  });
  it("names meters and units", () => {
    expect(kindLabel("gas")).toBe("Gas");
    expect(meterTitle({ kind: "electricity", label: "Hall" })).toBe("Electricity (Hall)");
    expect(meterTitle({ kind: "water", label: null })).toBe("Water");
    expect(unitOptions("electricity")).toEqual(["kWh"]);
    expect(unitOptions("gas")).toEqual(["kWh", "m3"]);
  });
});

describe("meterErrorMessage", () => {
  it.each([
    ["lower_than_previous", "That is lower than the last reading."],
    ["higher_than_later", "That is higher than a later reading."],
    [
      "already_recorded",
      "There is already a reading for that day. Cancel it first to enter a new one.",
    ],
    ["meter_has_readings", "A meter with readings can only change its label."],
    ["too_many_meters", "A flat can have up to 10 meters. Remove one first."],
    ["not_allowed", "Only an owner or admin can do that."],
  ])("explains %s", (message, text) => {
    expect(meterErrorMessage({ message })).toBe(text);
    expect(isExpectedMeterError({ message })).toBe(true);
  });
  it("is general otherwise", () => {
    expect(meterErrorMessage({ message: "x" })).toBe("We couldn’t save that. Please try again.");
    expect(isExpectedMeterError({ message: "x" })).toBe(false);
  });
});
