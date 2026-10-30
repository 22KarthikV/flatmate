// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getClaims: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError, info: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  }),
}));

import { enterBillAmount } from "./actions";

const INSTANCE = "e1000000-0000-0000-0000-000000000001";
const IDLE = { status: "idle" } as const;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  mocks.rpc.mockResolvedValue({ data: "expense-1", error: null });
});

describe("enterBillAmount", () => {
  it("sends the amount in pence and returns to the bills screen", async () => {
    await expect(
      enterBillAmount(IDLE, form({ instanceId: INSTANCE, amount: "84.50" })),
    ).rejects.toThrow("REDIRECT:/money/recurring");
    expect(mocks.rpc).toHaveBeenCalledWith("enter_bill_amount", {
      p_instance: INSTANCE,
      p_amount_pence: 8450,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/money");
  });

  it("refuses a bad id or amount before asking the database", async () => {
    expect(await enterBillAmount(IDLE, form({ instanceId: "nope", amount: "5" }))).toEqual({
      status: "error",
      message: "We couldn’t find that bill.",
    });
    const result = await enterBillAmount(IDLE, form({ instanceId: INSTANCE, amount: "4.205" }));
    expect(result.status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps the database's words to a sentence, without logging an expected outcome", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "already_entered" } });
    expect(await enterBillAmount(IDLE, form({ instanceId: INSTANCE, amount: "5" }))).toEqual({
      status: "error",
      message: "The amount for this month has already been entered.",
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("logs something unexpected and shows a general message", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await enterBillAmount(IDLE, form({ instanceId: INSTANCE, amount: "5" }));
    expect(result).toEqual({
      status: "error",
      message: "We couldn’t save that. Please try again.",
    });
    expect(mocks.logError).toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null });
    await expect(
      enterBillAmount(IDLE, form({ instanceId: INSTANCE, amount: "5" })),
    ).rejects.toThrow("REDIRECT:/sign-in");
  });
});
