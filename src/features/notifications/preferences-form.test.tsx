import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ savePreference: vi.fn() }));

import { PreferencesForm } from "./preferences-form";
import type { PreferenceView } from "./preferences";
import { NOTIFICATION_TYPES } from "./types";

const view = (type: string, inApp: boolean, push: boolean): PreferenceView => ({
  info: NOTIFICATION_TYPES.find((entry) => entry.type === type)!,
  inApp,
  push,
});

describe("PreferencesForm", () => {
  it("shows one form per type with the current choices ticked", () => {
    render(
      <PreferencesForm
        preferences={[view("member_joined", true, false), view("role_changed", false, true)]}
      />,
    );

    const joined = screen.getByRole("form", { name: "Someone joins the flat" });
    expect(within(joined).getByLabelText("In the app")).toBeChecked();
    expect(within(joined).getByLabelText("Push to my phone")).not.toBeChecked();

    const role = screen.getByRole("form", { name: "Your role changes" });
    expect(within(role).getByLabelText("In the app")).not.toBeChecked();
    expect(within(role).getByLabelText("Push to my phone")).toBeChecked();
  });

  it("sends the type with the form and names its checkboxes as the action expects", () => {
    render(<PreferencesForm preferences={[view("member_left", true, false)]} />);
    const form = screen.getByRole("form", { name: "Someone leaves the flat" });
    expect(form.querySelector('input[name="type"]')).toHaveValue("member_left");
    expect(form.querySelector('input[name="in_app"]')).not.toBeNull();
    expect(form.querySelector('input[name="push"]')).not.toBeNull();
    expect(within(form).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
