import { describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "./register";

function fakeNav(register = vi.fn().mockResolvedValue({ scope: "/" })) {
  return { nav: { serviceWorker: { register } as unknown as ServiceWorkerContainer }, register };
}

describe("registerServiceWorker", () => {
  it("does nothing outside production", async () => {
    const { nav, register } = fakeNav();
    expect(await registerServiceWorker(nav, false)).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing when service workers are unsupported", async () => {
    expect(await registerServiceWorker({}, true)).toBeNull();
    expect(await registerServiceWorker(undefined, true)).toBeNull();
  });

  it("registers /sw.js with root scope in production", async () => {
    const { nav, register } = fakeNav();
    await registerServiceWorker(nav, true);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("returns null instead of throwing when registration fails", async () => {
    const { nav } = fakeNav(vi.fn().mockRejectedValue(new Error("blocked")));
    expect(await registerServiceWorker(nav, true)).toBeNull();
  });
});
