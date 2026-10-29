import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  removeChannel: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
  channel: vi.fn(),
  setAuth: vi.fn(),
  getSession: vi.fn(),
  handler: undefined as undefined | (() => void),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    auth: { getSession: mocks.getSession },
    realtime: { setAuth: mocks.setAuth },
  }),
}));

import { LiveInbox } from "./live-inbox";

/** Renders, then lets the start-up (fetch the session, subscribe) finish. */
async function mount() {
  const view = render(<LiveInbox />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of [mocks.refresh, mocks.removeChannel, mocks.setAuth]) fn.mockReset();
  mocks.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: { access_token: "user-token" } } });
  const chain = { on: mocks.on, subscribe: mocks.subscribe };
  mocks.channel.mockReset().mockReturnValue(chain);
  mocks.on.mockReset().mockImplementation((_type, _filter, handler: () => void) => {
    mocks.handler = handler;
    return chain;
  });
  mocks.subscribe.mockReset().mockReturnValue(chain);
});

afterEach(() => vi.useRealTimers());

describe("LiveInbox", () => {
  it("gives Realtime the signed-in session before listening to notifications", async () => {
    await mount();

    expect(mocks.setAuth).toHaveBeenCalledWith("user-token");
    expect(mocks.setAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.subscribe.mock.invocationCallOrder[0],
    );
    expect(mocks.channel).toHaveBeenCalledWith("inbox");
    expect(mocks.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      expect.any(Function),
    );
  });

  it("does not pass a token it does not have", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await mount();
    expect(mocks.setAuth).not.toHaveBeenCalled();
  });

  it("refreshes once, shortly after a burst of notifications", async () => {
    await mount();

    act(() => {
      mocks.handler?.();
      mocks.handler?.();
      mocks.handler?.();
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(400));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("refreshes when the person comes back to the tab", async () => {
    await mount();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(400);
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("checks in on a slow timer as a backstop", async () => {
    await mount();
    act(() => void vi.advanceTimersByTime(60_000 + 400));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("stops listening and cancels pending work when it goes away", async () => {
    const { unmount } = await mount();
    act(() => mocks.handler?.());
    unmount();

    expect(mocks.removeChannel).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(120_000));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("never subscribes if it goes away before the session arrives", async () => {
    const { unmount } = render(<LiveInbox />);
    unmount();
    await act(async () => {});

    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });
});
