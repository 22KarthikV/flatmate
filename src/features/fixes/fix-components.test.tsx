import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addNote: vi.fn(),
  changeStatus: vi.fn(),
  hideReport: vi.fn(),
  reportFix: vi.fn(),
  setChaser: vi.fn(),
  takeChase: vi.fn(),
}));

import { FixList } from "./fix-list";
import { FixTimeline } from "./fix-timeline";
import { StatusControls } from "./status-controls";
import type { FixReport } from "./view";

const NOW = "2026-11-10T12:00:00Z";
const report = (id: string, over: Partial<FixReport> = {}): FixReport => ({
  id,
  title: `Problem ${id}`,
  details: null,
  location: null,
  status: "open",
  reportedBy: "p-bob",
  reporterName: "Bob",
  chaserId: null,
  chaserName: null,
  createdAt: "2026-11-09T12:00:00Z",
  lastActivityAt: "2026-11-09T12:00:00Z",
  ...over,
});
const people = [
  { profileId: "p-bob", displayName: "Bob" },
  { profileId: "p-carol", displayName: "Carol" },
];

describe("FixList", () => {
  it("shows an empty state", () => {
    render(<FixList reports={[]} now={NOW} />);
    expect(screen.getByText(/Nothing is broken/)).toBeInTheDocument();
  });

  it("groups by status with words, and says who is chasing", () => {
    render(
      <FixList
        reports={[
          report("a", { location: "Bathroom" }),
          report("b", { status: "in_progress", chaserId: "p-carol", chaserName: "Carol" }),
          report("c", { status: "fixed" }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "Open (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In progress (1)" })).toBeInTheDocument();
    expect(screen.getByText("Fixed (1)")).toBeInTheDocument();
    expect(screen.getByText(/Open · Bathroom · Nobody chasing · yesterday/)).toBeInTheDocument();
    expect(screen.getByText(/In progress · Chasing: Carol/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Problem a/ })).toHaveAttribute(
      "href",
      "/more/fixes/a",
    );
  });
});

describe("FixTimeline", () => {
  it("shows notes with their author, and changes as sentences, in order", () => {
    render(
      <FixTimeline
        updates={[
          {
            id: "1",
            kind: "note",
            body: "Emailed the agent",
            authorName: "Bob",
            createdAt: "2026-11-09T12:00:00Z",
          },
          {
            id: "2",
            kind: "status",
            body: "Carol set it to Fixed",
            authorName: "Carol",
            createdAt: "2026-11-10T11:00:00Z",
          },
        ]}
        now={NOW}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Bob: Emailed the agent");
    expect(items[1]).toHaveTextContent("Carol set it to Fixed");
  });
  it("has an empty state", () => {
    render(<FixTimeline updates={[]} now={NOW} />);
    expect(screen.getByText(/No notes or changes yet/)).toBeInTheDocument();
  });
});

describe("StatusControls", () => {
  it("lets anyone add a note, and take the chase while nobody has it, but not change status", () => {
    render(
      <StatusControls
        report={report("a")}
        viewer={{ profileId: "p-dan", isAdmin: false }}
        people={people}
      />,
    );
    expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chase this/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save status" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove report" })).toBeNull();
  });

  it("gives the reporter the status control but not the hand-over or remove", () => {
    render(
      <StatusControls
        report={report("a")}
        viewer={{ profileId: "p-bob", isAdmin: false }}
        people={people}
      />,
    );
    expect(screen.getByRole("button", { name: "Save status" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Who is chasing the landlord")).toBeNull();
  });

  it("gives the chaser a hand-over, hides take-chase, and gives admins remove", () => {
    const chased = report("a", { chaserId: "p-carol", chaserName: "Carol" });
    const { rerender } = render(
      <StatusControls
        report={chased}
        viewer={{ profileId: "p-carol", isAdmin: false }}
        people={people}
      />,
    );
    expect(screen.getByLabelText("Who is chasing the landlord")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /chase this/ })).toBeNull();
    rerender(
      <StatusControls
        report={chased}
        viewer={{ profileId: "p-alice", isAdmin: true }}
        people={people}
      />,
    );
    expect(screen.getByRole("button", { name: "Remove report" })).toBeInTheDocument();
  });
});
