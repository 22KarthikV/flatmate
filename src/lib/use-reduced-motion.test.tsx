import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useReducedMotion } from "./use-reduced-motion";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    set(next: boolean) {
      media.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useReducedMotion", () => {
  it("is false when the user has no preference", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("is true when the user prefers reduced motion", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates when the preference changes", () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());

    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
