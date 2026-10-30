import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ undoRebuild: vi.fn() }));

import { RebuildNotice } from "./rebuild-notice";

const rebuild = {
  id: "r1",
  leaverName: "Dave",
  moved: 2,
  unassigned: 0,
  undoUntil: "2026-11-12T12:00:00Z",
};

describe("RebuildNotice", () => {
  it("shows nothing when there is nothing to undo", () => {
    const { container } = render(<RebuildNotice rebuilds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says what moved, until when it can be undone, and what undo does", () => {
    render(<RebuildNotice rebuilds={[rebuild]} />);
    expect(
      screen.getByText(/Dave left, so 2 chores were given to other people/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You can undo this until Thursday 12:00/)).toBeInTheDocument();
    expect(screen.getByText(/Dave’s own chores stay with their new person/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo the changes after Dave left" }),
    ).toBeInTheDocument();
  });

  it("mentions chores nobody could take, and uses the singular", () => {
    render(<RebuildNotice rebuilds={[{ ...rebuild, moved: 1, unassigned: 1 }]} />);
    expect(screen.getByText(/1 chore was given/)).toBeInTheDocument();
    expect(screen.getByText(/1 could not be given to anyone/)).toBeInTheDocument();
  });
});
