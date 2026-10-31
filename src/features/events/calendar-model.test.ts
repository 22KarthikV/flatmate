import { describe, expect, it } from "vitest";

import {
  buildCalendar,
  calendarNav,
  defaultRange,
  monthRange,
  parseMonthParam,
  shiftMonth,
  weekStartsIn,
  type CalendarInput,
} from "./calendar-model";

const base: CalendarInput = {
  range: { from: "2026-11-01", to: "2026-11-30" },
  viewerId: "me",
  events: [],
  chores: [],
  bills: [],
  ownRentDueDates: [],
  rotaDeadlines: [],
};

const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  title: "Pizza night",
  location: "Our kitchen",
  status: "confirmed" as const,
  startsAt: "2026-11-06T19:30:00Z",
  ...over,
});

describe("buildCalendar", () => {
  it("merges everything into days sorted by date then time", () => {
    const model = buildCalendar({
      ...base,
      events: [event(), event({ id: "e2", title: "Film", startsAt: "2026-11-06T12:00:00Z" })],
      chores: [
        { id: "c1", choreName: "Bins", dueOn: "2026-11-06", assigneeId: "me", completedAt: null },
      ],
      bills: [
        { id: "b1", name: "Electric", dueOn: "2026-11-03", status: "created", voided: false },
      ],
      ownRentDueDates: ["2026-11-01"],
      rotaDeadlines: ["2026-11-07T18:00:00Z"],
    });
    expect(model.days.map((d) => d.date)).toEqual([
      "2026-11-01",
      "2026-11-03",
      "2026-11-06",
      "2026-11-07",
    ]);
    // Whole-day items first, then by clock.
    expect(model.days[2]!.items.map((i) => i.title)).toEqual(["Bins", "Film", "Pizza night"]);
    expect(model.days[0]!.items[0]).toMatchObject({
      kind: "rent",
      label: "Rent",
      title: "Your rent is due",
      href: "/money/rent",
    });
    expect(model.days[3]!.items[0]).toMatchObject({
      title: "Rota availability closes",
      time: "18:00",
      href: "/rota/availability",
    });
    expect(model.empty).toBe(false);
  });

  it("links each kind to the right page", () => {
    const model = buildCalendar({
      ...base,
      events: [event()],
      chores: [
        { id: "c1", choreName: "Bins", dueOn: "2026-11-06", assigneeId: "me", completedAt: null },
      ],
      bills: [
        { id: "b1", name: "Electric", dueOn: "2026-11-06", status: "created", voided: false },
      ],
    });
    const hrefs = model.days[0]!.items.map((i) => i.href).sort();
    expect(hrefs).toEqual(["/events/e1", "/money/recurring/months", "/rota/assignments/c1"]);
  });

  it("gives a calm empty state for an empty range", () => {
    const model = buildCalendar(base);
    expect(model.empty).toBe(true);
    expect(model.days).toEqual([]);
  });

  it("drops cancelled and skipped bills", () => {
    const model = buildCalendar({
      ...base,
      bills: [
        { id: "b1", name: "Skipped", dueOn: "2026-11-03", status: "skipped", voided: false },
        { id: "b2", name: "Voided", dueOn: "2026-11-03", status: "created", voided: true },
        { id: "b3", name: "Kept", dueOn: "2026-11-03", status: "created", voided: false },
      ],
    });
    expect(model.days.flatMap((d) => d.items.map((i) => i.title))).toEqual(["Kept"]);
  });

  it("keeps events being voted on off the grid and lists them as still deciding", () => {
    const model = buildCalendar({
      ...base,
      events: [
        event({ id: "v", title: "Voting one", status: "voting", startsAt: null }),
        event({ id: "t", title: "Tied one", status: "tiebreak", startsAt: null }),
        event({ id: "x", title: "Cancelled one", status: "cancelled" }),
        event(),
      ],
    });
    expect(model.days.flatMap((d) => d.items.map((i) => i.title))).toEqual(["Pizza night"]);
    expect(model.deciding).toEqual([
      { id: "v", title: "Voting one", href: "/events/v" },
      { id: "t", title: "Tied one", href: "/events/t" },
    ]);
  });

  it("shows only the viewer's own chores", () => {
    const model = buildCalendar({
      ...base,
      chores: [
        { id: "c1", choreName: "Mine", dueOn: "2026-11-06", assigneeId: "me", completedAt: null },
        {
          id: "c2",
          choreName: "Theirs",
          dueOn: "2026-11-06",
          assigneeId: "bea",
          completedAt: null,
        },
        { id: "c3", choreName: "Nobody", dueOn: "2026-11-06", assigneeId: null, completedAt: null },
        { id: "c4", choreName: "Done", dueOn: "2026-11-07", assigneeId: "me", completedAt: "x" },
      ],
    });
    const items = model.days.flatMap((d) => d.items);
    expect(items.map((i) => i.title)).toEqual(["Mine", "Done"]);
    expect(items[1]!.note).toBe("Done");
  });

  it("dedupes repeats and ignores days outside the range", () => {
    const model = buildCalendar({
      ...base,
      events: [event(), event()],
      ownRentDueDates: ["2026-11-01", "2026-11-01", "2026-12-01"],
      rotaDeadlines: ["2026-11-07T18:00:00Z", "2026-11-07T18:00:00Z"],
    });
    const titles = model.days.flatMap((d) => d.items.map((i) => i.title));
    expect(titles.sort()).toEqual(["Pizza night", "Rota availability closes", "Your rent is due"]);
  });

  it("places events on London days across both clock changes", () => {
    // 23:30 UTC on 28 Mar 2026 is 23:30 GMT; 23:30 UTC on 29 Mar is 00:30 BST on the 30th.
    // 23:30 UTC on 24 Oct is 00:30 BST on the 25th; 23:30 UTC on 25 Oct is 23:30 GMT.
    const model = buildCalendar({
      ...base,
      range: { from: "2026-03-01", to: "2026-10-31" },
      events: [
        event({ id: "a", startsAt: "2026-03-28T23:30:00Z" }),
        event({ id: "b", startsAt: "2026-03-29T23:30:00Z" }),
        event({ id: "c", startsAt: "2026-10-24T23:30:00Z" }),
        event({ id: "d", startsAt: "2026-10-25T23:30:00Z" }),
      ],
    });
    expect(model.days.map((d) => [d.date, d.items.map((i) => i.time)])).toEqual([
      ["2026-03-28", ["23:30"]],
      ["2026-03-30", ["00:30"]],
      ["2026-10-25", ["00:30", "23:30"]],
    ]);
  });
});

