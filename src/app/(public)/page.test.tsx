import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Landing page", () => {
  it("shows the app name and tagline", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "FlatMate" })).toBeInTheDocument();
    expect(screen.getByText(/shared flat life/i)).toBeInTheDocument();
  });

  it("lists every feature and links into the app", () => {
    render(<Home />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/dashboard");
  });
});
