// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { handleDeleteAccount, type DeleteAccountDeps } from "./handler";

function request(init: { auth?: string; method?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.auth !== undefined) headers.authorization = init.auth;
  return new Request("http://localhost/functions/v1/delete-account", {
    method: init.method ?? "POST",
    headers,
  });
}

function deps(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const base: DeleteAccountDeps = {
    getUserId: vi.fn(async () => "user-1"),
    endMemberships: vi.fn(async () => {
      calls.push("memberships");
      return "ok" as const;
    }),
    anonymiseProfile: vi.fn(async () => void calls.push("anonymise")),
    deleteAuthUser: vi.fn(async () => void calls.push("delete")),
    log: vi.fn(),
  };
  return { deps: { ...base, ...overrides }, calls };
}

describe("handleDeleteAccount", () => {
  it("rejects anything but POST", async () => {
    const { deps: d } = deps();
    expect(
      (await handleDeleteAccount(request({ method: "GET", auth: "Bearer t" }), d)).status,
    ).toBe(405);
  });

  it.each([
    ["no Authorization header", undefined],
    ["an empty header", ""],
    ["the wrong scheme", "Basic abc"],
    ["a bearer with no token", "Bearer "],
  ])("answers 401 with %s, touching nothing", async (_label, auth) => {
    const { deps: d, calls } = deps();
    const res = await handleDeleteAccount(request({ auth }), d);

    expect(res.status).toBe(401);
    expect(d.getUserId).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("answers 401 when the token does not belong to a real session", async () => {
    const { deps: d, calls } = deps({ getUserId: vi.fn(async () => null) });
    const res = await handleDeleteAccount(request({ auth: "Bearer forged" }), d);

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("ends the flat membership, then anonymises, then deletes the sign-in", async () => {
    const { deps: d, calls } = deps();
    await handleDeleteAccount(request({ auth: "Bearer good" }), d);
    expect(d.endMemberships).toHaveBeenCalledWith("user-1");
    expect(calls).toEqual(["memberships", "anonymise", "delete"]);
  });

  it("refuses with 409 and changes nothing when the person owns a flat others still live in", async () => {
    const { deps: d, calls } = deps({
      endMemberships: vi.fn(async () => "owner_must_transfer" as const),
    });
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "owner_must_transfer" });
    expect(calls).toEqual([]);
    expect(d.anonymiseProfile).not.toHaveBeenCalled();
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("refuses with 409 and changes nothing while the person owes, is owed, or has a payment waiting", async () => {
    const { deps: d, calls } = deps({
      endMemberships: vi.fn(async () => "open_balance" as const),
    });
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "open_balance" });
    expect(calls).toEqual([]);
    expect(d.anonymiseProfile).not.toHaveBeenCalled();
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("stops without touching the profile when ending the membership fails", async () => {
    const { deps: d, calls } = deps({
      endMemberships: vi.fn(async () => {
        throw new Error("db password=hunter2");
      }),
    });
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("hunter2");
    expect(calls).toEqual([]);
  });

  it("anonymises the profile first, then deletes the sign-in", async () => {
    const { deps: d, calls } = deps();
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(d.getUserId).toHaveBeenCalledWith("good");
    expect(d.anonymiseProfile).toHaveBeenCalledWith("user-1");
    expect(d.deleteAuthUser).toHaveBeenCalledWith("user-1");
    expect(calls).toEqual(["memberships", "anonymise", "delete"]);
  });

  it("only ever acts on the person the token proves", async () => {
    const { deps: d } = deps({ getUserId: vi.fn(async () => "user-7") });
    await handleDeleteAccount(request({ auth: "Bearer good" }), d);
    expect(d.anonymiseProfile).toHaveBeenCalledWith("user-7");
    expect(d.deleteAuthUser).toHaveBeenCalledWith("user-7");
  });

  it("stops without deleting the sign-in when anonymising fails", async () => {
    const { deps: d, calls } = deps({
      anonymiseProfile: vi.fn(async () => {
        throw new Error("db password=hunter2");
      }),
    });
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(calls).toEqual(["memberships"]);
  });

  it("reports failure when the sign-in cannot be deleted, so the person can retry", async () => {
    const { deps: d, calls } = deps({
      deleteAuthUser: vi.fn(async () => {
        throw new Error("auth down");
      }),
    });
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(500);
    expect(calls).toEqual(["memberships", "anonymise"]);
  });

  it("logs that an account was deleted, without the person's identity", async () => {
    const { deps: d } = deps();
    await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(d.log).toHaveBeenCalledWith("account.deleted");
    expect(JSON.stringify((d.log as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("user-1");
  });

  it("is never cached", async () => {
    const { deps: d } = deps();
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