describe("calendar privacy", () => {
  const withAmounts = {
    id: "b1",
    name: "Electric",
    dueOn: "2026-11-03",
    status: "created",
    voided: false,
    amountPence: 12345,
    amount_pence: 12345,
    sharers: [{ displayName: "Bea", pence: 4000 }],
    payerName: "Bea",
  };
  const rentWithAmount = { dueOn: "2026-11-01", amountPence: 90000, collectorName: "Bea" };

  it("never carries an amount, pence or any amount key into the output", () => {
    const model = buildCalendar({
      ...base,
      bills: [withAmounts],
      // A caller that tried to pass a whole rent row would have to pick the date out first.
      ownRentDueDates: [rentWithAmount.dueOn],
    });
    const text = JSON.stringify(model);
    expect(text).not.toMatch(/amount/i);
    expect(text).not.toMatch(/pence/i);
    expect(text).not.toContain("12345");
    expect(text).not.toContain("90000");
    expect(text).not.toContain("4000");
    expect(text).not.toContain("Bea");
    for (const item of model.days.flatMap((d) => d.items)) {
      expect(Object.keys(item).sort()).toEqual(
        ["href", "key", "kind", "label", "note", "place", "time", "title"].sort(),
      );
    }
  });

  it("only ever shows the viewer's rent as a bare line with no person or status", () => {
    const model = buildCalendar({ ...base, ownRentDueDates: ["2026-11-01"] });
    expect(model.days[0]!.items).toEqual([
      {
        key: "rent-2026-11-01",
        kind: "rent",
        label: "Rent",
        title: "Your rent is due",
        time: null,
        place: null,
        note: null,
        href: "/money/rent",
      },
    ]);
  });
});

describe("month parameter", () => {
  it("accepts only strict YYYY-MM", () => {
    expect(parseMonthParam("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2026-01")).toEqual({ year: 2026, month: 1 });
    for (const bad of [
      "2026-13",
      "2026-00",
      "2026-1",
      "26-11",
      "2026-11-01",
      " 2026-11",
      "2026-11 ",
      "1999-12",
      "2101-01",
      "abc",
      "",
      undefined,
      ["2026-11"],
      null,
    ]) {
      expect(parseMonthParam(bad)).toBeNull();
    }
  });

  it("works out month ranges, including leap February and year ends", () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange({ year: 2026, month: 12 })).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("defaults to the next 8 weeks from today in London", () => {
    // 23:30 UTC on 24 Oct is already the 25th in London.
    expect(defaultRange(new Date("2026-10-24T23:30:00Z"))).toEqual({
      from: "2026-10-25",
      to: "2026-12-19",
    });
  });

  it("builds earlier and later links", () => {
    const month = calendarNav(new Date("2026-11-02T12:00:00Z"), { year: 2026, month: 11 });
    expect(month.earlier.href).toBe("/events/calendar?month=2026-10");
    expect(month.later.href).toBe("/events/calendar?month=2026-12");
    expect(month.reset?.href).toBe("/events/calendar");
    const plain = calendarNav(new Date("2026-11-02T12:00:00Z"), null);
    expect(plain.title).toBe("Next 8 weeks");
    expect(plain.earlier.href).toBe("/events/calendar?month=2026-11");
    expect(plain.later.href).toBe("/events/calendar?month=2027-01");
    expect(plain.reset).toBeNull();
  });

  it("lists the Sundays of the weeks in a range", () => {
    expect(weekStartsIn({ from: "2026-11-04", to: "2026-11-16" })).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
    ]);
  });
});
