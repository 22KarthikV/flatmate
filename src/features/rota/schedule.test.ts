import { describe, expect, it } from "vitest";

import { explainAssignment } from "./explain";
import {
  applyOwedChanges,
  carriedLoads,
  effortByPerson,
  effortGap,
  lastDoneFrom,
  type PastWeek,
} from "./fairness";
import { buildWeek, type ScheduleChore, type ScheduleInput } from "./schedule";
import { addDays, weekDates } from "./week";

const WEEK = "2026-11-08";

// A small seeded generator so the property tests are the same on every run.
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

function person(i: number) {
  return `p${String(i).padStart(2, "0")}`;
}

function randomChores(r: () => number, count: number): ScheduleChore[] {
  return Array.from({ length: count }, (_, i) => {
    const weekly = r() < 0.75;
    return {
      id: `c${String(i).padStart(2, "0")}`,
      name: `Chore ${i}`,
      cadence: weekly ? ("weekly" as const) : ("every_n_days" as const),
      preferredDow: weekly ? pick(r, 0, 6) : null,
      everyNDays: weekly ? null : pick(r, 1, 7),
      effort: pick(r, 1, 5),
    };
  });
}

function baseInput(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    weekStart: WEEK,
    members: [],
    chores: [],
    availability: {},
    carriedLoad: {},
    lastDone: {},
    owed: {},
    ...overrides,
  };
}

function randomInput(seed: number, options: { allAround?: boolean } = {}): ScheduleInput {
  const r = rng(seed);
  const members = Array.from({ length: pick(r, 1, 12) }, (_, i) => person(i));
  const chores = randomChores(r, pick(r, 1, 12));
  const availability: Record<string, Record<string, boolean>> = {};
  for (const id of members) {
    availability[id] = {};
    for (const date of weekDates(WEEK)) {
      availability[id]![date] = options.allAround ? true : r() < 0.7;
    }
  }
  return baseInput({ members, chores, availability });
}

