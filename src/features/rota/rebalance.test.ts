import { describe, expect, it } from "vitest";

import { effortByPerson, effortGap } from "./fairness";
import { rebalanceAfterLeave, type RebalanceInput, type RebalanceTask } from "./rebalance";
import { addDays, weekDates } from "./week";

const WEEK = "2026-11-08";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

function task(id: string, overrides: Partial<RebalanceTask> = {}): RebalanceTask {
  return {
    id,
    choreId: `chore-${id}`,
    choreName: `Chore ${id}`,
    effort: 2,
    dueOn: addDays(WEEK, 3),
    assignee: "sam",
    started: false,
    locked: false,
    ...overrides,
  };
}

function input(overrides: Partial<RebalanceInput> = {}): RebalanceInput {
  return {
    leaver: "sam",
    leaverName: "Sam",
    remaining: ["amy", "bob"],
    tasks: [],
    availability: {},
    carriedLoad: {},
    lastDone: {},
    ...overrides,
  };
}

/** Applies a result to the tasks, as the database would, so a second run can be compared. */
function apply(tasks: readonly RebalanceTask[], result: ReturnType<typeof rebalanceAfterLeave>) {
  const next = new Map(result.assignments.map((a) => [a.taskId, a.assignee]));
  return tasks.map((t) => ({ ...t, assignee: next.has(t.id) ? next.get(t.id)! : t.assignee }));
}

function randomCase(seed: number, options: { equalAvailability?: boolean } = {}): RebalanceInput {
  const r = rng(seed);
  const remaining = Array.from({ length: pick(r, 0, 8) }, (_, i) => `m${i}`);
  const people = ["sam", ...remaining];
  const dates = weekDates(WEEK);
  const tasks: RebalanceTask[] = Array.from({ length: pick(r, 0, 24) }, (_, i) => ({
    id: `t${String(i).padStart(2, "0")}`,
    choreId: `c${i % 7}`,
    choreName: `Chore ${i % 7}`,
    effort: pick(r, 1, 5),
    dueOn: dates[pick(r, 0, 6)]!,
    assignee: people[pick(r, 0, people.length - 1)]!,
    started: false,
    locked: false,
  }));
  const availability: Record<string, Record<string, boolean>> = {};
  for (const id of remaining) {
    availability[id] = {};
    for (const date of dates)
      availability[id]![date] = options.equalAvailability ? true : r() < 0.75;
  }
  return input({ remaining, tasks, availability });
}

describe("rebalanceAfterLeave: the basics", () => {
  it("gives the leaver's chore to the least loaded person who is around", () => {
    const tasks = [
      task("leaver", { effort: 3 }),
      task("amy-1", { assignee: "amy", effort: 4 }),
      task("bob-1", { assignee: "bob", effort: 1 }),
    ];
    const result = rebalanceAfterLeave(input({ tasks }));
    expect(result.assignments.find((a) => a.taskId === "leaver")!.assignee).toBe("bob");
    expect(result.moves[0]).toMatchObject({
      taskId: "leaver",
      from: "sam",
      to: "bob",
      reason: "leaver",
    });
    expect(result.moves[0]!.explanation).toBe("Moved to you because Sam left.");
  });

  it("orders the leaver's chores by effort, biggest first", () => {
    const tasks = [
      task("small", { effort: 1 }),
      task("big", { effort: 5 }),
      task("mid", { effort: 3 }),
    ];
    const result = rebalanceAfterLeave(input({ tasks }));
    expect(result.moves.filter((m) => m.reason === "leaver").map((m) => m.taskId)).toEqual([
      "big",
      "mid",
      "small",
    ]);
  });

  it("skips someone who is away that day and breaks ties by who did the chore longest ago", () => {
    const t = task("k", { choreId: "kitchen", dueOn: "2026-11-11" });
    const result = rebalanceAfterLeave(
      input({
        tasks: [t],
        availability: { amy: { "2026-11-11": false } },
      }),
    );
    expect(result.assignments[0]!.assignee).toBe("bob");

    const tie = rebalanceAfterLeave(
      input({
        tasks: [t],
        lastDone: { amy: { kitchen: "2026-10-01" }, bob: { kitchen: "2026-10-20" } },
      }),
    );
    expect(tie.assignments[0]!.assignee).toBe("amy");
  });

  it("leaves a chore unassigned, and says so, when nobody is around", () => {
    const t = task("k", { dueOn: "2026-11-11" });
    const result = rebalanceAfterLeave(
      input({
        tasks: [t],
        availability: { amy: { "2026-11-11": false }, bob: { "2026-11-11": false } },
      }),
    );
    expect(result.assignments[0]!.assignee).toBeNull();
    expect(result.unassigned).toEqual(["k"]);
    expect(result.moves[0]!.explanation).toContain("Nobody is around");
  });

  it("gives a lone remaining member everything, and nobody-left no assignments and no error", () => {
    const tasks = [task("a"), task("b", { effort: 5 }), task("c", { effort: 1 })];
    const solo = rebalanceAfterLeave(input({ remaining: ["amy"], tasks }));
    expect(solo.assignments.every((a) => a.assignee === "amy")).toBe(true);
    const nobody = rebalanceAfterLeave(input({ remaining: [], tasks }));
    expect(nobody.assignments.every((a) => a.assignee === null)).toBe(true);
    expect(nobody.unassigned).toHaveLength(3);
  });

  it("changes nothing for anyone else when the leaver has nothing upcoming", () => {
    const tasks = [
      task("a", { assignee: "amy", effort: 5 }),
      task("b", { assignee: "bob", effort: 1 }),
    ];
    const result = rebalanceAfterLeave(input({ tasks }));
    expect(result.moves).toEqual([]);
    expect(result.assignments).toEqual([]);
  });

  it("never moves chores that are started or locked while evening out, but does move the leaver's own", () => {
    const tasks = [
      task("lv-locked", { effort: 1, locked: true }),
      task("amy-started", { assignee: "amy", effort: 5, started: true }),
      task("amy-locked", { assignee: "amy", effort: 5, locked: true }),
      task("amy-free", { assignee: "amy", effort: 2 }),
    ];
    const result = rebalanceAfterLeave(input({ tasks, remaining: ["amy", "bob"] }));
    expect(result.assignments.find((a) => a.taskId === "lv-locked")).toBeDefined();
    expect(result.moves.map((m) => m.taskId)).not.toContain("amy-started");
    expect(result.moves.map((m) => m.taskId)).not.toContain("amy-locked");
  });

  it("evens out a clearly unfair gap by moving the fewest chores, explaining why", () => {
    const tasks = [
      task("lv", { effort: 1 }),
      task("a1", { assignee: "amy", effort: 3 }),
      task("a2", { assignee: "amy", effort: 3 }),
      task("a3", { assignee: "amy", effort: 3 }),
      task("a4", { assignee: "amy", effort: 3 }),
    ];
    const result = rebalanceAfterLeave(input({ tasks }));
    const after = apply(tasks, result);
    const totals = effortByPerson(["amy", "bob"], after);
    expect(effortGap(totals)).toBeLessThanOrEqual(3);
    const balance = result.moves.filter((m) => m.reason === "balance");
    expect(balance.length).toBeGreaterThan(0);
    expect(balance[0]!.explanation).toContain("Sam left");
  });
});

