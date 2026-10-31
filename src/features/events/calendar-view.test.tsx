import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildCalendar, calendarNav, type CalendarInput } from "./calendar-model";
import { CalendarView } from "./calendar-view";

const now = new Date("2026-11-02T12:00:00Z");

const input: CalendarInput = {
  range: { from: "2026-11-02", to: "2026-12-27" },
  viewerId: "me",
  events: [
    {
      id: "e1",
      title: "Pizza night",
      location: "Our kitchen",
      status: "confirmed",
      startsAt: "2026-11-06T19:30:00Z",
    },
    { id: "e2", title: "Board games", location: null, status: "voting", startsAt: null },
  ],
  chores: [
    { id: "c1", choreName: "Bins", dueOn: "2026-11-06", assigneeId: "me", completedAt: null },
  ],
  bills: [{ id: "b1", name: "Electric", dueOn: "2026-11-10", status: "created", voided: false }],
  ownRentDueDates: ["2026-11-06"],
  rotaDeadlines: ["2026-11-07T18:00:00Z"],
};

function renderView(over: Partial<CalendarInput> = {}, missing: string[] = []) {
  return render(
    <CalendarView
      model={buildCalendar({ ...input, ...over })}
      nav={calendarNav(now, null)}
      now={now}
      missing={missing}
    />,
  );
}

describe("CalendarView", () => {
  it("groups items by day and links each to its page with a word label", () => {
    renderView();
    const day = screen.getByRole("heading", { name: "Fri 6 Nov" }).parentElement!;
    const links = within(day).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/money/rent",
      "/rota/assignments/c1",
      "/events/e1",
    ]);
    expect(within(day).getByText("Rent")).toBeInTheDocument();
    expect(within(day).getByText("Your chore")).toBeInTheDocument();
    expect(within(day).getByText(/^Event/)).toHaveTextContent("Event · 19:30");
    expect(within(day).getByText("Our kitchen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rota availability closes/ })).toHaveAttribute(
      "href",
      "/rota/availability",
    );
    expect(screen.getByRole("link", { name: /Electric/ })).toHaveAttribute(
      "href",
      "/money/recurring/months",
    );
  });

  it("lists events being voted on in Still deciding, not on the grid", () => {
    renderView();
    const strip = screen.getByText("Still deciding").closest("section")!;
    expect(within(strip).getByRole("link", { name: "Board games" })).toHaveAttribute(
      "href",
      "/events/e2",
    );
    const agenda = screen.getByRole("region", { name: "Next 8 weeks" });
    expect(within(agenda).queryByText("Board games")).toBeNull();
  });

  it("has earlier and later month links and 44px tap targets", () => {
    renderView();
    expect(screen.getByRole("link", { name: /Earlier: November 2026/ })).toHaveAttribute(
      "href",
      "/events/calendar?month=2026-11",
    );
    expect(screen.getByRole("link", { name: /Later: January 2027/ })).toHaveAttribute(
      "href",
      "/events/calendar?month=2027-01",
    );
    for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-11");
  });

  it("shows a calm empty state", () => {
    renderView({ events: [], chores: [], bills: [], ownRentDueDates: [], rotaDeadlines: [] });
    expect(screen.getAllByText("Nothing planned").length).toBeGreaterThan(0);
    expect(screen.queryByText("Still deciding")).toBeNull();
  });

  it("says when a block could not be loaded and shows no amount", () => {
    const { container } = renderView({}, ["bills"]);
    expect(screen.getByRole("status")).toHaveTextContent("bills");
    expect(container.textContent).not.toMatch(/[£$]\s?\d|pence|amount:/i);
  });
});
