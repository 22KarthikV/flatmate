import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  saveChore: vi.fn(),
  archiveChore: vi.fn(),
  loadDefaultChores: vi.fn(),
}));
vi.mock("./actions", () => actions);

import { ChoreForm, moveStep } from "./chore-form";
import { ChoresManager } from "./chores-manager";
import type { Chore } from "./constants";

const KITCHEN: Chore = {
  id: "c1000000-0000-0000-0000-000000000001",
  name: "Kitchen",
  cadence: "weekly",
  preferredDow: 3,
  everyNDays: null,
  effort: 3,
  needsSignoff: false,
  archived: false,
  items: [
    { id: "i1", position: 1, text: "Wipe the worktops" },
    { id: "i2", position: 2, text: "Sweep" },
  ],
};

describe("moveStep", () => {
  it("swaps a step with its neighbour and leaves the edges alone", () => {
    expect(moveStep(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveStep(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveStep(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveStep(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("ChoreForm", () => {
  it("starts empty for a new chore, weekly, effort 3, with one blank step", () => {
    render(<ChoreForm />);
    expect(screen.getByLabelText("Chore name")).toHaveValue("");
    expect(screen.getByLabelText("How often")).toHaveValue("weekly");
    expect(screen.getByLabelText("Effort")).toHaveValue("3");
    expect(screen.getByLabelText("Usually done on")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Step \d/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add chore" })).toBeInTheDocument();
  });

  it("swaps the day for a number of days when the cadence changes", async () => {
    const user = userEvent.setup();
    render(<ChoreForm />);
    await user.selectOptions(screen.getByLabelText("How often"), "every_n_days");
    expect(screen.queryByLabelText("Usually done on")).toBeNull();
    expect(screen.getByLabelText(/Every how many days/)).toHaveAttribute("max", "14");
  });

  it("shows an existing chore's values and steps in order", () => {
    render(<ChoreForm chore={KITCHEN} />);
    expect(screen.getByLabelText("Chore name")).toHaveValue("Kitchen");
    expect(screen.getByLabelText("Usually done on")).toHaveValue("3");
    expect(screen.getByLabelText("Step 1")).toHaveValue("Wipe the worktops");
    expect(screen.getByLabelText("Step 2")).toHaveValue("Sweep");
    expect(screen.getByRole("button", { name: "Save chore" })).toBeInTheDocument();
  });

  it("adds, reorders and removes steps", async () => {
    const user = userEvent.setup();
    render(<ChoreForm chore={KITCHEN} />);

    await user.click(screen.getByRole("button", { name: "Add a step" }));
    await user.type(screen.getByLabelText("Step 3"), "Empty the bin");
    expect(screen.getAllByLabelText(/^Step \d/)).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Move step 2 up" }));
    expect(screen.getByLabelText("Step 1")).toHaveValue("Sweep");
    expect(screen.getByLabelText("Step 2")).toHaveValue("Wipe the worktops");

    await user.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(screen.getAllByLabelText(/^Step \d/)).toHaveLength(2);
    expect(screen.getByLabelText("Step 1")).toHaveValue("Wipe the worktops");
  });

  it("disables the move buttons at the edges", () => {
    render(<ChoreForm chore={KITCHEN} />);
    expect(screen.getByRole("button", { name: "Move step 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move step 2 down" })).toBeDisabled();
  });
});

describe("ChoresManager", () => {
  it("offers the usual five when the flat has no chores", () => {
    render(<ChoresManager chores={[]} />);
    expect(screen.getByRole("button", { name: "Load the usual five" })).toBeInTheDocument();
  });

  it("lists chores with effort and cadence, and opens the form to edit one", async () => {
    const user = userEvent.setup();
    render(<ChoresManager chores={[KITCHEN]} />);
    expect(screen.getByText("Effort 3 of 5")).toBeInTheDocument();
    expect(screen.getByText(/Weekly, on Wednesday/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load the usual five" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Kitchen" }));
    expect(screen.getByLabelText("Chore name")).toHaveValue("Kitchen");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Chore name")).toBeNull();
  });

  it("opens an empty form for a new chore", async () => {
    const user = userEvent.setup();
    render(<ChoresManager chores={[KITCHEN]} />);
    await user.click(screen.getByRole("button", { name: "Add a chore" }));
    expect(screen.getByLabelText("Chore name")).toHaveValue("");
  });
});
