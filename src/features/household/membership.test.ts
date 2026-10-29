// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/identity/session-claims", () => ({ getRequestSession: mocks.getSession }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { getMembership } from "./membership";

function fakeSupabase() {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = mocks.query;
  return { from: vi.fn(() => chain), chain };
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.query.mockReset();
});

describe("getMembership", () => {
  it("is null for a visitor with no session", async () => {
    mocks.getSession.mockResolvedValue({ supabase: fakeSupabase(), claims: null });
    expect(await getMembership()).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("is null for a signed-in person with no flat", async () => {
    mocks.getSession.mockResolvedValue({ supabase: fakeSupabase(), claims: { sub: "u1" } });
    mocks.query.mockResolvedValue({ data: null, error: null });
    expect(await getMembership()).toBeNull();
  });

  it("is null when the flat is closed (the join returns no household)", async () => {
    mocks.getSession.mockResolvedValue({ supabase: fakeSupabase(), claims: { sub: "u1" } });
    mocks.query.mockResolvedValue({ data: { role: "owner", household: null }, error: null });
    expect(await getMembership()).toBeNull();
  });

  it("returns the flat and role for a member", async () => {
    const supabase = fakeSupabase();
    mocks.getSession.mockResolvedValue({ supabase, claims: { sub: "u1" } });
    mocks.query.mockResolvedValue({
      data: { role: "admin", household: { id: "h1", name: "Flat 12" }, profile: { id: "p1" } },
      error: null,
    });

    expect(await getMembership()).toEqual({
      householdId: "h1",
      householdName: "Flat 12",
      role: "admin",
      profileId: "p1",
    });
    expect(supabase.from).toHaveBeenCalledWith("memberships");
    expect(supabase.chain.eq).toHaveBeenCalledWith("profile.user_id", "u1");
    expect(supabase.chain.is).toHaveBeenCalledWith("left_at", null);
  });

  it("treats a database error as no flat rather than guessing", async () => {
    mocks.getSession.mockResolvedValue({ supabase: fakeSupabase(), claims: { sub: "u1" } });
    mocks.query.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getMembership()).toBeNull();
  });
});
