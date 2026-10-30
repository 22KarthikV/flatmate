import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ saveTemplate: vi.fn() }));
vi.mock("./actions", () => actions);

import { TemplateForm, type FormPerson } from "./template-form";
import { emptyValues } from "./template-input";

const SAM = "00000000-0000-0000-0000-000000000001";
const ALICE = "00000000-0000-0000-0000-000000000003";
const BOB = "00000000-0000-0000-0000-000000000004";

const people: FormPerson[] = [
  { profileId: SAM, displayName: "Sam", isAdmin: true },
  { profileId: ALICE, displayName: "Alice", isAdmin: false },
  { profileId: BOB, displayName: "Bob", isAdmin: false },
];

function payload(container: HTMLElement): string {
  return (container.querySelector('input[name="payload"]') as HTMLInputElement).value;
}

describe("TemplateForm: a bill", () => {
  it("starts as a bill with a fixed amount shared by everyone, and cannot be saved yet", () => {
    render(<TemplateForm people={people} initial={emptyValues("bill", { profileId: SAM })} />);
    expect(screen.getByRole("button", { name: "A bill" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Amount each month (£)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Everyone in the flat/)).toBeChecked();
    expect(screen.getByRole("button", { name: "Add bill" })).toBeDisabled();
  });

  it("is ready to save once it has a name and an amount, and posts the checked template", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TemplateForm people={people} initial={emptyValues("bill", { profileId: SAM })} />,
    );
    await user.type(screen.getByLabelText("Name"), "Wi-Fi");
    await user.type(screen.getByLabelText("Amount each month (£)"), "32");
    await user.selectOptions(screen.getByLabelText("Due on the"), "12");
    expect(screen.getByRole("button", { name: "Add bill" })).toBeEnabled();
    expect(screen.getByText("£32.00 a month")).toBeInTheDocument();
    expect(JSON.parse(payload(container))).toMatchObject({
      kind: "bill",
      name: "Wi-Fi",
      dueDay: 12,
      amountMode: "fixed",
      amountPence: 3200,
      splitMode: "equal",
      people: [],
    });
  });

  it("explains how a variable bill works and hides the amount", async () => {
    const user = userEvent.setup();
    render(<TemplateForm people={people} initial={emptyValues("bill", { profileId: SAM })} />);
    await user.click(screen.getByRole("button", { name: "Changes each month" }));
    expect(screen.getByText(/Two weeks before it is due/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount each month (£)")).not.toBeInTheDocument();
  });

  it("asks for a percentage for each person and says what is wrong when they do not add up", async () => {
    const user = userEvent.setup();
    render(
      <TemplateForm
        people={people}
        initial={{ ...emptyValues("bill", { profileId: SAM }), name: "Boiler", amount: "10" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "By percentages" }));
    await user.type(screen.getByLabelText("Alice"), "60");
    await user.type(screen.getByLabelText("Bob"), "30");
    expect(screen.getByText(/add up to 100%. They add up to 90%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add bill" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Bob"));
    await user.type(screen.getByLabelText("Bob"), "40");
    expect(screen.getByRole("button", { name: "Add bill" })).toBeEnabled();
  });

  it("lets the months be unticked", async () => {
    const user = userEvent.setup();
    render(<TemplateForm people={people} initial={emptyValues("bill", { profileId: SAM })} />);
    const feb = screen.getByRole("button", { name: "Feb" });
    expect(feb).toHaveAttribute("aria-pressed", "true");
    await user.click(feb);
    expect(feb).toHaveAttribute("aria-pressed", "false");
  });
});

describe("TemplateForm: a rent", () => {
  async function filledRent() {
    const user = userEvent.setup();
    const result = render(
      <TemplateForm people={people} initial={emptyValues("rent", { profileId: SAM })} />,
    );
    await user.click(screen.getByRole("button", { name: "Rent" }));
    await user.type(screen.getByLabelText("Room 1 name"), "Big room");
    await user.type(screen.getByLabelText("Room's rent each month (£)"), "1200.01");
    const live = screen.getAllByRole("checkbox");
    await user.click(live.find((box) => box.closest("label")?.textContent === "Alice")!);
    await user.click(live.find((box) => box.closest("label")?.textContent === "Bob")!);
    return { user, ...result };
  }

  it("lists only owners and admins as possible collectors", async () => {
    render(<TemplateForm people={people} initial={emptyValues("rent", { profileId: SAM })} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(screen.getByLabelText("Who collects the rent?")).toHaveValue(SAM);
    expect(options).toContain("Sam");
  });

  it("shows each person's amount and the total as the rooms are filled in", async () => {
    await filledRent();
    expect(screen.getByText("£600.01")).toBeInTheDocument();
    expect(screen.getByText("£600.00")).toBeInTheDocument();
    expect(screen.getByText("£1,200.01 a month across 2 people")).toBeInTheDocument();
    expect(screen.getByText(/Not in a room, so not charged rent: Sam/)).toBeInTheDocument();
  });

  it("moves a person out of their old room when they are ticked in another", async () => {
    const { user } = await filledRent();
    await user.click(screen.getByRole("button", { name: "Add a room" }));
    const rooms = screen
      .getAllByText("Who lives here?")
      .map((legend) => legend.closest("fieldset")!);
    const tick = (fieldset: HTMLElement, name: string) =>
      Array.from(fieldset.querySelectorAll("label"))
        .find((label) => label.textContent === name)!
        .querySelector("input")!;
    expect(tick(rooms[0], "Alice")).toBeChecked();
    await user.click(tick(rooms[1], "Alice"));
    expect(tick(rooms[1], "Alice")).toBeChecked();
    expect(tick(rooms[0], "Alice")).not.toBeChecked();
  });

  it("explains that nobody else can see the amounts, not even a roommate", async () => {
    render(<TemplateForm people={people} initial={emptyValues("rent", { profileId: SAM })} />);
    expect(screen.getByText(/not even a flatmate in the same room/)).toBeInTheDocument();
  });
});

describe("TemplateForm: editing", () => {
  it("keeps the kind, posts the template id and says edits only affect future months", () => {
    const { container } = render(
      <TemplateForm
        people={people}
        initial={{ ...emptyValues("bill", { profileId: SAM }), name: "Gas", amount: "10" }}
        templateId="t1"
        lockKind
      />,
    );
    expect(screen.queryByRole("button", { name: "A bill" })).not.toBeInTheDocument();
    expect(container.querySelector('input[name="templateId"]')).toHaveValue("t1");
    expect(screen.getByText(/Changes affect future months only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
