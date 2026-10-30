import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  decideSwap: vi.fn(),
  cancelSwap: vi.fn(),
  requestSwap: vi.fn(),
  reassignChore: vi.fn(),
}));

import { SwapRequests } from "./swap-requests";
import { ReassignForm, SwapSheet } from "./swap-sheet";
import type { PendingSwap } from "./swaps";

const incoming: PendingSwap = {
  id: "s1",
  assignmentId: "a1",
  fromId: "amy",
  fromName: "Amy",
  toId: "me",
  toName: "Me",
  choreName: "Kitchen",
  dueOn: "2026-11-11",
  inReturn: { choreName: "Bins", dueOn: "2026-11-10" },
};
const outgoing: PendingSwap = {
  ...incoming,
  id: "s2",
  fromId: "me",
  fromName: "Me",
  toId: "bob",
  toName: "Bob",
  inReturn: null,
};

describe("SwapRequests", () => {
  it("shows nothing when the viewer is not involved", () => {
    const { container } = render(
      <SwapRequests
        swaps={[{ ...incoming, toId: "x", fromId: "y" }]}
        viewerId="me"
        today="2026-11-09"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the person asked accept or decline, and says what is offered in return", () => {
    render(<SwapRequests swaps={[incoming]} viewerId="me" today="2026-11-09" />);
    expect(screen.getByText(/Amy asks you to take Kitchen, Wednesday 11 Nov/)).toBeInTheDocument();
    expect(screen.getByText(/they would take your Bins, Tomorrow/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept Amy.s swap/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("lets the asker withdraw and says nothing changes until they accept", () => {
    render(<SwapRequests swaps={[outgoing]} viewerId="me" today="2026-11-09" />);
    expect(screen.getByText(/stays yours until they accept/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw request to Bob" })).toBeInTheDocument();
  });
});

describe("SwapSheet", () => {
  it("offers people and what could be taken in return", () => {
    render(
      <SwapSheet
        assignmentId="a1"
        options={[
          {
            profileId: "amy",
            displayName: "Amy",
            exchanges: [{ assignmentId: "x", label: "Bins, Tomorrow" }],
          },
          { profileId: "bob", displayName: "Bob", exchanges: [] },
        ]}
      />,
    );
    expect(screen.getByLabelText("Ask")).toHaveValue("amy");
    expect(screen.getByRole("option", { name: "Bins, Tomorrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask to swap" })).toBeInTheDocument();
  });

  it("says so when nobody is around that day", () => {
    render(<SwapSheet assignmentId="a1" options={[]} />);
    expect(screen.getByText(/Nobody else is around that day/)).toBeInTheDocument();
  });
});

describe("ReassignForm", () => {
  it("warns that an admin move ignores being away and keeps their name", () => {
    render(<ReassignForm assignmentId="a1" people={[{ profileId: "bob", displayName: "Bob" }]} />);
    expect(screen.getByText(/even if they are away that day/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move it" })).toBeInTheDocument();
  });
});
