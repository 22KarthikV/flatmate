import { describe, expect, it } from "vitest";

import { duration, resolveDuration, staggerStep } from "./motion";

describe("motion tokens", () => {
  it("returns the token duration when motion is allowed", () => {
    expect(resolveDuration("base", false)).toBe(duration.base);
    expect(resolveDuration("page", false)).toBe(duration.page);
  });

  it("collapses every duration to zero under reduced motion", () => {
    for (const key of Object.keys(duration) as (keyof typeof duration)[]) {
      expect(resolveDuration(key, true)).toBe(0);
    }
  });

  it("removes stagger under reduced motion", () => {
    expect(staggerStep(false)).toBeGreaterThan(0);
    expect(staggerStep(true)).toBe(0);
  });

  it("keeps UI feedback durations within 150-400 ms and page moments within 700 ms", () => {
    expect(duration.fast).toBeGreaterThanOrEqual(0.15);
    expect(duration.slow).toBeLessThanOrEqual(0.4);
    expect(duration.page).toBeLessThanOrEqual(0.7);
  });
});
