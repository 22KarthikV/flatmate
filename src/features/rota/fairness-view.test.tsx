import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FairnessList } from "./fairness-list";
import { parsePeriod, periodStart, summariseFairness, type PastAssignment } from "./fairness-view";

const people = [
  { profileId: "a", displayName: "Alice" },
  { profileId: "b", displayName: "Bob" },
  { profileId: "c", displayName: "Carol" },
];

function row(overrides: Partial<PastAssignment>): PastAssignment {
  return {
    assigneeId: "a",
    choreName: "Kitchen",
    effort: 3,
    dueOn: "2026-11-05",
    completed: true,
    ...overrides,
  };
}

describe("parsePeriod and periodStart", () => {
  it("defaults to four weeks and ignores nonsense", () => {
    expect(parsePeriod(undefined).weeks).toBe(4);
    expect(parsePeriod("nonsense").weeks).toBe(4);
    expect(parsePeriod("12").weeks).toBe(12);
  });

  it("starts the period so that it holds exactly that many days ending today", () => {
    expect(periodStart("2026-11-28", 4)).toBe("2026-11-01");
  });
});

describe("summariseFairness", () => {
  const today = "2026-11-10";
  const assignments: PastAssignment[] = [
    row({ assigneeId: "a", choreName: "Kitchen", effort: 3, dueOn: "2026-11-04" }),
    row({ assigneeId: "a", choreName: "Bins", effort: 1, dueOn: "2026-11-06", completed: false }),
    row({ assigneeId: "a", choreName: "Bins", effort: 1, dueOn: "2026-11-10", completed: false }),
    row({ assigneeId: "b", choreName: "Bathroom", effort: 2, dueOn: "2026-11-08" }),
    row({ assigneeId: "b", choreName: "Kitchen", effort: 3, dueOn: "2026-10-01" }),
    row({ assigneeId: "b", choreName: "Living room", effort: 4, dueOn: "2026-11-14" }),
    row({ assigneeId: null, choreName: "Hallway", effort: 1, dueOn: "2026-11-08" }),
  ];

  const result = summariseFairness({
    people,
    assignments,
    owed: [{ profileId: "c", choreName: "Bathroom" }],
    start: "2026-11-01",
    today,
  });

  it("counts effort given and finished from the rows", () => {
    const alice = result.find((p) => p.profileId === "a")!;
    expect(alice.givenEffort).toBe(5);
    expect(alice.doneEffort).toBe(3);
    expect(alice.givenCount).toBe(3);
    expect(alice.doneCount).toBe(1);
  });

  it("says what is overdue but not what is only due today", () => {
    expect(result.find((p) => p.profileId === "a")!.overdueCount).toBe(1);
  });

  it("leaves out chores before the period and chores that have not come due yet", () => {
    const bob = result.find((p) => p.profileId === "b")!;
    expect(bob.givenEffort).toBe(2);
    expect(bob.byChore).toEqual([{ choreName: "Bathroom", given: 1, done: 1 }]);
  });

  it("lists chores by kind and gives everyone an entry, including people with nothing", () => {
    const alice = result.find((p) => p.profileId === "a")!;
    expect(alice.byChore).toEqual([
      { choreName: "Bins", given: 2, done: 0 },
      { choreName: "Kitchen", given: 1, done: 1 },
    ]);
    const carol = result.find((p) => p.profileId === "c")!;
    expect(carol.givenEffort).toBe(0);
    expect(carol.owedChores).toEqual(["Bathroom"]);
    expect(result).toHaveLength(3);
  });

  it("never counts a chore nobody held", () => {
    const total = result.reduce((sum, p) => sum + p.givenCount, 0);
    expect(total).toBe(4);
  });
});

describe("FairnessList", () => {
  it("shows each person's effort, what is overdue and who is owed a turn", () => {
    const summary = summariseFairness({
      people,
      assignments: [
        row({ assigneeId: "a", dueOn: "2026-11-04" }),
        row({
          assigneeId: "a",
          choreName: "Bins",
          effort: 1,
          dueOn: "2026-11-06",
          completed: false,
        }),
      ],
      owed: [{ profileId: "c", choreName: "Bathroom" }],
      start: "2026-11-01",
      today: "2026-11-10",
    });
    render(<FairnessList people={summary} viewerId="a" />);
    expect(screen.getByRole("heading", { name: "Alice (you)" })).toBeInTheDocument();
    expect(screen.getByText("3 of 4 effort points done")).toBeInTheDocument();
    expect(screen.getByText(/1 overdue and still theirs/)).toBeInTheDocument();
    expect(screen.getByText(/Bathroom\. They were passed over/)).toBeInTheDocument();
    expect(screen.getAllByText("No chores came due in this period.")).toHaveLength(2);
  });
});
