import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  joinHousehold: vi.fn(),
  openInvite: vi.fn(),
}));
vi.mock("./actions", () => action);

import { InviteCard } from "./invite-card";
import { JoinForm } from "./join-form";
import { OpenInviteForm } from "./open-invite-form";

describe("InviteCard", () => {
  it("offers to make a first link when there is none", () => {
    render(<InviteCard activeUntil={null} />);
    expect(screen.getByText("There is no working link right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch link off" })).not.toBeInTheDocument();
  });

  it("says a link is working but cannot show it again", () => {
    render(<InviteCard activeUntil="5 November, 10:00" />);
    expect(screen.getByText(/working until 5 November, 10:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a new link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch link off" })).toBeInTheDocument();
  });

  it("shows the new link once it is made", async () => {
    action.createInvite.mockResolvedValue({ status: "created", url: "https://x.test/join/abc" });
    const user = userEvent.setup();
    render(<InviteCard activeUntil={null} />);

    await user.click(screen.getByRole("button", { name: "Make a link" }));
    expect(await screen.findByLabelText("Your link")).toHaveValue("https://x.test/join/abc");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("shows an error as an alert", async () => {
    action.createInvite.mockResolvedValue({ status: "error", message: "Nope." });
    const user = userEvent.setup();
    render(<InviteCard activeUntil={null} />);

    await user.click(screen.getByRole("button", { name: "Make a link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });
});

describe("JoinForm", () => {
  it("posts the token only when the button is pressed", async () => {
    action.joinHousehold.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<JoinForm token="tok" />);

    expect(action.joinHousehold).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect((action.joinHousehold.mock.calls[0][1] as FormData).get("token")).toBe("tok");
  });

  it("shows why joining failed", async () => {
    action.joinHousehold.mockResolvedValue({ status: "error", message: "This flat is full." });
    const user = userEvent.setup();
    render(<JoinForm token="tok" />);

    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This flat is full.");
  });
});

describe("OpenInviteForm", () => {
  it("submits the pasted text", async () => {
    action.openInvite.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<OpenInviteForm />);

    await user.type(screen.getByLabelText("Paste the link here"), "https://x.test/join/abc");
    await user.click(screen.getByRole("button", { name: "Open invite" }));
    expect((action.openInvite.mock.calls[0][1] as FormData).get("link")).toBe(
      "https://x.test/join/abc",
    );
  });
});
