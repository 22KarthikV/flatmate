import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstallPrompt } from "./install-prompt";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

describe("InstallPrompt", () => {
  it("shows Add to Home Screen steps on iPhone, then hides when dismissed", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPHONE_UA);

    render(<InstallPrompt />);
    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(
      screen.queryByRole("complementary", { name: "Install FlatMate" }),
    ).not.toBeInTheDocument();
  });
});
