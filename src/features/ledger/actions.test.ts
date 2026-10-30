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

vi.mock("@/features/household/membership", () => ({
  getMembership: async () => ({
    profileId: "00000000-0000-0000-0000-00000000000a",
    householdId: "h1",
  }),
}));
vi.mock("./recipients", () => ({
  getSettlementRecipients: async () => ({
    current: [{ profileId: "00000000-0000-0000-0000-00000000000b", displayName: "Sam" }],
    former: [{ profileId: "00000000-0000-0000-0000-00000000000c", displayName: "Dee" }],
  }),
}));

import {
  addExpense,
  cancelSettlement,
  confirmSettlement,
  declineSettlement,
  editExpense,
  recordSettlement,
  saveNudgeInterval,
  voidExpense,
} from "./actions";
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

describe("recordSettlement", () => {
  const form = (to: string, amount: string) => {
    const data = new FormData();
    data.set("to", to);
    data.set("amount", amount);
    return data;
  };

  it("refuses paying yourself or a stranger without calling the database", async () => {
    expect(await recordSettlement(IDLE, form(A, "5"))).toEqual({
      status: "error",
      message: "Choose who you paid.",
    });
    expect(await recordSettlement(IDLE, form("00000000-0000-0000-0000-0000000000ff", "5"))).toEqual(
      { status: "error", message: "Choose who you paid." },
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("allows a payment to a former flatmate who is still owed money", async () => {
    mocks.rpc.mockResolvedValue({ data: "s1", error: null });
    const dee = "00000000-0000-0000-0000-00000000000c";
    await expect(recordSettlement(IDLE, form(dee, "5"))).rejects.toThrow("REDIRECT:/money");
    expect(mocks.rpc).toHaveBeenCalledWith("record_settlement", { p_to: dee, p_amount_pence: 500 });
  });

  it("refuses a bad amount", async () => {
    expect(await recordSettlement(IDLE, form(B, "abc"))).toEqual({
      status: "error",
      message: "Enter an amount like 4.20.",
    });
  });

  it("records the payment in pence and goes back to the Money screen", async () => {
    mocks.rpc.mockResolvedValue({ data: "s1", error: null });
    await expect(recordSettlement(IDLE, form(B, "12.50"))).rejects.toThrow("REDIRECT:/money");
    expect(mocks.rpc).toHaveBeenCalledWith("record_settlement", {
      p_to: B,
      p_amount_pence: 1250,
    });
  });

  it("explains the database's refusals", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "not_a_member" } });
    expect(await recordSettlement(IDLE, form(B, "5"))).toEqual({
      status: "error",
      message: "Everyone on an expense must still be in the flat.",
    });
  });
});

describe("settlement decisions", () => {
  const SETTLEMENT = "51000000-0000-0000-0000-000000000001";
  const form = (id: string) => {
    const data = new FormData();
    data.set("settlementId", id);
    return data;
  };

  it.each([
    [confirmSettlement, "confirm_settlement"],
    [declineSettlement, "decline_settlement"],
    [cancelSettlement, "cancel_settlement"],
  ] as const)("%o calls %s with the payment's id and refreshes the screen", async (action, fn) => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await action(IDLE, form(SETTLEMENT))).toEqual({ status: "idle" });
    expect(mocks.rpc).toHaveBeenCalledWith(fn, { p_settlement_id: SETTLEMENT });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/money");
  });

  it.each([confirmSettlement, declineSettlement, cancelSettlement])(
    "%o needs a real payment id",
    async (action) => {
      expect(await action(IDLE, form("nope"))).toEqual({
        status: "error",
        message: "We couldn’t find that payment.",
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("says when it has already been dealt with", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "settlement_not_pending" },
    });
    expect(await confirmSettlement(IDLE, form(SETTLEMENT))).toEqual({
      status: "error",
      message: "That payment has already been dealt with.",
    });
  });

  it("says when someone else's payment cannot be touched", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not_allowed" } });
    expect(await cancelSettlement(IDLE, form(SETTLEMENT))).toEqual({
      status: "error",
      message: "You can’t do that in this flat.",
    });
  });
});

describe("saveNudgeInterval", () => {
  const form = (value: string) => {
    const data = new FormData();
    data.set("interval", value);
    return data;
  };

  it("refuses an interval that is not offered, without calling the database", async () => {
    expect(await saveNudgeInterval({ status: "idle" }, form("5"))).toEqual({
      status: "error",
      message: "Choose how often to remind people.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["off", null],
    ["3", 3],
    ["14", 14],
  ])("saves %s", async (value, days) => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await saveNudgeInterval({ status: "idle" }, form(value))).toEqual({ status: "saved" });
    expect(mocks.rpc).toHaveBeenCalledWith("set_nudge_interval", { p_days: days });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/more/flat");
  });

  it("says when only admins can change it", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not_allowed" } });
    expect(await saveNudgeInterval({ status: "idle" }, form("7"))).toEqual({
      status: "error",
      message: "Only the owner and admins can change this.",
    });
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
