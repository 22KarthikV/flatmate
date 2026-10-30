import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  tickItem: vi.fn(),
  untickItem: vi.fn(),
  completeAssignment: vi.fn(),
  reopenAssignment: vi.fn(),
  signOffAssignment: vi.fn(),
}));

import { Checklist } from "./checklist";
import type { AssignmentView, WeekView as WeekData } from "./week-model";
import { WeekView } from "./week-view";

function assignment(overrides: Partial<AssignmentView> = {}): AssignmentView {
  return {
    id: "11111111-1111-1111-1111-111111111111",
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
      {
        id: "i1",
        position: 1,
        text: "Wipe the worktops",
        doneAt: "2026-11-11T09:00:00Z",
        doneBy: "me",
      },
      { id: "i2", position: 2, text: "Sweep", doneAt: null, doneBy: null },
    ],
    ...overrides,
  };
}

const week: WeekData = {
  id: "w",
  weekStart: "2026-11-08",
  revision: 1,
  reason: "weekly",
  assignments: [
    assignment(),
    assignment({
      id: "22222222-2222-2222-2222-222222222222",
      choreName: "Bins",
      assigneeId: "sam",
      assigneeName: "Sam",
      explanation: "You have done the least effort lately.",
      items: [],
    }),
    assignment({
      id: "33333333-3333-3333-3333-333333333333",
      choreName: "Hallway",
      assigneeId: null,
      assigneeName: null,
      explanation: "Nobody is around for Hallway this week.",
      items: [],
    }),
  ],
};

describe("WeekView", () => {
  it("shows my chores first with the reason and progress, then everyone else", () => {
    render(<WeekView title="Next week" week={week} viewerId="me" today="2026-11-09" />);
    expect(screen.getByRole("heading", { name: "Next week" })).toBeInTheDocument();

    const cards = screen.getAllByRole("link");
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining("Kitchen"),
      expect.stringContaining("Hallway"),
      expect.stringContaining("Bins"),
    ]);
    expect(cards[0]).toHaveTextContent("You did Kitchen longest ago.");
    expect(cards[0]).toHaveTextContent("1 of 2 steps");
    expect(cards[0]).toHaveAttribute(
      "href",
      "/rota/assignments/11111111-1111-1111-1111-111111111111",
    );
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("Nobody was around")).toBeInTheDocument();
  });

  it("says so when the viewer has nothing this week", () => {
    render(<WeekView title="This week" week={week} viewerId="nobody" today="2026-11-09" />);
    expect(screen.getByText(/Nothing for you this week/)).toBeInTheDocument();
  });
});

describe("Checklist", () => {
  it("lets the assignee tick and untick steps, and shows progress", () => {
    render(<Checklist assignment={assignment()} canTick canSignOff={false} />);
    expect(screen.getByText("1 of 2 steps done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wipe the worktops/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Sweep/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows read-only steps to someone who cannot tick", () => {
    render(<Checklist assignment={assignment()} canTick={false} canSignOff={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    const list = screen.getByRole("list");
    expect(within(list).getByText(/Wipe the worktops/)).toHaveTextContent("(done)");
  });

  it("offers Mark done for a chore with no steps, and Reopen once it is finished", () => {
    const { rerender } = render(
      <Checklist assignment={assignment({ items: [] })} canTick canSignOff={false} />,
    );
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    rerender(
      <Checklist
        assignment={assignment({ items: [], completedAt: "2026-11-11T10:00:00Z" })}
        canTick
        canSignOff={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Done");
  });

  it("offers sign-off to another flatmate when the chore asks for it", () => {
    const finished = assignment({ needsSignoff: true, completedAt: "2026-11-11T10:00:00Z" });
    render(<Checklist assignment={finished} canTick={false} canSignOff />);
    expect(screen.getByRole("button", { name: "Sign it off" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("waiting for a flatmate");
  });
});
