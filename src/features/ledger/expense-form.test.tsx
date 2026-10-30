import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ addExpense: vi.fn(), editExpense: vi.fn() }));
vi.mock("./actions", () => actions);

import { ExpenseForm } from "./expense-form";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const PEOPLE = [
  { profileId: A, displayName: "Alice" },
  { profileId: B, displayName: "Bob" },
  { profileId: C, displayName: "Carol" },
];

function renderForm(props: Partial<React.ComponentProps<typeof ExpenseForm>> = {}) {
  return render(<ExpenseForm people={PEOPLE} viewerId={A} today="2026-10-30" {...props} />);
}

describe("ExpenseForm", () => {
  it("starts with today's date, the viewer as payer, and everyone ticked", () => {
    renderForm();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-30");
    expect(screen.getByLabelText("Who paid?")).toHaveValue(A);
    for (const name of [/Alice \(you\)/, /Bob/, /Carol/]) {
      expect(screen.getByRole("checkbox", { name })).toBeChecked();
    }
    expect(screen.getByText("Enter an amount to see each share.")).toBeInTheDocument();
  });

  it("uses the numeric keyboard for the amount and limits the description", () => {
    renderForm();
    expect(screen.getByLabelText("Amount (£)")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("What was it for?")).toHaveAttribute("maxlength", "80");
  });

  it("shows each share as the amount is typed, with leftover pence going to the first person", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "10");

    const shares = screen.getByText("Each share").parentElement!;
    expect(within(shares).getByText(/Alice \(you\)/).parentElement).toHaveTextContent("£3.34");
    expect(within(shares).getByText("Bob").parentElement).toHaveTextContent("£3.33");
    expect(within(shares).getByText("Carol").parentElement).toHaveTextContent("£3.33");
  });

  it("updates the shares when someone is unticked", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "9");
    await user.click(screen.getByRole("checkbox", { name: /Carol/ }));

    const shares = screen.getByText("Each share").parentElement!;
    expect(within(shares).queryByText("Carol")).toBeNull();
    expect(within(shares).getByText("Bob").parentElement).toHaveTextContent("£4.50");
  });

  it("splits by exact amounts and says what is left", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "9");
    await user.click(screen.getByRole("radio", { name: "By amounts" }));
    await user.type(screen.getByLabelText(/Alice/), "5");
    await user.type(screen.getByLabelText("Bob"), "3");

    expect(
      screen.getByText(/The amounts add up to £8\.00, but the expense is £9\.00/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Carol"), "1");
    const shares = screen.getByText("Each share").parentElement!;
    expect(within(shares).getByText(/Alice/).parentElement).toHaveTextContent("£5.00");
    expect(within(shares).getByText("Carol").parentElement).toHaveTextContent("£1.00");
  });

  it("splits by percentages", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "10");
    await user.click(screen.getByRole("radio", { name: "By percentages" }));
    await user.type(screen.getByLabelText(/Alice/), "50");
    await user.type(screen.getByLabelText("Bob"), "30");
    expect(screen.getByText(/must add up to 100%\. They add up to 80%/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Carol"), "20");

    const shares = screen.getByText("Each share").parentElement!;
    expect(within(shares).getByText(/Alice/).parentElement).toHaveTextContent("£5.00");
    expect(within(shares).getByText("Carol").parentElement).toHaveTextContent("£2.00");
  });

  it("puts the whole amount on one person", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "12.50");
    await user.click(screen.getByRole("radio", { name: "One person" }));
    expect(screen.getByText("Choose who this is for.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Bob" }));

    const shares = screen.getByText("Each share").parentElement!;
    expect(within(shares).getByText("Bob").parentElement).toHaveTextContent("£12.50");
    expect(within(shares).queryByText("Carol")).toBeNull();
  });

  it("posts the fields the server reads", async () => {
    actions.addExpense.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "9");
    await user.type(screen.getByLabelText("What was it for?"), "Kitchen roll");
    await user.selectOptions(screen.getByLabelText("Category"), "household");
    await user.selectOptions(screen.getByLabelText("Who paid?"), B);
    await user.click(screen.getByRole("checkbox", { name: /Carol/ }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(actions.addExpense).toHaveBeenCalledOnce();
    const form = actions.addExpense.mock.calls[0][1] as FormData;
    expect(form.get("amount")).toBe("9");
    expect(form.get("description")).toBe("Kitchen roll");
    expect(form.get("category")).toBe("household");
    expect(form.get("occurredOn")).toBe("2026-10-30");
    expect(form.get("paidBy")).toBe(B);
    expect(form.get("mode")).toBe("equal");
    expect(form.getAll("who")).toEqual([A, B]);
    expect(form.get("expenseId")).toBeNull();
  });

  it("shows the server's message as an alert", async () => {
    actions.addExpense.mockResolvedValue({ status: "error", message: "That date isn’t allowed." });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Amount (£)"), "9");
    await user.type(screen.getByLabelText("What was it for?"), "x");
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That date isn’t allowed.");
  });

  it("corrects an existing expense: prefilled, and it sends the expense id", async () => {
    actions.editExpense.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    renderForm({
      expense: {
        id: "e1000000-0000-0000-0000-000000000001",
        initial: {
          amount: "9.00",
          description: "Dinner",
          category: "takeaway",
          occurredOn: "2026-10-20",
          paidBy: B,
          mode: "equal",
          who: [A, B],
          exact: {},
          percent: {},
          one: "",
        },
      },
    });

    expect(screen.getByLabelText("Amount (£)")).toHaveValue("9.00");
    expect(screen.getByLabelText("What was it for?")).toHaveValue("Dinner");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-20");
    expect(screen.getByRole("checkbox", { name: /Carol/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(actions.editExpense).toHaveBeenCalledOnce();
    const form = actions.editExpense.mock.calls[0][1] as FormData;
    expect(form.get("expenseId")).toBe("e1000000-0000-0000-0000-000000000001");
    expect(form.get("paidBy")).toBe(B);
  });
});
