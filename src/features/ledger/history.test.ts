import { describe, expect, it } from "vitest";

import { describePaymentHistory, type PaymentHistoryItem } from "./history";

const ME = "00000000-0000-0000-0000-00000000000a";
const SAM = "00000000-0000-0000-0000-00000000000b";
const KIM = "00000000-0000-0000-0000-00000000000c";

const item = (over: Partial<PaymentHistoryItem>): PaymentHistoryItem => ({
  id: "s1",
  amountPence: 500,
  status: "confirmed",
  fromId: SAM,
  toId: ME,
  fromName: "Sam",
  toName: "Alice",
  confirmedById: ME,
  confirmedByName: "Alice",
  when: "2026-10-30T09:00:00Z",
  ...over,
});

describe("describePaymentHistory", () => {
  it("says who paid whom, from the viewer's side", () => {
    expect(describePaymentHistory(item({}), ME).headline).toBe("Sam paid you £5.00");
    expect(
      describePaymentHistory(item({ fromId: ME, toId: SAM, fromName: "Alice", toName: "Sam" }), ME)
        .headline,
    ).toBe("You paid Sam £5.00");
    expect(
      describePaymentHistory(item({ fromId: SAM, toId: KIM, fromName: "Sam", toName: "Kim" }), ME)
        .headline,
    ).toBe("Sam paid Kim £5.00");
  });

  it("labels each outcome", () => {
    expect(describePaymentHistory(item({ status: "confirmed" }), ME).status).toBe("Confirmed");
    expect(describePaymentHistory(item({ status: "declined" }), ME).status).toBe("Not confirmed");
    expect(describePaymentHistory(item({ status: "cancelled" }), ME).status).toBe("Cancelled");
  });

  it("says when an admin confirmed it for someone who had left", () => {
    const text = describePaymentHistory(
      item({
        fromId: ME,
        toId: "dee",
        fromName: "Alice",
        toName: "Dee",
        confirmedById: SAM,
        confirmedByName: "Sam",
      }),
      ME,
    );
    expect(text.detail).toBe("Confirmed by Sam for Dee, who had left");
  });

  it("names who confirmed it otherwise, and says nothing extra for declined or cancelled", () => {
    expect(describePaymentHistory(item({}), ME).detail).toBe("Confirmed by you");
    expect(
      describePaymentHistory(
        item({ confirmedById: KIM, confirmedByName: "Kim", toId: KIM, toName: "Kim" }),
        ME,
      ).detail,
    ).toBe("Confirmed by Kim");
    expect(
      describePaymentHistory(
        item({ status: "declined", confirmedById: null, confirmedByName: null }),
        ME,
      ).detail,
    ).toBeNull();
    expect(
      describePaymentHistory(
        item({ status: "cancelled", confirmedById: null, confirmedByName: null }),
        ME,
      ).detail,
    ).toBeNull();
  });

  it("marks the viewer's own payments, so they can be picked out", () => {
    expect(describePaymentHistory(item({}), ME).involvesYou).toBe(true);
    expect(describePaymentHistory(item({ fromId: SAM, toId: KIM }), ME).involvesYou).toBe(false);
  });
});
