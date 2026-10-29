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

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "flatmate-ten.vercel.app" }),
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

import {
  createHousehold,
  createInvite,
  joinHousehold,
  openInvite,
  removeMember,
  revokeInvite,
  setMemberRole,
} from "./actions";

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

const TOKEN = "Fk193IB2W6Z9kgq5_aJ-D94u3MxFQwtotcdhx2jj5FY";

describe("createInvite", () => {
  it("returns the full link once, built from this deployment's address", async () => {
    mocks.rpc.mockResolvedValue({ data: TOKEN, error: null });
    const result = await createInvite({ status: "idle" }, new FormData());
    expect(mocks.rpc).toHaveBeenCalledWith("create_invite");
    expect(result).toEqual({
      status: "created",
      url: `https://flatmate-ten.vercel.app/join/${TOKEN}`,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/more/flat");
  });

  it("tells a plain member only admins can invite", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not_allowed" } });
    const result = await createInvite({ status: "idle" }, new FormData());
    expect(result).toEqual({
      status: "error",
      message: "Only the owner and admins can invite people.",
    });
  });
});

describe("revokeInvite", () => {
  it("switches the link off", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await revokeInvite({ status: "idle" }, new FormData())).toEqual({ status: "idle" });
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_invite");
  });
});

describe("joinHousehold", () => {
  const withToken = (token: string) => {
    const data = new FormData();
    data.set("token", token);
    return data;
  };

  it("never calls the database for a malformed token", async () => {
    const result = await joinHousehold({ status: "idle" }, withToken("nope"));
    expect(result.status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("joins, refreshes the app and goes Home", async () => {
    mocks.rpc.mockResolvedValue({ data: "h1", error: null });
    await expect(joinHousehold({ status: "idle" }, withToken(TOKEN))).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("join_household", { p_token: TOKEN });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it.each([
    ["invalid_invite", "This invite link isn’t valid any more. Ask your flatmate for a new one."],
    ["already_in_household", "You are already in a flat. Leave it before joining another."],
    ["household_full", "This flat is full."],
  ])("explains %s", async (code, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: code } });
    expect(await joinHousehold({ status: "idle" }, withToken(TOKEN))).toEqual({
      status: "error",
      message,
    });
  });
});

describe("openInvite", () => {
  const withLink = (link: string) => {
    const data = new FormData();
    data.set("link", link);
    return data;
  };

  it("opens the join page for a pasted link", async () => {
    await expect(
      openInvite({ status: "idle" }, withLink(`https://flatmate-ten.vercel.app/join/${TOKEN}`)),
    ).rejects.toThrow(`REDIRECT:/join/${TOKEN}`);
  });

  it("refuses anything that is not an invite link", async () => {
    expect(await openInvite({ status: "idle" }, withLink("https://evil.example/x"))).toEqual({
      status: "error",
      message: "That doesn’t look like an invite link.",
    });
  });
});

describe("setMemberRole and removeMember", () => {
  const PROFILE = "11111111-2222-3333-4444-555555555555";
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it("changes a role through the database function", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setMemberRole(
      { status: "idle" },
      form({ profileId: PROFILE, role: "admin" }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("set_member_role", {
      p_profile_id: PROFILE,
      p_role: "admin",
    });
    expect(result).toEqual({ status: "idle" });
  });

  it("never sends a bad id or a role other than admin or member", async () => {
    await setMemberRole({ status: "idle" }, form({ profileId: "x", role: "admin" }));
    await setMemberRole({ status: "idle" }, form({ profileId: PROFILE, role: "owner" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("explains a refusal in plain words", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not_allowed" } });
    const result = await removeMember({ status: "idle" }, form({ profileId: PROFILE }));
    expect(result).toEqual({ status: "error", message: "You can’t do that in this flat." });
  });

  it("removes a member and refreshes the flat page", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await removeMember({ status: "idle" }, form({ profileId: PROFILE }));
    expect(mocks.rpc).toHaveBeenCalledWith("remove_member", { p_profile_id: PROFILE });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/more/flat");
  });
});
