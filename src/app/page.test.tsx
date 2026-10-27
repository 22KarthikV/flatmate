import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home page", () => {
  it("shows the app name and tagline", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "FlatMate" })).toBeInTheDocument();
    expect(screen.getByText(/shared flat life/i)).toBeInTheDocument();
  });
});
