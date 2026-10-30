/**
 * A small seeded random number generator (mulberry32) so the property tests are repeatable:
 * the same seed always walks through the same cases, and a failure can be reproduced.
 * Used only by tests.
 */
export function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
