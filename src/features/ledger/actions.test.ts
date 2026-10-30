// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getClaims: vi.fn(),
  getMembers: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError, info: vi.fn() } }));
vi.mock("@/features/household/members", () => ({ getMembers: mocks.getMembers }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  }),
}));

import { addExpense, editExpense, voidExpense } from "./actions";
import { londonToday } from "./form";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const EXPENSE = "e1000000-0000-0000-0000-000000000001";
const IDLE = { status: "idle" } as const;

function expenseForm(extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("amount", "9.00");
  data.set("description", "Kitchen roll");
  data.set("category", "household");
  data.set("occurredOn", londonToday());
  data.set("paidBy", A);
  data.set("mode", "equal");
  data.append("who", A);
  data.append("who", B);
  for (const [name, value] of Object.entries(extra)) data.set(name, value);
  return data;
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u1" } } });
  mocks.getMembers.mockReset().mockResolvedValue([{ profileId: A }, { profileId: B }]);
  mocks.revalidatePath.mockReset();
  mocks.logError.mockReset();
});

describe("addExpense", () => {
  it("refuses a bad form without calling the database", async () => {
    const result = await addExpense(IDLE, expenseForm({ amount: "abc" }));
    expect(result).toEqual({ status: "error", message: "Enter an amount like 4.20." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses someone who is not in the flat, even if the form says so", async () => {
    const stranger = "00000000-0000-0000-0000-0000000000ff";
    const result = await addExpense(IDLE, expenseForm({ paidBy: stranger }));
    expect(result).toEqual({ status: "error", message: "Choose who paid." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null });
    await expect(addExpense(IDLE, expenseForm())).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fmoney",
    );
  });

  it("sends the computed shares to the database and opens the new expense", async () => {
    mocks.rpc.mockResolvedValue({ data: EXPENSE, error: null });
    await expect(addExpense(IDLE, expenseForm())).rejects.toThrow(
      `REDIRECT:/money/expenses/${EXPENSE}`,
    );

    expect(mocks.rpc).toHaveBeenCalledWith("add_expense", {
      p_amount_pence: 900,
      p_description: "Kitchen roll",
      p_category: "household",
      p_occurred_on: londonToday(),
      p_paid_by: A,
      p_profile_ids: [A, B],
      p_share_pence: [450, 450],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/money");
  });

  it("explains the database's refusals without logging the expected ones", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "not_a_member" },
    });
    const result = await addExpense(IDLE, expenseForm());
    expect(result).toEqual({
      status: "error",
      message: "Everyone on an expense must still be in the flat.",
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("logs and apologises for anything unexpected", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const result = await addExpense(IDLE, expenseForm());
    expect(result).toEqual({
      status: "error",
      message: "We couldn’t save that. Please try again.",
    });
    expect(mocks.logError).toHaveBeenCalledOnce();
  });
});

describe("editExpense", () => {
  it("needs a real expense id", async () => {
    const result = await editExpense(IDLE, expenseForm({ expenseId: "../x" }));
    expect(result).toEqual({ status: "error", message: "We couldn’t find that expense." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends the correction and opens the replacement", async () => {
    mocks.rpc.mockResolvedValue({ data: "e2000000-0000-0000-0000-000000000002", error: null });
    await expect(editExpense(IDLE, expenseForm({ expenseId: EXPENSE }))).rejects.toThrow(
      "REDIRECT:/money/expenses/e2000000-0000-0000-0000-000000000002",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "edit_expense",
      expect.objectContaining({ p_expense_id: EXPENSE, p_amount_pence: 900 }),
    );
  });

  it("reports that someone else's expense cannot be changed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not_allowed" } });
    const result = await editExpense(IDLE, expenseForm({ expenseId: EXPENSE }));
    expect(result).toEqual({ status: "error", message: "You can’t do that in this flat." });
  });
});

describe("voidExpense", () => {
  const form = (id: string) => {
    const data = new FormData();
    data.set("expenseId", id);
    return data;
  };

  it("needs a real expense id", async () => {
    const result = await voidExpense(IDLE, form("nope"));
    expect(result).toEqual({ status: "error", message: "We couldn’t find that expense." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("cancels it and goes back to the list", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(voidExpense(IDLE, form(EXPENSE))).rejects.toThrow("REDIRECT:/money");
    expect(mocks.rpc).toHaveBeenCalledWith("void_expense", { p_expense_id: EXPENSE });
  });

  it("says when it was already cancelled", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "already_voided" },
    });
    const result = await voidExpense(IDLE, form(EXPENSE));
    expect(result).toEqual({
      status: "error",
      message: "That expense has already been cancelled.",
    });
  });
});
