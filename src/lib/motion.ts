/** Shared motion tokens. Durations are in seconds (GSAP units). */
export const duration = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  page: 0.7,
} as const;

export type DurationKey = keyof typeof duration;

export const ease = {
  /** GSAP easing names */
  out: "power3.out",
  inOut: "power2.inOut",
  /** Equivalent CSS easing for transitions */
  cssOut: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** Under reduced motion every animation collapses to an instant state change. */
export function resolveDuration(key: DurationKey, prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : duration[key];
}

export function staggerStep(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : 0.06;
}
