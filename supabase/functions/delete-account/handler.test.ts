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

  it("anonymises the profile first, then deletes the sign-in", async () => {
    const { deps: d, calls } = deps();
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(d.getUserId).toHaveBeenCalledWith("good");
    expect(d.anonymiseProfile).toHaveBeenCalledWith("user-1");
    expect(d.deleteAuthUser).toHaveBeenCalledWith("user-1");
    expect(calls).toEqual(["anonymise", "delete"]);
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
    expect(calls).toEqual([]);
  });

  it("reports failure when the sign-in cannot be deleted, so the person can retry", async () => {
    const { deps: d, calls } = deps({
      deleteAuthUser: vi.fn(async () => {
        throw new Error("auth down");
      }),
    });
    const res = await handleDeleteAccount(request({ auth: "Bearer good" }), d);

    expect(res.status).toBe(500);
    expect(calls).toEqual(["anonymise"]);
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