describe("rebalanceAfterLeave: properties over random flats", () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);

  it("conserves total effort and never loses or duplicates a chore", () => {
    for (const seed of seeds) {
      const c = randomCase(seed);
      const result = rebalanceAfterLeave(c);
      const after = apply(c.tasks, result);
      expect(after).toHaveLength(c.tasks.length);
      expect(
        after.reduce((s, t) => s + t.effort, 0),
        `seed ${seed}`,
      ).toBe(c.tasks.reduce((s, t) => s + t.effort, 0));
      expect(new Set(result.assignments.map((a) => a.taskId)).size).toBe(result.assignments.length);
    }
  });

  it("never gives the leaver anything again", () => {
    for (const seed of seeds) {
      const c = randomCase(seed);
      const after = apply(c.tasks, rebalanceAfterLeave(c));
      expect(
        after.some((t) => t.assignee === c.leaver),
        `seed ${seed}`,
      ).toBe(false);
    }
  });

  it("never moves a chore to someone on a day they are away", () => {
    for (const seed of seeds) {
      const c = randomCase(seed);
      const result = rebalanceAfterLeave(c);
      for (const a of result.assignments) {
        if (a.assignee === null) continue;
        const due = c.tasks.find((t) => t.id === a.taskId)!.dueOn;
        expect(c.availability[a.assignee]?.[due], `seed ${seed}`).not.toBe(false);
      }
    }
  });

  it("is idempotent: running it again on its own result changes nothing", () => {
    for (const seed of seeds) {
      const c = randomCase(seed);
      const first = rebalanceAfterLeave(c);
      const second = rebalanceAfterLeave({ ...c, tasks: apply(c.tasks, first) });
      expect(second.moves, `seed ${seed}`).toEqual([]);
    }
  });

  it("keeps the effort gap within the largest chore when everyone is around", () => {
    for (const seed of seeds) {
      const c = randomCase(seed, { equalAvailability: true });
      if (c.remaining.length < 2) continue;
      const result = rebalanceAfterLeave(c);
      if (result.moves.length === 0) continue;
      const after = apply(c.tasks, result);
      const totals = effortByPerson(c.remaining, after);
      const largest = Math.max(...c.tasks.map((t) => t.effort));
      expect(effortGap(totals), `seed ${seed}`).toBeLessThanOrEqual(largest);
    }
  });

  it("gives the same answer whatever order the tasks arrive in", () => {
    for (const seed of seeds) {
      const c = randomCase(seed);
      const reversed = {
        ...c,
        tasks: [...c.tasks].reverse(),
        remaining: [...c.remaining].reverse(),
      };
      expect(rebalanceAfterLeave(reversed)).toEqual(rebalanceAfterLeave(c));
    }
  });
});
