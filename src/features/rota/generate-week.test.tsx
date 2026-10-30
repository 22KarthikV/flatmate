import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ generateWeekNow: vi.fn() }));

import { GenerateWeek } from "./generate-week";

describe("GenerateWeek", () => {
  it("offers next week first, states the deadline and what happens to anyone who has not answered", () => {
    render(
      <GenerateWeek
        weeks={[
          { start: "2026-11-08", label: "Next week" },
          { start: "2026-11-01", label: "This week" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: /Next week, from 8 Nov/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /This week, from 1 Nov/ })).not.toBeChecked();
    expect(screen.getByText(/Answer by Saturday 6pm/)).toBeInTheDocument();
    expect(screen.getByText(/anyone who has not answered counts as/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Give out the week" })).toBeInTheDocument();
  });
});
