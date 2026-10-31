import { describe, expect, it } from "vitest";

import { buildOverdue, type CoverCandidate, type OverdueRow } from "./overdue-model";

const row = (over: Partial<OverdueRow>): OverdueRow => ({
  id: "o1",
  choreId: "kitchen",
  choreName: "Kitchen",
  effort: 3,
  assigneeId: "sam",
  assigneeName: "Sam",
  dueOn: "2026-11-04",
  ...over,
});

const later: CoverCandidate = {
  id: "n1",
  choreId: "kitchen",
  assigneeId: "sam",
  dueOn: "2026-11-11",
};

describe("buildOverdue", () => {
  it("shows a member only their own", () => {
    const rows = [row({}), row({ id: "o2", assigneeId: "ann", assigneeName: "Ann" })];
    expect(buildOverdue(rows, [], "sam", false).map((i) => i.id)).toEqual(["o1"]);
  });

  it("shows an admin everyone's, oldest first", () => {
    const rows = [row({ id: "b", dueOn: "2026-11-05" }), row({ id: "a", dueOn: "2026-11-02" })];
    expect(buildOverdue(rows, [], "admin", true).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("offers the same person's later turn of the same chore as cover", () => {
    expect(buildOverdue([row({})], [later], "sam", false)[0]!.coverBy).toEqual({
      id: "n1",
      dueOn: "2026-11-11",
    });
  });

  it("does not offer another chore, another person, or an earlier turn", () => {
    const others: CoverCandidate[] = [
      { ...later, choreId: "bins" },
      { ...later, assigneeId: "ann" },
      { ...later, dueOn: "2026-11-01" },
    ];
    expect(buildOverdue([row({})], others, "sam", false)[0]!.coverBy).toBeNull();
  });
});
