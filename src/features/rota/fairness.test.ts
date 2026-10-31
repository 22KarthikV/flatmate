import { describe, expect, it } from "vitest";

import { carriedLoads, catchUpLimited } from "./fairness";
import { buildWeek, type ScheduleChore } from "./schedule";

const week = (assignments: { assignee: string; effort: number; done?: boolean }[]) => ({
  members: ["a", "b"],
  assignments,
});

describe("carriedLoads counts effort that was done", () => {
  it("treats a chore with no done flag as done", () => {
    const loads = carriedLoads(
      ["a", "b"],
      [
        week([
          { assignee: "a", effort: 4 },
          { assignee: "b", effort: 4 },
        ]),
      ],
    );
    expect(loads).toEqual({ a: 0, b: 0 });
  });

  it("gives no credit for a chore left undone, so skipping leaves a shortfall", () => {
    const loads = carriedLoads(
      ["a", "b"],
      [
        week([
          { assignee: "a", effort: 4, done: false },
          { assignee: "b", effort: 4 },
        ]),
      ],
    );
    expect(loads).toEqual({ a: -4, b: 0 });
  });

  it("earns credit once when a later chore covers an earlier one", () => {
    // Sam was given the kitchen twice (3 each) and only the second was really done.
    const history = [
      week([
        { assignee: "a", effort: 3, done: false },
        { assignee: "b", effort: 3 },
      ]),
      week([
        { assignee: "a", effort: 3, done: true },
        { assignee: "b", effort: 3 },
      ]),
    ];
    const loads = carriedLoads(["a", "b"], history);
    expect(loads.a).toBe(-3);
    expect(loads.b).toBe(0);
  });
});

describe("catchUpLimited", () => {
  it("never puts someone more than one point ahead of the others in a week", () => {
    expect(catchUpLimited(["a", "b", "c"], { a: -6, b: 0, c: 0 })).toEqual({ a: -1, b: 0, c: 0 });
  });

  it("leaves small gaps alone", () => {
    expect(catchUpLimited(["a", "b"], { a: -0.5, b: 0.5 })).toEqual({ a: -0.5, b: 0.5 });
  });

  it("is a no-op for one person", () => {
    expect(catchUpLimited(["a"], { a: -9 })).toEqual({ a: -9 });
  });
});

describe("the scheduler pays a skipped chore back gradually", () => {
  const chores: ScheduleChore[] = ["x", "y", "z"].map((id) => ({
    id,
    name: id,
    cadence: "weekly",
    preferredDow: 1,
    everyNDays: null,
    effort: 2,
  }));
  it("gives the person who skipped about one extra effort point, not everything", () => {
    const result = buildWeek({
      weekStart: "2026-11-08",
      members: ["a", "b"],
      chores,
      availability: {},
      carriedLoad: { a: -6, b: 6 },
      lastDone: {},
      owed: {},
    });
    const mine = (id: string) => result.assignments.filter((s) => s.assignee === id).length;
    expect(mine("a")).toBe(2);
    expect(mine("b")).toBe(1);
  });
});
