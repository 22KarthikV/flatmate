import { describe, expect, it } from "vitest";

import { closesText, eventDay, eventRange, eventWhen, toLocalInput } from "./format";

describe("event times in London", () => {
  it("shows a winter evening as it reads on the wall", () => {
    expect(eventWhen("2026-11-06T19:30:00Z")).toBe("Fri 6 Nov, 19:30");
  });

  it("shows a summer evening an hour later than UTC", () => {
    expect(eventWhen("2027-07-02T18:30:00Z")).toBe("Fri 2 Jul, 19:30");
  });

  it("keeps 19:30 on the Friday after the clocks go back and forward", () => {
    // The clocks went back on 25 October 2026 and go forward on 28 March 2027.
    expect(eventWhen("2026-10-30T19:30:00Z")).toBe("Fri 30 Oct, 19:30");
    expect(eventWhen("2026-10-23T18:30:00Z")).toBe("Fri 23 Oct, 19:30");
    expect(eventWhen("2027-04-02T18:30:00Z")).toBe("Fri 2 Apr, 19:30");
    expect(eventWhen("2027-03-26T19:30:00Z")).toBe("Fri 26 Mar, 19:30");
  });

  it("writes a range on one day, or across two", () => {
    expect(eventRange("2026-11-06T19:30:00Z", "2026-11-06T22:00:00Z")).toBe(
      "Fri 6 Nov, 19:30 to 22:00",
    );
    expect(eventRange("2026-11-06T19:30:00Z", "2026-11-08T10:00:00Z")).toBe(
      "Fri 6 Nov, 19:30 to Sun 8 Nov, 10:00",
    );
    expect(eventRange("2026-11-06T19:30:00Z", null)).toBe("Fri 6 Nov, 19:30");
  });

  it("names a day", () => {
    expect(eventDay("2026-11-04T18:00:00Z")).toBe("Wed 4 Nov");
  });

  it("turns an instant into the value a datetime-local input holds", () => {
    expect(toLocalInput(new Date("2026-11-06T19:30:00Z"))).toBe("2026-11-06T19:30");
    expect(toLocalInput(new Date("2027-07-02T18:30:00Z"))).toBe("2027-07-02T19:30");
  });
});

describe("closesText", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("counts days, hours and minutes in plain words", () => {
    expect(closesText("2026-11-04T13:00:00Z", now)).toBe("Voting closes in 2 days");
    expect(closesText("2026-11-03T12:30:00Z", now)).toBe("Voting closes in 1 day");
    expect(closesText("2026-11-02T17:00:00Z", now)).toBe("Voting closes in 5 hours");
    expect(closesText("2026-11-02T12:20:00Z", now)).toBe("Voting closes in under an hour");
  });

  it("says when voting has closed", () => {
    expect(closesText("2026-11-02T11:00:00Z", now)).toBe("Voting has closed");
  });
});
