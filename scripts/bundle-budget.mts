export interface RouteBundle {
  route: string;
  /** Initial scripts the browser must load, with gzipped size in bytes. */
  scripts: { src: string; gzipBytes: number }[];
}

export interface Budgets {
  /** Max gzipped KB of initial JavaScript, per route. */
  initialKb: Record<string, number>;
  /** Max gzipped KB for all lazily loaded motion code (GSAP, ScrollTrigger, Lenis) combined. */
  lazyMotionKb: number;
}

export interface MotionChunk {
  src: string;
  gzipBytes: number;
}

const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

/** Finds script URLs in prerendered HTML (the JavaScript a browser must fetch to start). */
export function extractScriptSrcs(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    found.add(match[1]!);
  }
  return [...found];
}

/**
 * True when a chunk holds the GSAP, ScrollTrigger or Lenis libraries themselves.
 * Markers are strings only the libraries contain: GSAP's licence banner, Lenis's root class,
 * and ScrollTrigger's `toggleActions` option. Our own code that merely names `ScrollTrigger`
 * (for example when importing it) must not count.
 */
export function isMotionChunk(source: string): boolean {
  return /GreenSock|lenis-smooth|toggleActions/.test(source);
}

/**
 * Checks bundles against budgets. Returns human-readable violations (empty means pass).
 * Motion libraries must stay out of the initial load entirely: they load lazily, after first paint.
 */
export function evaluateBudget({
  routes,
  motionChunks,
  budgets,
}: {
  routes: RouteBundle[];
  motionChunks: MotionChunk[];
  budgets: Budgets;
}): string[] {
  const violations: string[] = [];
  const motionSrcs = new Set(motionChunks.map((chunk) => chunk.src));

  for (const { route, scripts } of routes) {
    const total = scripts.reduce((sum, script) => sum + script.gzipBytes, 0);
    const limit = budgets.initialKb[route];

    if (limit === undefined) {
      violations.push(`${route}: no budget defined`);
    } else if (kb(total) > limit) {
      violations.push(`${route}: initial JS is ${kb(total)} KB gzipped, budget is ${limit} KB`);
    }

    for (const script of scripts) {
      if (motionSrcs.has(script.src)) {
        violations.push(`${route}: motion code in the initial load (${script.src})`);
      }
    }
  }

  const lazyTotal = motionChunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  if (kb(lazyTotal) > budgets.lazyMotionKb) {
    violations.push(
      `lazy motion code is ${kb(lazyTotal)} KB gzipped, budget is ${budgets.lazyMotionKb} KB`,
    );
  }

  return violations;
}

export function formatReport(
  routes: RouteBundle[],
  motionChunks: MotionChunk[],
  budgets: Budgets,
): string {
  const lines = ["Initial JS (gzipped):"];
  for (const { route, scripts } of routes) {
    const total = scripts.reduce((sum, script) => sum + script.gzipBytes, 0);
    lines.push(
      `  ${route.padEnd(12)} ${String(kb(total)).padStart(7)} KB / ${budgets.initialKb[route] ?? "?"} KB`,
    );
  }
  const lazyTotal = motionChunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  lines.push(
    `Lazy motion code: ${kb(lazyTotal)} KB / ${budgets.lazyMotionKb} KB (${motionChunks.length} chunks)`,
  );
  return lines.join("\n");
}
