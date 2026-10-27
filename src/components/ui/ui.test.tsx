import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Avatar } from "./avatar";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";

describe("Button", () => {
  it("fires onClick and is keyboard operable", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Checkbox", () => {
  it("toggles by clicking its label and reports the new state", async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Clean the microwave" onCheckedChange={onCheckedChange} />);

    await userEvent.click(screen.getByText("Clean the microwave"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("checkbox", { name: "Clean the microwave" })).toBeChecked();
  });

  it("toggles with the space key", async () => {
    render(<Checkbox label="Wipe counters" />);

    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "Wipe counters" })).toBeChecked();
  });
});

describe("Input", () => {
  it("associates its label with the field", () => {
    render(<Input label="Amount" />);
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("shows initials as an accessible name", () => {
    render(<Avatar name="Sam Patel" tone={2} />);
    expect(screen.getByText("SP")).toBeInTheDocument();
  });
});
