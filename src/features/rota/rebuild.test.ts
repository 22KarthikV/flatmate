import { describe, expect, it } from "vitest";

import { planRebuild, parseRebuildDocument } from "./rebuild";

const doc = {
  leaver: "sam",
  leaverName: "Sam",
  remaining: ["amy", "bob"],
  tasks: [
    {
      id: "t1",
      choreId: "kitchen",
      choreName: "Kitchen",
      effort: 3,
      dueOn: "2026-11-11",
      assignee: "sam",
      started: false,
      locked: true,
    },
    {
      id: "t2",
      choreId: "bins",
      choreName: "Bins",
      effort: 1,
      dueOn: "2026-11-10",
      assignee: "amy",
      started: false,
      locked: false,
    },
  ],
  availability: {},
  lastDone: {},
  history: [],
};

describe("planRebuild", () => {
  it("moves the leaver's chore, even a locked one, to the least loaded person who stays", () => {
    expect(planRebuild(doc)).toEqual([
      {
        taskId: "t1",
        to: "bob",
        reason: "leaver",
        explanation: "Moved to you because Sam left.",
      },
    ]);
  });

  it("uses the history to weigh who is owed a lighter load", () => {
    const busy = {
      ...doc,
      history: [
        {
          members: ["amy", "bob", "sam"],
          assignments: [
            { assignee: "bob", effort: 6 },
            { assignee: "amy", effort: 0 },
          ],
        },
      ],
    };
    expect(planRebuild(busy)[0]!.to).toBe("amy");
  });

  it("tolerates a thin or missing document", () => {
    expect(planRebuild(null)).toEqual([]);
    expect(parseRebuildDocument({}).remaining).toEqual([]);
  });
});