function shuffled<T>(items: readonly T[], r: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

describe("buildWeek: the basics", () => {
  const chores: ScheduleChore[] = [
    {
      id: "kitchen",
      name: "Kitchen",
      cadence: "weekly",
      preferredDow: 3,
      everyNDays: null,
      effort: 3,
    },
  ];

  it("gives a weekly chore to the available person on its preferred day", () => {
    const result = buildWeek(baseInput({ members: ["a", "b"], chores }));
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({ choreId: "kitchen", dueOn: "2026-11-11" });
    expect(result.assignments[0]!.assignee).toBe("a");
  });

  it("gives everything to a flat of one", () => {
    const many: ScheduleChore[] = [
      ...chores,
      {
        id: "bath",
        name: "Bathroom",
        cadence: "weekly",
        preferredDow: 5,
        everyNDays: null,
        effort: 2,
      },
    ];
    const result = buildWeek(baseInput({ members: ["solo"], chores: many }));
    expect(result.assignments.map((a) => a.assignee)).toEqual(["solo", "solo"]);
    expect(result.assignments[0]!.explanation).toBe(
      "You are the only flatmate, so every chore is yours.",
    );
  });

  it("generates nothing for no chores, and reports everything unassigned for no people", () => {
    expect(buildWeek(baseInput({ members: ["a"] })).assignments).toEqual([]);
    const nobody = buildWeek(baseInput({ chores }));
    expect(nobody.assignments).toHaveLength(1);
    expect(nobody.unassigned).toHaveLength(1);
    expect(nobody.assignments[0]!.explanation).toContain("Nobody is around for Kitchen");
  });

  it("hands out bins every N days from the start of the week", () => {
    const bins: ScheduleChore = {
      id: "bins",
      name: "Bins",
      cadence: "every_n_days",
      preferredDow: null,
      everyNDays: 2,
      effort: 1,
    };
    const result = buildWeek(baseInput({ members: ["a", "b", "c"], chores: [bins] }));
    expect(result.assignments.map((a) => a.dueOn)).toEqual([
      "2026-11-08",
      "2026-11-10",
      "2026-11-12",
      "2026-11-14",
    ]);
    // A light rotation: nobody has two of four among three people.
    const counts = effortByPerson(["a", "b", "c"], result.assignments);
    expect(effortGap(counts)).toBeLessThanOrEqual(1);
  });

  it("moves a chore to the nearest day the person is around, the earlier day winning a tie", () => {
    const result = buildWeek(
      baseInput({
        members: ["a"],
        chores,
        availability: { a: { "2026-11-11": false, "2026-11-10": false, "2026-11-12": false } },
      }),
    );
    // Wednesday is the 11th; Tuesday and Thursday are away too, so Monday (2 away) beats Friday (2 away).
    expect(result.assignments[0]).toMatchObject({ assignee: "a", dueOn: "2026-11-09" });
    expect(result.assignments[0]!.explanation).toContain(
      "Moved to Monday because you are away on Wednesday",
    );
  });

  it("passes the chore on when the person who is next has no free day, and owes them a turn", () => {
    const result = buildWeek(
      baseInput({
        members: ["a", "b"],
        chores,
        availability: Object.fromEntries([
          ["a", Object.fromEntries(weekDates(WEEK).map((d) => [d, false]))],
        ]),
      }),
    );
    expect(result.assignments[0]!.assignee).toBe("b");
    expect(result.owedChanges).toEqual([{ profileId: "a", choreId: "kitchen", delta: 1 }]);
  });

  it("honours an owed turn next time, and pays it off", () => {
    const result = buildWeek(
      baseInput({
        members: ["a", "b"],
        chores,
        carriedLoad: { a: 5 },
        owed: { a: { kitchen: 1 } },
      }),
    );
    expect(result.assignments[0]!.assignee).toBe("a");
    expect(result.assignments[0]!.explanation).toBe(
      "You were passed over for Kitchen last time, so it is your turn.",
    );
    expect(result.owedChanges).toEqual([{ profileId: "a", choreId: "kitchen", delta: -1 }]);
  });

  it("gives the chore to whoever did it longest ago when load is level", () => {
    const result = buildWeek(
      baseInput({
        members: ["a", "b", "c"],
        chores,
        lastDone: {
          a: { kitchen: "2026-11-04" },
          b: { kitchen: "2026-10-21" },
          c: { kitchen: "2026-10-28" },
        },
      }),
    );
    expect(result.assignments[0]!.assignee).toBe("b");
    expect(result.assignments[0]!.explanation).toBe("You did Kitchen longest ago.");
  });

  it("gives the chore to whoever has done least when loads differ", () => {
    const result = buildWeek(
      baseInput({ members: ["a", "b"], chores, carriedLoad: { a: 4, b: -2 } }),
    );
    expect(result.assignments[0]!.assignee).toBe("b");
    expect(result.assignments[0]!.explanation).toBe("You have done the least effort lately.");
  });

  it("says when only one person is around", () => {
    const result = buildWeek(
      baseInput({ members: ["a", "b"], chores, availability: { a: { "2026-11-11": false } } }),
    );
    expect(result.assignments[0]).toMatchObject({ assignee: "b" });
    expect(result.assignments[0]!.explanation).toBe("You are the only one around for Kitchen.");
  });

  it("separates the real cases from guesses: the five default chores for five people", () => {
    const defaults: ScheduleChore[] = [
      {
        id: "1-bins",
        name: "Bins",
        cadence: "every_n_days",
        preferredDow: null,
        everyNDays: 2,
        effort: 1,
      },
      {
        id: "2-kitchen",
        name: "Kitchen",
        cadence: "weekly",
        preferredDow: 3,
        everyNDays: null,
        effort: 3,
      },
      {
        id: "3-living",
        name: "Living room",
        cadence: "weekly",
        preferredDow: 6,
        everyNDays: null,
        effort: 4,
      },
      {
        id: "4-bath",
        name: "Bathroom",
        cadence: "weekly",
        preferredDow: 5,
        everyNDays: null,
        effort: 2,
      },
      {
        id: "5-hall",
        name: "Hallway",
        cadence: "weekly",
        preferredDow: 0,
        everyNDays: null,
        effort: 1,
      },
    ];
    const members = ["a", "b", "c", "d", "e"];
    const result = buildWeek(baseInput({ members, chores: defaults }));
    const weekly = result.assignments.filter((x) => x.choreId !== "1-bins");
    // Bins stack onto the people with no weekly chore, so some weekly chores share a person.
    expect(new Set(weekly.map((x) => x.assignee)).size).toBeGreaterThanOrEqual(3);
    expect(effortGap(effortByPerson(members, result.assignments))).toBeLessThanOrEqual(4);
  });
});

describe("buildWeek: properties over random flats", () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);

  it("gives the same answer whatever order the input arrives in", () => {
    for (const seed of seeds) {
      const input = randomInput(seed);
      const r = rng(seed * 7919);
      const reordered: ScheduleInput = {
        ...input,
        members: shuffled(input.members, r),
        chores: shuffled(input.chores, r),
      };
      expect(buildWeek(reordered)).toEqual(buildWeek(input));
    }
  });

  it("gives the same answer when run twice", () => {
    for (const seed of seeds) {
      const input = randomInput(seed);
      expect(buildWeek(input)).toEqual(buildWeek(input));
    }
  });

  it("never gives a chore to someone on a day they are away", () => {
    for (const seed of seeds) {
      const input = randomInput(seed);
      for (const a of buildWeek(input).assignments) {
        if (a.assignee === null) continue;
        expect(input.availability[a.assignee]?.[a.dueOn], `seed ${seed}`).not.toBe(false);
      }
    }
  });

  it("assigns every slot or reports it unassigned, with nothing lost or duplicated", () => {
    for (const seed of seeds) {
      const input = randomInput(seed);
      const result = buildWeek(input);
      const expected = input.chores.reduce(
        (sum, c) => sum + (c.cadence === "weekly" ? 1 : Math.ceil(7 / c.everyNDays!)),
        0,
      );
      expect(result.assignments, `seed ${seed}`).toHaveLength(expected);
      // Weekly chores can move day, but each chore's weekly slot appears exactly once.
      for (const chore of input.chores.filter((c) => c.cadence === "weekly")) {
        expect(result.assignments.filter((a) => a.choreId === chore.id)).toHaveLength(1);
      }
      expect(result.unassigned.every((a) => a.assignee === null)).toBe(true);
      // Someone is left unassigned only if nobody has any free day.
      const anyoneFree = input.members.some((m) =>
        weekDates(WEEK).some((d) => input.availability[m]?.[d] !== false),
      );
      if (anyoneFree) expect(result.unassigned).toHaveLength(0);
    }
  });

  it("keeps the effort gap within the largest single chore when everyone is around", () => {
    for (const seed of seeds) {
      const input = randomInput(seed, { allAround: true });
      const result = buildWeek(input);
      const totals = effortByPerson(input.members, result.assignments);
      const largest = Math.max(...input.chores.map((c) => c.effort));
      expect(effortGap(totals), `seed ${seed}`).toBeLessThanOrEqual(largest);
    }
  });

  it("explains every assignment with a non-empty sentence", () => {
    for (const seed of seeds.slice(0, 100)) {
      for (const a of buildWeek(randomInput(seed)).assignments) {
        expect(a.explanation.length).toBeGreaterThan(10);
        expect(a.reasons.length).toBeGreaterThan(0);
        expect(a.explanation).toBe(explainAssignment(a.reasons));
      }
    }
  });

  it("lets every person do every weekly chore given enough weeks", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = rng(seed);
      const count = pick(r, 2, 6);
      const members = Array.from({ length: count }, (_, i) => person(i));
      const chores: ScheduleChore[] = Array.from({ length: pick(r, 2, count) }, (_, i) => ({
        id: `c${i}`,
        name: `Chore ${i}`,
        cadence: "weekly" as const,
        preferredDow: pick(r, 0, 6),
        everyNDays: null,
        effort: pick(r, 1, 5),
      }));

      const history: PastWeek[] = [];
      const done: { assignee: string | null; choreId: string; dueOn: string }[] = [];
      const seen = new Map<string, Set<string>>(members.map((m) => [m, new Set()]));
      let weekStart = WEEK;
      for (let week = 0; week < 60; week++) {
        const result = buildWeek({
          weekStart,
          members,
          chores,
          availability: {},
          carriedLoad: carriedLoads(members, history),
          lastDone: lastDoneFrom(done),
          owed: {},
        });
        history.push({ members, assignments: result.assignments });
        done.push(...result.assignments);
        for (const a of result.assignments) seen.get(a.assignee!)!.add(a.choreId);
        weekStart = addDays(weekStart, 7);
      }
      for (const m of members) {
        expect(seen.get(m)!.size, `seed ${seed}, ${m}`).toBe(chores.length);
      }
    }
  });
});

