import { describe, expect, it } from "vitest";

import { parseBinFields, parseExceptionFields, parseBinId } from "./schemas";

const ID = "c0000000-0000-0000-0000-000000000001";

describe("parseBinId", () => {
  it("accepts a uuid and nothing else", () => {
    expect(parseBinId(ID)).toBe(ID);
    expect(parseBinId("nope")).toBeNull();
    expect(parseBinId(undefined)).toBeNull();
  });
});

describe("parseBinFields", () => {
  const good = { name: " Grey bin ", colour: "grey", anchorOn: "2026-11-03", everyWeeks: "2" };

  it("trims and converts", () => {
    expect(parseBinFields(good, "2026-11-01")).toEqual({
      ok: true,
      value: { name: "Grey bin", colour: "grey", anchorOn: "2026-11-03", everyWeeks: 2 },
    });
  });
  it("refuses an empty or long name", () => {
    expect(parseBinFields({ ...good, name: " " }, "2026-11-01")).toMatchObject({ ok: false });
    expect(parseBinFields({ ...good, name: "x".repeat(41) }, "2026-11-01")).toMatchObject({
      ok: false,
    });
  });
  it("refuses an unknown colour and a repeat other than 1 to 4 weeks", () => {
    expect(parseBinFields({ ...good, colour: "pink" }, "2026-11-01")).toMatchObject({ ok: false });
    expect(parseBinFields({ ...good, everyWeeks: "5" }, "2026-11-01")).toMatchObject({ ok: false });
    expect(parseBinFields({ ...good, everyWeeks: "x" }, "2026-11-01")).toMatchObject({ ok: false });
  });
  it("refuses a date that is not real or is over two years from today", () => {
    expect(parseBinFields({ ...good, anchorOn: "2026-02-30" }, "2026-11-01")).toMatchObject({
      ok: false,
    });
    expect(parseBinFields({ ...good, anchorOn: "2029-01-01" }, "2026-11-01")).toMatchObject({
      ok: false,
    });
    expect(parseBinFields({ ...good, anchorOn: "2024-01-01" }, "2026-11-01")).toMatchObject({
      ok: false,
    });
  });
});

describe("parseExceptionFields", () => {
  it("reads a skip", () => {
    expect(
      parseExceptionFields({
        streamId: ID,
        originalOn: "2026-11-10",
        kind: "skip",
        movedTo: "",
        note: " Bank holiday ",
      }),
    ).toEqual({
      ok: true,
      value: {
        streamId: ID,
        originalOn: "2026-11-10",
        kind: "skip",
        movedTo: null,
        note: "Bank holiday",
      },
    });
  });
  it("needs a date for a move, within 14 days and different", () => {
    const base = { streamId: ID, originalOn: "2026-11-10", kind: "move", note: "" };
    expect(parseExceptionFields({ ...base, movedTo: "" })).toMatchObject({ ok: false });
    expect(parseExceptionFields({ ...base, movedTo: "2026-11-10" })).toMatchObject({ ok: false });
    expect(parseExceptionFields({ ...base, movedTo: "2026-11-30" })).toMatchObject({ ok: false });
    expect(parseExceptionFields({ ...base, movedTo: "2026-11-12" })).toMatchObject({ ok: true });
  });
  it("refuses a bad bin id, kind or long note", () => {
    const base = { streamId: ID, originalOn: "2026-11-10", kind: "skip", movedTo: "", note: "" };
    expect(parseExceptionFields({ ...base, streamId: "x" })).toMatchObject({ ok: false });
    expect(parseExceptionFields({ ...base, kind: "delete" })).toMatchObject({ ok: false });
    expect(parseExceptionFields({ ...base, note: "x".repeat(61) })).toMatchObject({ ok: false });
  });
});
