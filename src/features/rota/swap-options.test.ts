import { describe, expect, it } from "vitest";

import { buildSwapOptions } from "./swap-options";
import type { AssignmentView } from "./week-model";

function a(overrides: Partial<AssignmentView>): AssignmentView {
  return {
    id: "a",
    choreName: "Kitchen",
    effort: 3,
    assigneeId: "me",
    assigneeName: "Me",
    dueOn: "2026-11-11",
    explanation: "x",
    completedAt: null,
    needsSignoff: false,
    signedOffBy: null,
    reopenedAt: null,
    items: [],
    ...overrides,
  };
}

const people = [
  { profileId: "me", displayName: "Me" },
  { profileId: "zed", displayName: "Zed" },
  { profileId: "amy", displayName: "Amy" },
  { profileId: "bob", displayName: "Bob" },
];

describe("buildSwapOptions", () => {
  const mine = a({ id: "mine" });
  const weekAssignments = [
    mine,
    a({ id: "amy-bins", choreName: "Bins", assigneeId: "amy", dueOn: "2026-11-10" }),
    a({
      id: "amy-done",
      choreName: "Hall",
      assigneeId: "amy",
      dueOn: "2026-11-09",
      completedAt: "x",
    }),
    a({ id: "zed-bath", choreName: "Bathroom", assigneeId: "zed", dueOn: "2026-11-13" }),
  ];

  it("offers everyone else, alphabetically, never the viewer", () => {
    const options = buildSwapOptions({
      assignment: mine,
      viewerId: "me",
      people,
      away: new Set(),
      weekAssignments,
      today: "2026-11-09",
    });
    expect(options.map((o) => o.displayName)).toEqual(["Amy", "Bob", "Zed"]);
  });

  it("leaves out anyone who is away on the chore day", () => {
    const options = buildSwapOptions({
      assignment: mine,
      viewerId: "me",
      people,
      away: new Set(["bob:2026-11-11"]),
      weekAssignments,
      today: "2026-11-09",
    });
    expect(options.map((o) => o.profileId)).toEqual(["amy", "zed"]);
  });

  it("offers only unfinished chores of theirs, and only on days the viewer is around", () => {
    const options = buildSwapOptions({
      assignment: mine,
      viewerId: "me",
      people,
      away: new Set(["me:2026-11-13"]),
      weekAssignments,
      today: "2026-11-09",
    });
    const amy = options.find((o) => o.profileId === "amy")!;
    expect(amy.exchanges).toEqual([{ assignmentId: "amy-bins", label: "Bins, Tomorrow" }]);
    expect(options.find((o) => o.profileId === "zed")!.exchanges).toEqual([]);
    expect(options.find((o) => o.profileId === "bob")!.exchanges).toEqual([]);
  });
});
