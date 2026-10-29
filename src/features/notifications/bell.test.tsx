import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BellLink } from "./bell-link";

describe("BellLink", () => {
  it("links to the inbox and shows no badge when there is nothing new", () => {
    render(<BellLink unread={0} />);
    const link = screen.getByRole("link", { name: "Notifications" });
    expect(link).toHaveAttribute("href", "/notifications");
    expect(screen.queryByTestId("bell-badge")).toBeNull();
  });

  it("shows the unread count and says so to screen readers", () => {
    render(<BellLink unread={3} />);
    expect(screen.getByRole("link", { name: "Notifications, 3 unread" })).toBeInTheDocument();
    expect(screen.getByTestId("bell-badge")).toHaveTextContent("3");
  });

  it("caps the badge at 9+ but keeps the real number for screen readers", () => {
    render(<BellLink unread={14} />);
    expect(screen.getByTestId("bell-badge")).toHaveTextContent("9+");
    expect(screen.getByRole("link", { name: "Notifications, 14 unread" })).toBeInTheDocument();
  });

  it("renders without a count while it loads", () => {
    render(<BellLink />);
    expect(screen.getByRole("link", { name: "Notifications" })).toBeInTheDocument();
  });
});
