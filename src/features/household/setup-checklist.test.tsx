import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SetupChecklist } from "./setup-checklist";
import { buildChecklist } from "./setup-steps";

describe("SetupChecklist", () => {
  it("renders nothing when set-up is finished", () => {
    const { container } = render(<SetupChecklist checklist={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an admin the steps, marking the one to do now", () => {
    render(<SetupChecklist checklist={buildChecklist("owner", { memberCount: 1 })} />);

    expect(screen.getByText("Set up your flat")).toBeInTheDocument();
    const step = screen.getByRole("listitem");
    expect(step).toHaveAttribute("aria-current", "step");
    expect(step).toHaveTextContent("Invite your flatmates (to do)");
    expect(screen.getByRole("link", { name: "Do this now" })).toHaveAttribute("href", "/more/flat");
  });

  it("gives a plain member a note and no links", () => {
    render(<SetupChecklist checklist={{ audience: "member" }} />);
    expect(screen.getByText(/still setting the flat up/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
