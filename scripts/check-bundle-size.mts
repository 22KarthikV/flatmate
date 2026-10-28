/**
 * Fails the build when JavaScript budgets are exceeded. Run after `next build`:
 *   node scripts/check-bundle-size.mts
 * Measures gzipped size of the scripts each prerendered page loads at start-up, and makes sure
 * animation code (GSAP, Lenis) is only ever loaded lazily.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

import {
  evaluateBudget,
  extractScriptSrcs,
  formatReport,
  isMotionChunk,
  type Budgets,
  type MotionChunk,
  type RouteBundle,
} from "./bundle-budget.mts";

const root = path.resolve(import.meta.dirname, "..");
const nextDir = path.join(root, ".next");
const budgets: Budgets = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "bundle-budgets.json"), "utf8"),
);

/** Pages that are not part of the shipped app (dev-only or framework internals). */
const SKIPPED = new Set(["design", "_not-found", "_global-error"]);

function walk(dir: string, filter: (file: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, filter);
    return filter(full) ? [full] : [];
  });
}

const gzipSize = (file: string) => gzipSync(readFileSync(file)).length;

function loadRoutes(): RouteBundle[] {
  const appDir = path.join(nextDir, "server", "app");
  const pages = walk(appDir, (file) => file.endsWith(".html"));

  return pages.flatMap((file) => {
    const relative = path
      .relative(appDir, file)
      .replace(/\\/g, "/")
      .replace(/\.html$/, "");
    if (SKIPPED.has(relative)) return [];
    const route = relative === "index" ? "/" : `/${relative.replace(/\/index$/, "")}`;

    const scripts = extractScriptSrcs(readFileSync(file, "utf8")).map((src) => ({
      src,
      gzipBytes: gzipSize(path.join(nextDir, src.replace(/^\/_next\//, ""))),
    }));
    return [{ route, scripts }];
  });
}

function loadMotionChunks(): MotionChunk[] {
  const chunkDir = path.join(nextDir, "static", "chunks");
  return walk(chunkDir, (file) => file.endsWith(".js"))
    .filter((file) => isMotionChunk(readFileSync(file, "utf8")))
    .map((file) => ({
      src: `/_next/${path.relative(nextDir, file).replace(/\\/g, "/")}`,
      gzipBytes: gzipSize(file),
    }));
}

const routes = loadRoutes().sort((a, b) => a.route.localeCompare(b.route));
const motionChunks = loadMotionChunks();

console.log(formatReport(routes, motionChunks, budgets));

const violations = evaluateBudget({ routes, motionChunks, budgets });
if (violations.length > 0) {
  console.error(`\nBundle budget exceeded:\n${violations.map((v) => `  - ${v}`).join("\n")}`);
  process.exit(1);
}
console.log("\nBundle budgets OK");
