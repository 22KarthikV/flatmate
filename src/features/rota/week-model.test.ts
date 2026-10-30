import { describe, expect, it } from "vitest";

import {
  arrangeForViewer,
  dayLabel,
  progress,
  statusOf,
  weekHeading,
  type AssignmentView,
  type WeekView,
} from "./week-model";

function assignment(overrides: Partial<AssignmentView> = {}): AssignmentView {
  return {
    id: "a1",
    choreName: "Kitchen",
    effort: 3,
    assigneeId: "me",
    assigneeName: "Me",
    dueOn: "2026-11-11",
    explanation: "You did Kitchen longest ago.",
    completedAt: null,
    needsSignoff: false,
    signedOffBy: null,
    reopenedAt: null,
    items: [
      { id: "i1", position: 1, text: "Wipe", doneAt: null, doneBy: null },
      { id: "i2", position: 2, text: "Sweep", doneAt: null, doneBy: null },
    ],
    ...overrides,
  };
}

describe("progress", () => {
  it("counts ticked steps", () => {
    const a = assignment();
    a.items[0]!.doneAt = "2026-11-11T09:00:00Z";
    expect(progress(a)).toEqual({ done: 1, total: 2 });
    expect(progress(assignment({ items: [] }))).toEqual({ done: 0, total: 0 });
  });
});

describe("statusOf", () => {
  const today = "2026-11-11";
  it("labels done, overdue, due today, upcoming and unassigned", () => {
    expect(statusOf(assignment({ completedAt: "x" }), today)).toBe("done");
    expect(statusOf(assignment({ dueOn: "2026-11-10" }), today)).toBe("overdue");
    expect(statusOf(assignment({ dueOn: today }), today)).toBe("today");
    expect(statusOf(assignment({ dueOn: "2026-11-12" }), today)).toBe("upcoming");
    expect(statusOf(assignment({ assigneeId: null }), today)).toBe("unassigned");
  });

  it("keeps a finished chore done even when its day has passed", () => {
    expect(statusOf(assignment({ dueOn: "2026-11-01", completedAt: "x" }), today)).toBe("done");
  });
});

describe("dayLabel", () => {
  it("says today, tomorrow, or the weekday and date", () => {
    expect(dayLabel("2026-11-11", "2026-11-11")).toBe("Today");
    expect(dayLabel("2026-11-12", "2026-11-11")).toBe("Tomorrow");
    expect(dayLabel("2026-11-14", "2026-11-11")).toBe("Saturday 14 Nov");
  });
});

describe("arrangeForViewer", () => {
  const week: WeekView = {
    id: "w",
    weekStart: "2026-11-08",
    revision: 1,
    reason: "weekly",
    assignments: [
      assignment({
        id: "1",
        choreName: "Bins",
        assigneeId: "sam",
        assigneeName: "Sam",
        dueOn: "2026-11-08",
      }),
      assignment({ id: "2", choreName: "Kitchen", assigneeId: "me", dueOn: "2026-11-11" }),
      assignment({ id: "3", choreName: "Bathroom", assigneeId: "me", dueOn: "2026-11-09" }),
      assignment({
        id: "4",
        choreName: "Hallway",
        assigneeId: null,
        assigneeName: null,
        dueOn: "2026-11-08",
      }),
      assignment({
        id: "5",
        choreName: "Living room",
        assigneeId: "al",
        assigneeName: "Al",
        dueOn: "2026-11-14",
      }),
      assignment({
        id: "6",
        choreName: "Bins",
        assigneeId: "sam",
        assigneeName: "Sam",
        dueOn: "2026-11-10",
      }),
    ],
  };

  it("puts the viewer's chores first, by day", () => {
    expect(arrangeForViewer(week, "me").mine.map((a) => a.id)).toEqual(["3", "2"]);
  });

  it("groups everyone else by person, alphabetically, and keeps unassigned chores apart", () => {
    const arranged = arrangeForViewer(week, "me");
    expect(arranged.others.map((g) => g.name)).toEqual(["Al", "Sam"]);
    expect(arranged.others[1]!.assignments.map((a) => a.id)).toEqual(["1", "6"]);
    expect(arranged.unassigned.map((a) => a.id)).toEqual(["4"]);
  });

  it("gives someone with no chores an empty list rather than nothing", () => {
    expect(arrangeForViewer(week, "nobody").mine).toEqual([]);
  });
});

describe("weekHeading", () => {
  it("spans Sunday to Saturday", () => {
    expect(weekHeading("2026-11-08")).toBe("Week of 8 Nov to 14 Nov");
  });
});
