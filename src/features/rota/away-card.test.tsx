import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ setAway: vi.fn(), endAway: vi.fn() }));

import { AwayCard } from "./away-card";

const periods = [
  {
    id: "p1",
    profileId: "me",
    name: "Me",
    startsOn: "2026-11-08",
    endsOn: "2026-11-14",
    note: "Visiting family",
  },
  {
    id: "p2",
    profileId: "amy",
    name: "Amy",
    startsOn: "2026-11-10",
    endsOn: "2026-11-10",
    note: null,
  },
];

describe("AwayCard", () => {
  it("states that rent and bills still apply, shows everyone's dates and the note", () => {
    render(
      <AwayCard periods={periods} viewerId="me" isAdmin={false} members={[]} today="2026-11-02" />,
    );
    expect(screen.getByText("Away from chores. Rent and bills still apply.")).toBeInTheDocument();
    expect(screen.getByText(/You are away 8 Nov to 14 Nov/)).toBeInTheDocument();
    expect(screen.getByText(/Visiting family/)).toBeInTheDocument();
    expect(screen.getByText(/Amy is away 10 Nov/)).toBeInTheDocument();
  });

  it("lets you end only your own period, unless you are an admin", () => {
    const { rerender } = render(
      <AwayCard periods={periods} viewerId="me" isAdmin={false} members={[]} today="2026-11-02" />,
    );
    expect(screen.getByRole("button", { name: "End my away period" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /End Amy/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Who")).not.toBeInTheDocument();

    rerender(
      <AwayCard
        periods={periods}
        viewerId="me"
        isAdmin
        members={[
          { profileId: "me", displayName: "Me" },
          { profileId: "amy", displayName: "Amy" },
        ]}
        today="2026-11-02"
      />,
    );
    expect(screen.getByRole("button", { name: /End Amy.s away period/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Who")).toBeInTheDocument();
  });

  it("is only a list, and hidden when empty, on the rota page", () => {
    const { container, rerender } = render(
      <AwayCard
        periods={[]}
        viewerId="me"
        isAdmin={false}
        members={[]}
        today="2026-11-02"
        withForm={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <AwayCard
        periods={periods}
        viewerId="me"
        isAdmin={false}
        members={[]}
        today="2026-11-02"
        withForm={false}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
