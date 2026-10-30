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
  getMembers: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/household/members", () => ({ getMembers: mocks.getMembers }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError, info: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  }),
}));

import {
  endTemplate,
  enterBillAmount,
  pauseTemplate,
  resumeTemplate,
  saveTemplate,
  skipMonth,
} from "./actions";

const INSTANCE = "e1000000-0000-0000-0000-000000000001";
const IDLE = { status: "idle" } as const;
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const TEMPLATE = "c1000000-0000-0000-0000-000000000001";
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  mocks.rpc.mockResolvedValue({ data: "expense-1", error: null });
  mocks.getMembers.mockResolvedValue([{ profileId: A }, { profileId: B }, { profileId: C }]);
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

const bill = {
  kind: "bill",
  name: "Wi-Fi",
  paidBy: A,
  dueDay: 12,
  amountMode: "fixed",
  amountPence: 3200,
  splitMode: "equal",
  people: [],
  activeMonths: ALL,
};

describe("saveTemplate", () => {
  it("creates a bill: sends the database's JSON and goes to the new template", async () => {
    mocks.rpc.mockResolvedValue({ data: TEMPLATE, error: null });
    await expect(saveTemplate(IDLE, form({ payload: JSON.stringify(bill) }))).rejects.toThrow(
      `REDIRECT:/money/recurring/${TEMPLATE}`,
    );
    expect(mocks.rpc).toHaveBeenCalledWith("save_recurring_template", {
      p_template_id: null,
      p_payload: expect.objectContaining({
        kind: "bill",
        name: "Wi-Fi",
        paid_by: A,
        due_day: 12,
        amount_pence: 3200,
        active_months: ALL,
      }),
    });
  });

  it("edits when a template id is posted", async () => {
    mocks.rpc.mockResolvedValue({ data: TEMPLATE, error: null });
    await expect(
      saveTemplate(IDLE, form({ payload: JSON.stringify(bill), templateId: TEMPLATE })),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.rpc.mock.calls[0][1].p_template_id).toBe(TEMPLATE);
  });

  it("fixes each person's rent in pence before sending it", async () => {
    mocks.rpc.mockResolvedValue({ data: TEMPLATE, error: null });
    const rent = {
      kind: "rent",
      name: "Rent",
      collectorId: A,
      dueDay: 6,
      activeMonths: ALL,
      rooms: [{ name: "Big", rentPence: 120_001, occupantIds: [B, C] }],
      custom: [],
    };
    await expect(saveTemplate(IDLE, form({ payload: JSON.stringify(rent) }))).rejects.toThrow(
      "REDIRECT",
    );
    const sent = mocks.rpc.mock.calls[0][1].p_payload;
    expect(sent.rooms[0].people).toEqual([
      { profile_id: B, pence: 60_001 },
      { profile_id: C, pence: 60_000 },
    ]);
  });

  it("refuses bad input, people outside the flat and a bad template id before the database", async () => {
    expect(await saveTemplate(IDLE, form({ payload: "not json" }))).toMatchObject({
      status: "error",
    });
    expect(
      await saveTemplate(IDLE, form({ payload: JSON.stringify({ ...bill, dueDay: 31 }) })),
    ).toMatchObject({ status: "error", message: "The due day is between 1 and 28." });
    const outsider = "00000000-0000-0000-0000-0000000000ff";
    expect(
      await saveTemplate(IDLE, form({ payload: JSON.stringify({ ...bill, paidBy: outsider }) })),
    ).toMatchObject({ status: "error", message: "Everyone named must still be in the flat." });
    expect(
      await saveTemplate(IDLE, form({ payload: JSON.stringify(bill), templateId: "nope" })),
    ).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows the database's sentence for an expected refusal", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
    expect(await saveTemplate(IDLE, form({ payload: JSON.stringify(bill) }))).toEqual({
      status: "error",
      message: "You can’t do that in this flat.",
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});

describe("pause, resume, end and skip", () => {
  it("each calls its database function and returns to the template", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    for (const [action, name] of [
      [pauseTemplate, "pause_recurring_template"],
      [resumeTemplate, "resume_recurring_template"],
      [endTemplate, "end_recurring_template"],
    ] as const) {
      mocks.rpc.mockClear();
      await expect(action(IDLE, form({ templateId: TEMPLATE }))).rejects.toThrow(
        `REDIRECT:/money/recurring/${TEMPLATE}`,
      );
      expect(mocks.rpc).toHaveBeenCalledWith(name, { p_template_id: TEMPLATE });
    }
  });

  it("skips a month", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      skipMonth(IDLE, form({ templateId: TEMPLATE, period: "2026-12-01" })),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.rpc).toHaveBeenCalledWith("skip_recurring_month", {
      p_template_id: TEMPLATE,
      p_period: "2026-12-01",
    });
    expect(
      await skipMonth(IDLE, form({ templateId: TEMPLATE, period: "2026-12-06" })),
    ).toMatchObject({
      status: "error",
    });
  });

  it("shows why resuming is refused", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "cannot_resume" } });
    expect(await resumeTemplate(IDLE, form({ templateId: TEMPLATE }))).toMatchObject({
      status: "error",
      message: expect.stringMatching(/Edit it first/),
    });
  });

  it("refuses a bad template id", async () => {
    expect(await pauseTemplate(IDLE, form({ templateId: "nope" }))).toMatchObject({
      status: "error",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
