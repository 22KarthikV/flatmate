import { describe, expect, it } from "vitest";

import { parseSettlementFields, prefillSettlement, rawSettlementFromFormData } from "./settle";

const ME = "00000000-0000-0000-0000-00000000000a";
const SAM = "00000000-0000-0000-0000-00000000000b";
const KIM = "00000000-0000-0000-0000-00000000000c";
const MEMBERS = [ME, SAM, KIM];

describe("parseSettlementFields", () => {
  it("accepts a payment to a flatmate", () => {
    expect(parseSettlementFields({ to: SAM, amount: "12.50" }, MEMBERS, ME)).toEqual({
      ok: true,
      value: { toProfile: SAM, amountPence: 1250 },
    });
  });

  it.each([
    [{ to: "", amount: "5" }, "Choose who you paid."],
    [{ to: ME, amount: "5" }, "Choose who you paid."],
    [{ to: "00000000-0000-0000-0000-0000000000ff", amount: "5" }, "Choose who you paid."],
    [{ to: SAM, amount: "" }, "Enter an amount."],
    [{ to: SAM, amount: "abc" }, "Enter an amount like 4.20."],
    [{ to: SAM, amount: "0" }, "The amount must be at least 1p."],
    [{ to: SAM, amount: "10000.01" }, "The amount can be at most £10,000.00."],
  ])("rejects %j", (raw, message) => {
    expect(parseSettlementFields(raw, MEMBERS, ME)).toEqual({ ok: false, message });
  });
});

describe("rawSettlementFromFormData", () => {
  it("reads the two fields, treating anything else as empty", () => {
    const form = new FormData();
    form.set("to", SAM);
    form.set("amount", "3.00");
    form.set("other", "x");
    expect(rawSettlementFromFormData(form)).toEqual({ to: SAM, amount: "3.00" });
    expect(rawSettlementFromFormData(new FormData())).toEqual({ to: "", amount: "" });
  });
});

describe("prefillSettlement", () => {
  it("uses a suggested payment from the link", () => {
    expect(prefillSettlement({ to: SAM, amount: "3.00" }, MEMBERS, ME)).toEqual({
      to: SAM,
      amount: "3.00",
    });
  });

  it("ignores a recipient who is not a flatmate, or is the viewer", () => {
    expect(prefillSettlement({ to: "nope", amount: "3.00" }, MEMBERS, ME)).toEqual({
      to: "",
      amount: "3.00",
    });
    expect(prefillSettlement({ to: ME, amount: "3.00" }, MEMBERS, ME).to).toBe("");
  });

  it("ignores an amount that is not a valid amount", () => {
    expect(prefillSettlement({ to: SAM, amount: "<script>" }, MEMBERS, ME)).toEqual({
      to: SAM,
      amount: "",
    });
  });

  it("takes the first value when a parameter is repeated, and copes with none", () => {
    expect(prefillSettlement({ to: [SAM, KIM], amount: ["2", "9"] }, MEMBERS, ME)).toEqual({
      to: SAM,
      amount: "2",
    });
    expect(prefillSettlement({}, MEMBERS, ME)).toEqual({ to: "", amount: "" });
  });
});