describe("fairness helpers", () => {
  it("measures effort done minus fair share", () => {
    const loads = carriedLoads(
      ["a", "b"],
      [
        {
          members: ["a", "b"],
          assignments: [
            { assignee: "a", effort: 4 },
            { assignee: "b", effort: 2 },
          ],
        },
      ],
    );
    expect(loads).toEqual({ a: 1, b: -1 });
  });

  it("does not bury a joiner or charge them for weeks before they came", () => {
    const loads = carriedLoads(
      ["a", "b", "new"],
      [
        {
          members: ["a", "b"],
          assignments: [
            { assignee: "a", effort: 4 },
            { assignee: "b", effort: 2 },
          ],
        },
      ],
    );
    expect(loads.new).toBe(0);
  });

  it("does not count away days against someone's share", () => {
    const loads = carriedLoads(
      ["a", "b"],
      [
        {
          members: ["a", "b"],
          away: { b: 7 },
          assignments: [{ assignee: "a", effort: 4 }],
        },
      ],
    );
    expect(loads).toEqual({ a: 0, b: 0 });
    const partial = carriedLoads(
      ["a", "b"],
      [
        {
          members: ["a", "b"],
          away: { b: 4 },
          assignments: [
            { assignee: "a", effort: 2 },
            { assignee: "b", effort: 1 },
          ],
        },
      ],
    );
    expect(partial.a).toBeCloseTo(-0.1, 5);
    expect(partial.b).toBeCloseTo(0.1, 5);
  });

  it("starts a joiner at the flat's average, not at zero", () => {
    const loads = carriedLoads(
      ["a", "b", "new"],
      [
        {
          members: ["a", "b", "gone"],
          assignments: [
            { assignee: "a", effort: 3 },
            { assignee: "b", effort: 3 },
          ],
        },
      ],
    );
    expect(loads).toEqual({ a: 1, b: 1, new: 1 });
  });

  it("finds the latest date per person and chore", () => {
    expect(
      lastDoneFrom([
        { assignee: "a", choreId: "k", dueOn: "2026-10-01" },
        { assignee: "a", choreId: "k", dueOn: "2026-10-08" },
        { assignee: null, choreId: "k", dueOn: "2026-10-15" },
      ]),
    ).toEqual({ a: { k: "2026-10-08" } });
  });

  it("keeps owed counts between 0 and 1", () => {
    const owed = applyOwedChanges({}, [
      { profileId: "a", choreId: "k", delta: 1 },
      { profileId: "a", choreId: "k", delta: 1 },
      { profileId: "b", choreId: "k", delta: -1 },
    ]);
    expect(owed).toEqual({ a: { k: 1 }, b: { k: 0 } });
  });
});

describe("explainAssignment", () => {
  it("never returns an empty sentence", () => {
    expect(explainAssignment([]).length).toBeGreaterThan(0);
  });

  it("names the leaver for a rebalanced chore", () => {
    expect(explainAssignment([{ kind: "rebalanced", leaver: "Sam" }])).toBe(
      "Moved to you because Sam left.",
    );
  });

  it("says a chore not yet done is new to you", () => {
    expect(explainAssignment([{ kind: "longest_since", chore: "Bathroom", never: true }])).toBe(
      "You have not done Bathroom yet.",
    );
  });
});
