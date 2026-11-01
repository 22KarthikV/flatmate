import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ savePreferences: vi.fn() }));

import { PreferencesForm } from "./preferences-form";
import type { PreferenceView } from "./preferences";
import { NOTIFICATION_TYPES } from "./types";

const view = (type: string, inApp: boolean, push: boolean): PreferenceView => ({
  info: NOTIFICATION_TYPES.find((entry) => entry.type === type)!,
  inApp,
  push,
});

const everything = () => NOTIFICATION_TYPES.map(({ type }) => view(type, true, false));

describe("PreferencesForm", () => {
  it("shows the current choices ticked", () => {
    render(
      <PreferencesForm
        preferences={[view("member_joined", true, false), view("role_changed", false, true)]}
      />,
    );

    expect(screen.getByLabelText("In the app: Someone joins the flat")).toBeChecked();
    expect(screen.getByLabelText("Push to my phone: Someone joins the flat")).not.toBeChecked();
    expect(screen.getByLabelText("In the app: Your role changes")).not.toBeChecked();
    expect(screen.getByLabelText("Push to my phone: Your role changes")).toBeChecked();
  });

  it("is one form with exactly one Save button, however many types there are", () => {
    render(<PreferencesForm preferences={everything()} />);
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("groups the types under category headings", () => {
    render(<PreferencesForm preferences={everything()} />);
    const flat = screen.getByRole("region", { name: "Your flat" });
    expect(within(flat).getByText("Someone joins the flat")).toBeInTheDocument();
    expect(within(flat).queryByText("An event is confirmed")).toBeNull();
    const events = screen.getByRole("region", { name: "Events" });
    expect(within(events).getByText("An event is confirmed")).toBeInTheDocument();
  });

  it("names every checkbox the way the action reads it", () => {
    const { container } = render(
      <PreferencesForm preferences={[view("member_left", true, false)]} />,
    );
    expect(container.querySelector('input[name="in_app.member_left"]')).not.toBeNull();
    expect(container.querySelector('input[name="push.member_left"]')).not.toBeNull();
  });

  it("leaves out a category when none of its types are shown", () => {
    render(<PreferencesForm preferences={[view("member_left", true, false)]} />);
    expect(screen.queryByRole("region", { name: "Events" })).toBeNull();
  });
});
