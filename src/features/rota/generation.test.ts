import { describe, expect, it } from "vitest";

import { parseGenerationInput, planWeek } from "./generation";

const WEEK = "2026-11-08";
const kitchen = {
  id: "kitchen",
  name: "Kitchen",
  cadence: "weekly" as const,
  preferredDow: 3,
  everyNDays: null,
  effort: 3,
};

describe("parseGenerationInput", () => {
  it("copes with an empty or malformed document", () => {
    for (const raw of [null, undefined, "x", [], {}]) {
      expect(parseGenerationInput(raw)).toEqual({
        members: [],
        chores: [],
        availability: {},
        lastDone: {},
        owed: {},
        history: [],
      });
    }
  });

  it("keeps what the database sent", () => {
    const parsed = parseGenerationInput({
      members: ["a"],
      chores: [kitchen],
      owed: { a: { kitchen: 1 } },
    });
    expect(parsed.members).toEqual(["a"]);
    expect(parsed.chores).toHaveLength(1);
    expect(parsed.owed).toEqual({ a: { kitchen: 1 } });
  });
});

describe("planWeek", () => {
  it("returns assignments in the shape the database stores, with explanations", () => {
    const plan = planWeek(WEEK, parseGenerationInput({ members: ["a", "b"], chores: [kitchen] }));
    expect(plan.assignments).toHaveLength(1);
    expect(Object.keys(plan.assignments[0]!).sort()).toEqual([
      "assignee",
      "choreId",
      "dueOn",
      "explanation",
    ]);
    expect(plan.assignments[0]!.explanation.length).toBeGreaterThan(10);
    expect(plan.owed).toEqual([]);
  });

  it("uses past weeks to share the work: whoever did more last time does less now", () => {
    const history = [
      {
        members: ["a", "b"],
        assignments: [
          { assignee: "a", effort: 4 },
          { assignee: "b", effort: 1 },
        ],
      },
    ];
    const plan = planWeek(
      WEEK,
      parseGenerationInput({ members: ["a", "b"], chores: [kitchen], history }),
    );
    expect(plan.assignments[0]!.assignee).toBe("b");
  });

  it("reports a chore nobody can do instead of dropping it", () => {
    const away = Object.fromEntries(
      [8, 9, 10, 11, 12, 13, 14].map((day) => [`2026-11-${String(day).padStart(2, "0")}`, false]),
    );
    const plan = planWeek(
      WEEK,
      parseGenerationInput({ members: ["a"], chores: [kitchen], availability: { a: away } }),
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0]!.assignee).toBeNull();
  });
});
