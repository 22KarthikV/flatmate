import { describe, expect, it } from "vitest";

import type { AssignmentView, WeekView } from "@/features/rota/week-model";

import { myChores } from "./chores";

const today = "2026-11-10";

function a(
  id: string,
  who: string | null,
  dueOn: string,
  extra: Partial<AssignmentView> = {},
): AssignmentView {
  return {
    id,
    choreName: `Chore ${id}`,
    effort: 1,
    assigneeId: who,
    assigneeName: who,
    dueOn,
    explanation: "",
    completedAt: null,
    needsSignoff: false,
    signedOffBy: null,
    reopenedAt: null,
    items: [],
    ...extra,
  };
}

const week = (assignments: AssignmentView[]): WeekView => ({
  id: "w",
  weekStart: "2026-11-08",
  revision: 1,
  reason: "",
  assignments,
});

describe("myChores", () => {
  it("says the rota is not ready when there is no week", () => {
    expect(myChores(null, "me", today)).toEqual({ kind: "not_ready" });
  });

  it("keeps only my rows, overdue then today then upcoming, and collapses done to a count", () => {
    const result = myChores(
      week([
        a("up", "me", "2026-11-13"),
        a("other", "sam", "2026-11-09"),
        a("late", "me", "2026-11-09"),
        a("now", "me", "2026-11-10"),
        a("fin", "me", "2026-11-09", { completedAt: "2026-11-09T10:00:00Z" }),
      ]),
      "me",
      today,
    );
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.rows.map((r) => r.id)).toEqual(["late", "now", "up"]);
    expect(result.rows.map((r) => r.statusText)).toEqual(["Overdue", "Due today", "Coming up"]);
    expect(result.doneCount).toBe(1);
  });

  it("shows step progress and links to the chore", () => {
    const items = [1, 2, 3].map((n) => ({
      id: `i${n}`,
      position: n,
      text: "x",
      doneAt: n === 1 ? "t" : null,
      doneBy: null,
    }));
    const result = myChores(week([a("c", "me", "2026-11-11", { items })]), "me", today);
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.rows[0]).toMatchObject({
      progress: "1 of 3 steps",
      href: "/rota/assignments/c",
      day: "Tomorrow",
    });
  });
});
