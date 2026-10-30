import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  hasSubscription: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock("./actions", () => ({
  savePushSubscription: mocks.save,
  removePushSubscription: mocks.remove,
}));
vi.mock("./push-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push-client")>()),
  readPushEnv: mocks.readEnv,
  hasBrowserSubscription: mocks.hasSubscription,
  subscribeToPush: mocks.subscribe,
  unsubscribeFromPush: mocks.unsubscribe,
}));

import { PushCard } from "./push-card";
import { PushError, type PushEnv } from "./push-client";
import type { PushDevice } from "./push-devices";

const supported: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  ios: false,
  standalone: false,
};

const phone: PushDevice = {
  id: "5f0c1b2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f",
  label: "Chrome on Android",
  createdAt: "2026-10-20T10:00:00Z",
  failedAt: null,
};

async function mount(devices: PushDevice[] = [], publicKey: string | null = "AQID") {
  const view = render(<PushCard publicKey={publicKey} devices={devices} />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.readEnv.mockReturnValue(supported);
  mocks.hasSubscription.mockResolvedValue(false);
  localStorage.clear();
});

describe("PushCard", () => {
  it("explains an unsupported browser and offers no switch", async () => {
    mocks.readEnv.mockReturnValue({ ...supported, hasPushManager: false });
    await mount();
    expect(screen.getByText(/can’t receive push notifications/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /turn on push/i })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("explains how to install on an iPhone in Safari, with no broken switch", async () => {
    mocks.readEnv.mockReturnValue({ ...supported, ios: true, hasPushManager: false });
    await mount();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /turn on push/i })).toBeNull();
  });

  it("says when notifications are blocked", async () => {
    mocks.readEnv.mockReturnValue({ ...supported, permission: "denied" });
    await mount();
    expect(screen.getByText(/blocked for FlatMate/)).toBeInTheDocument();
  });

  it("says push is not set up when there is no public key", async () => {
    await mount([], null);
    expect(screen.getByText(/isn’t set up on this server/)).toBeInTheDocument();
  });

  it("does not ask for permission just by showing the card", async () => {
    await mount();
    expect(screen.getByRole("button", { name: "Turn on push on this device" })).toBeInTheDocument();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("subscribes after the tap, saves the device, and remembers which one it is", async () => {
    const user = userEvent.setup();
    mocks.subscribe.mockResolvedValue({
      endpoint: "https://push.example/a",
      p256dh: "k",
      auth: "a",
    });
    mocks.save.mockResolvedValue({ ok: true, id: phone.id });
    await mount();

    await user.click(screen.getByRole("button", { name: "Turn on push on this device" }));

    expect(mocks.subscribe).toHaveBeenCalledWith("AQID");
    expect(mocks.save).toHaveBeenCalledWith({
      endpoint: "https://push.example/a",
      p256dh: "k",
      auth: "a",
    });
    expect(localStorage.getItem("flatmate.push-device-id")).toBe(phone.id);
  });

  it("shows a gentle message when permission is refused, and saves nothing", async () => {
    const user = userEvent.setup();
    mocks.subscribe.mockRejectedValue(new PushError("denied", "no"));
    await mount();

    await user.click(screen.getByRole("button", { name: "Turn on push on this device" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/weren’t allowed/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("shows the server's message when saving fails", async () => {
    const user = userEvent.setup();
    mocks.subscribe.mockResolvedValue({
      endpoint: "https://push.example/a",
      p256dh: "k",
      auth: "a",
    });
    mocks.save.mockResolvedValue({ ok: false, message: "Push could not be turned on." });
    await mount();

    await user.click(screen.getByRole("button", { name: "Turn on push on this device" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Push could not be turned on.");
  });

  it("shows push as on for a device the server knows and the browser still holds", async () => {
    localStorage.setItem("flatmate.push-device-id", phone.id);
    mocks.hasSubscription.mockResolvedValue(true);
    mocks.readEnv.mockReturnValue({ ...supported, permission: "granted" });
    await mount([phone]);

    expect(screen.getByText("Push is on for this device.")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
  });

  it("turns push off here: removes the row, then the browser subscription", async () => {
    const user = userEvent.setup();
    localStorage.setItem("flatmate.push-device-id", phone.id);
    mocks.hasSubscription.mockResolvedValue(true);
    mocks.readEnv.mockReturnValue({ ...supported, permission: "granted" });
    mocks.remove.mockResolvedValue({ ok: true });
    mocks.unsubscribe.mockResolvedValue(true);
    await mount([phone]);

    await user.click(screen.getByRole("button", { name: "Turn off push on this device" }));

    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith(phone.id);
    expect(localStorage.getItem("flatmate.push-device-id")).toBeNull();
  });

  it("lists devices and removes another one without touching this browser", async () => {
    const user = userEvent.setup();
    const laptop: PushDevice = {
      ...phone,
      id: "6a0c1b2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f",
      label: "Safari on Mac",
    };
    mocks.remove.mockResolvedValue({ ok: true });
    await mount([phone, laptop]);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove Safari on Mac" }));

    expect(mocks.remove).toHaveBeenCalledWith(laptop.id);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it("mentions a device the push service cannot reach", async () => {
    await mount([{ ...phone, failedAt: "2026-10-21T10:00:00Z" }]);
    expect(screen.getByText(/not reachable at the moment/)).toBeInTheDocument();
  });
});
