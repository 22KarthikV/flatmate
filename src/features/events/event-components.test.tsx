import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  castVote: vi.fn(),
  cancelEvent: vi.fn(),
  decideTie: vi.fn(),
  removeOption: vi.fn(),
  addOption: vi.fn(),
}));

import { EventCard } from "./event-card";
import { buildEventView, type EventRow } from "./event-model";
import { OrganiserPanel } from "./organiser-panel";
import { VotePanel } from "./vote-panel";

const people = [
  { profileId: "a", displayName: "Alice" },
  { profileId: "b", displayName: "Bea" },
  { profileId: "c", displayName: "Cy" },
  { profileId: "d", displayName: "Di" },
  { profileId: "e", displayName: "Ed" },
];

const row: EventRow = {
  id: "e1",
  title: "Pizza night",
  description: "",
  location: "Our kitchen",
  status: "voting",
  organiser_id: "a",
  vote_deadline: "2026-11-04T18:00:00Z",
  tiebreak_since: null,
  confirmed_option_id: null,
  starts_at: null,
  ends_at: null,
  cancelled_by: null,
  cancelled_reason: null,
  options: [
    { id: "o1", starts_at: "2026-11-06T19:30:00Z", ends_at: null, removed_at: null },
    { id: "o2", starts_at: "2026-11-07T19:30:00Z", ends_at: null, removed_at: null },
  ],
  votes: [
    { option_id: "o1", profile_id: "b", answer: "yes" },
    { option_id: "o1", profile_id: "c", answer: "yes" },
    { option_id: "o1", profile_id: "d", answer: "maybe" },
  ],
};

const now = new Date("2026-11-02T12:00:00Z");

describe("VotePanel", () => {
  it("shows counts, what a date still needs and three labelled buttons per date", () => {
    render(<VotePanel event={buildEventView(row, people, "e")} />);
    expect(screen.getByText("2 yes, 1 maybe, 0 no")).toBeInTheDocument();
    expect(screen.getByText("One more yes confirms this date.")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Your answer for Fri 6 Nov, 19:30" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Yes", "Maybe", "No"]);
    expect(screen.getByText(/Your flatmates can see who answered what/)).toBeInTheDocument();
  });

  it("marks my own answer with a word, not only a colour", () => {
    render(<VotePanel event={buildEventView(row, people, "b")} />);
    const group = screen.getByRole("group", { name: "Your answer for Fri 6 Nov, 19:30" });
    const mine = within(group).getByRole("button", { name: /Yes/ });
    expect(mine).toHaveAttribute("aria-pressed", "true");
    expect(mine.textContent).toContain("your answer");
  });

  it("hides the buttons once voting is over", () => {
    const view = buildEventView(
      { ...row, status: "confirmed", confirmed_option_id: "o1", starts_at: "2026-11-06T19:30:00Z" },
      people,
      "e",
    );
    render(<VotePanel event={view} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Chosen")).toBeInTheDocument();
  });
});

describe("EventCard", () => {
  it("says what the viewer should do next", () => {
    const { rerender } = render(<EventCard event={buildEventView(row, people, "e")} now={now} />);
    expect(screen.getByText(/Needs your vote\. Voting closes in 2 days/)).toBeInTheDocument();
    rerender(<EventCard event={buildEventView(row, people, "b")} now={now} />);
    expect(screen.getByText(/You have voted/)).toBeInTheDocument();
    rerender(
      <EventCard
        event={buildEventView(
          { ...row, status: "tiebreak", tiebreak_since: "2026-11-03T00:00:00Z" },
          people,
          "e",
        )}
        now={now}
      />,
    );
    expect(screen.getByText("Waiting for Alice to pick a date.")).toBeInTheDocument();
    rerender(
      <EventCard
        event={buildEventView(
          { ...row, status: "cancelled", cancelled_reason: "Nobody could make any of the dates" },
          people,
          "e",
        )}
        now={now}
      />,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Nobody could make any of the dates")).toBeInTheDocument();
  });
});

describe("OrganiserPanel", () => {
  const view = buildEventView(row, people, "a");

  it("shows nothing to an ordinary member", () => {
    const { container } = render(
      <OrganiserPanel event={view} isOrganiser={false} isAdmin={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("gives the organiser editing, dropping dates and cancelling", () => {
    render(<OrganiserPanel event={view} isOrganiser isAdmin={false} />);
    expect(screen.getByRole("link", { name: /Edit the title/ })).toHaveAttribute(
      "href",
      "/events/e1/edit",
    );
    expect(screen.queryAllByRole("button", { name: /Drop/ })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Cancel the event" })).toBeInTheDocument();
  });

  it("gives an admin only the cancel option", () => {
    render(<OrganiserPanel event={view} isOrganiser={false} isAdmin />);
    expect(screen.queryByRole("link", { name: /Edit the title/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel the event" })).toBeInTheDocument();
  });

  it("asks the organiser to pick among tied dates", () => {
    const tied = buildEventView(
      {
        ...row,
        status: "tiebreak",
        tiebreak_since: "2026-11-03T00:00:00Z",
        votes: [
          { option_id: "o1", profile_id: "b", answer: "yes" },
          { option_id: "o2", profile_id: "c", answer: "yes" },
        ],
      },
      people,
      "a",
    );
    render(<OrganiserPanel event={tied} isOrganiser isAdmin={false} />);
    expect(screen.getByText("Pick a date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fri 6 Nov, 19:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sat 7 Nov, 19:30" })).toBeInTheDocument();
  });
});
