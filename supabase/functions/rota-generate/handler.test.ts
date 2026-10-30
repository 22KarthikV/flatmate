// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { handleRotaGenerate, type RotaGenerateDeps } from "./handler";

const WEEK = "2026-11-08";
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

function request(init: { secret?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.secret !== undefined) headers["x-scheduler-secret"] = init.secret;
  return new Request("http://localhost/functions/v1/rota-generate", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
  });
}

const input = {
  members: [A, B],
  chores: [
    {
      id: "kitchen",
      name: "Kitchen",
      cadence: "weekly",
      preferredDow: 3,
      everyNDays: null,
      effort: 3,
    },
  ],
  availability: { [A]: { "2026-11-11": false } },
  lastDone: {},
  owed: {},
  history: [],
};

function deps(overrides: Partial<RotaGenerateDeps> = {}): RotaGenerateDeps {
  return {
    verifySecret: vi.fn().mockResolvedValue(true),
    dueGenerations: vi.fn().mockResolvedValue([{ householdId: "h1", weekStart: WEEK }]),
    loadInput: vi.fn().mockResolvedValue(input),
    store: vi.fn().mockResolvedValue("week-id"),
    pendingRebuilds: vi.fn().mockResolvedValue([]),
    loadRebuildInput: vi.fn(),
    applyRebuild: vi.fn().mockResolvedValue("applied"),
    recordRun: vi.fn().mockResolvedValue({ created: true }),
    now: () => new Date("2026-11-07T18:07:00Z"),
    ...overrides,
  };
}

describe("handleRotaGenerate", () => {
  it("refuses anything but POST", async () => {
    const response = await handleRotaGenerate(request({ method: "GET", secret: "s" }), deps());
    expect(response.status).toBe(405);
  });

  it("refuses a missing or wrong secret and does no work", async () => {
    const d = deps({ verifySecret: vi.fn().mockResolvedValue(false) });
    expect((await handleRotaGenerate(request(), d)).status).toBe(401);
    expect((await handleRotaGenerate(request({ secret: "nope" }), d)).status).toBe(401);
    expect(d.dueGenerations).not.toHaveBeenCalled();
  });

  it("does nothing when no flat is due", async () => {
    const d = deps({ dueGenerations: vi.fn().mockResolvedValue([]) });
    const response = await handleRotaGenerate(request({ secret: "s" }), d);
    expect(await response.json()).toEqual({
      ok: true,
      due: 0,
      generated: 0,
      rebuilt: 0,
      failed: 0,
    });
    expect(d.store).not.toHaveBeenCalled();
  });

  it("runs the scheduler and stores the result, never giving a chore to someone who is away", async () => {
    const d = deps();
    const response = await handleRotaGenerate(
      request({ secret: "s", body: { scheduled_at: "2026-11-07T18:07:00Z" } }),
      d,
    );
    expect(await response.json()).toEqual({
      ok: true,
      due: 1,
      generated: 1,
      rebuilt: 0,
      failed: 0,
    });

    expect(d.dueGenerations).toHaveBeenCalledWith(new Date("2026-11-07T18:07:00Z"));
    expect(d.store).toHaveBeenCalledTimes(1);
    const [household, week, assignments] = vi.mocked(d.store).mock.calls[0]!;
    expect(household).toBe("h1");
    expect(week).toBe(WEEK);
    expect(assignments).toEqual([
      expect.objectContaining({ choreId: "kitchen", assignee: B, dueOn: "2026-11-11" }),
    ]);
    expect(d.recordRun).toHaveBeenCalledWith("rota-generate", `h1:${WEEK}`);
  });

  it("keeps going when one flat fails, and says so", async () => {
    const d = deps({
      dueGenerations: vi.fn().mockResolvedValue([
        { householdId: "bad", weekStart: WEEK },
        { householdId: "good", weekStart: WEEK },
      ]),
      loadInput: vi.fn().mockImplementation(async (household: string) => {
        if (household === "bad") throw new Error("boom");
        return input;
      }),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRotaGenerate(request({ secret: "s" }), d);
    expect(response.status).toBe(207);
    expect(await response.json()).toEqual({
      ok: false,
      due: 2,
      generated: 1,
      rebuilt: 0,
      failed: 1,
    });
    expect(d.store).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("applies a pending rebuild, giving the leaver's chore to someone who stays", async () => {
    const d = deps({
      dueGenerations: vi.fn().mockResolvedValue([]),
      pendingRebuilds: vi.fn().mockResolvedValue(["rb1"]),
      loadRebuildInput: vi.fn().mockResolvedValue({
        leaver: A,
        leaverName: "Alex",
        remaining: [B],
        tasks: [
          {
            id: "t1",
            choreId: "kitchen",
            choreName: "Kitchen",
            effort: 3,
            dueOn: "2026-11-11",
            assignee: A,
            started: false,
            locked: false,
          },
        ],
        availability: {},
        lastDone: {},
        history: [],
      }),
    });
    const response = await handleRotaGenerate(request({ secret: "s" }), d);
    expect(await response.json()).toEqual({
      ok: true,
      due: 0,
      generated: 0,
      rebuilt: 1,
      failed: 0,
    });
    expect(d.applyRebuild).toHaveBeenCalledWith("rb1", [
      expect.objectContaining({ taskId: "t1", to: B, reason: "leaver" }),
    ]);
  });

  it("leaves a rebuild pending when applying it fails, and carries on with the next", async () => {
    const d = deps({
      dueGenerations: vi.fn().mockResolvedValue([]),
      pendingRebuilds: vi.fn().mockResolvedValue(["bad", "good"]),
      loadRebuildInput: vi.fn().mockResolvedValue({ leaver: A, remaining: [B], tasks: [] }),
      applyRebuild: vi.fn().mockImplementation(async (id: string) => {
        if (id === "bad") throw new Error("stale_move");
        return "applied";
      }),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRotaGenerate(request({ secret: "s" }), d);
    expect(response.status).toBe(207);
    expect(await response.json()).toEqual({
      ok: false,
      due: 0,
      generated: 0,
      rebuilt: 1,
      failed: 1,
    });
    error.mockRestore();
  });

  it("answers 500 without leaking details when the database is unreachable", async () => {
    const d = deps({ dueGenerations: vi.fn().mockRejectedValue(new Error("secret detail")) });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRotaGenerate(request({ secret: "s" }), d);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret detail");
    error.mockRestore();
  });
});
