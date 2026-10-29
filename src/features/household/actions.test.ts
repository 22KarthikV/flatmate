// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getClaims: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  }),
}));

import { createHousehold } from "./actions";

const form = (name: string) => {
  const data = new FormData();
  data.set("name", name);
  return data;
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u1" } } });
  mocks.revalidatePath.mockReset();
});

describe("createHousehold", () => {
  it("refuses a bad name without calling the database", async () => {
    const result = await createHousehold({ status: "idle" }, form("   "));
    expect(result).toEqual({ status: "error", message: "Enter a name for your flat." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null });
    await expect(createHousehold({ status: "idle" }, form("Flat 12"))).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fdashboard",
    );
  });

  it("creates the flat with the cleaned name and refreshes the app", async () => {
    mocks.rpc.mockResolvedValue({ data: "h1", error: null });
    const result = await createHousehold({ status: "idle" }, form("  Flat   12 "));

    expect(mocks.rpc).toHaveBeenCalledWith("create_household", { p_name: "Flat 12" });
    expect(result).toEqual({ status: "created" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("explains when the person already has a flat", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "already_in_household" },
    });
    const result = await createHousehold({ status: "idle" }, form("Second"));
    expect(result).toEqual({ status: "error", message: "You are already in a flat." });
  });

  it("shows one neutral message for anything else", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "internal detail" },
    });
    const result = await createHousehold({ status: "idle" }, form("Flat"));
    expect(result).toEqual({
      status: "error",
      message: "We couldn’t create your flat. Please try again.",
    });
  });
});
