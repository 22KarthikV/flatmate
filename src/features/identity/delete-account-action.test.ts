// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  fetch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({ url: "http://127.0.0.1:54321", publishableKey: "pk" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getSession: mocks.getSession, signOut: mocks.signOut },
  }),
}));

import { deleteAccount } from "./actions";

const confirmed = () => {
  const data = new FormData();
  data.set("confirmation", "DELETE");
  return data;
};

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "t" } } });
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("deleteAccount", () => {
  it("needs the typed confirmation", async () => {
    const data = new FormData();
    data.set("confirmation", "nope");
    const result = await deleteAccount({ status: "idle" }, data);
    expect(result.status).toBe("error");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("tells an owner of a busy flat to hand it over first, and signs nobody out", async () => {
    mocks.fetch.mockResolvedValue(new Response('{"ok":false}', { status: 409 }));
    const result = await deleteAccount({ status: "idle" }, confirmed());

    expect(result).toMatchObject({ status: "error" });
    expect((result as { message: string }).message).toContain("Hand it over to someone else first");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("tells someone with money open to settle up first, and signs nobody out", async () => {
    mocks.fetch.mockResolvedValue(
      new Response('{"ok":false,"error":"open_balance"}', { status: 409 }),
    );
    const result = await deleteAccount({ status: "idle" }, confirmed());

    expect(result).toMatchObject({ status: "error" });
    expect((result as { message: string }).message).toContain("Settle up first");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs out and goes to the goodbye page when the account is gone", async () => {
    mocks.fetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await expect(deleteAccount({ status: "idle" }, confirmed())).rejects.toThrow(
      "REDIRECT:/sign-in?deleted=1",
    );
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("keeps the generic message for any other failure", async () => {
    mocks.fetch.mockResolvedValue(new Response("{}", { status: 500 }));
    const result = await deleteAccount({ status: "idle" }, confirmed());
    expect((result as { message: string }).message).toContain("Nothing has been lost");
  });
});
