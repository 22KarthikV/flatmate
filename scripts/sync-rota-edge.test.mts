// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SHARED_FILES, edgePath, sourcePath, toEdgeSource } from "./sync-rota-edge.mts";

describe("the Edge Function's copy of the rota scheduler", () => {
  it("adds .ts to relative imports and nothing else", () => {
    const out = toEdgeSource(
      'import { a } from "./week";\nimport type { B } from "./fairness";\nimport z from "zod";\n',
    );
    expect(out).toContain('from "./week.ts"');
    expect(out).toContain('from "./fairness.ts"');
    expect(out).toContain('from "zod"');
  });

  it.each(SHARED_FILES)("%s is up to date (run: node scripts/sync-rota-edge.mts)", (name) => {
    const root = process.cwd();
    expect(readFileSync(edgePath(root, name), "utf8")).toBe(
      toEdgeSource(readFileSync(sourcePath(root, name), "utf8")),
    );
  });

  it("imports nothing but other shared files", () => {
    const root = process.cwd();
    for (const name of SHARED_FILES) {
      const source = readFileSync(sourcePath(root, name), "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        expect(match[1], `${name} imports ${match[1]}`).toMatch(
          /^\.\/(week|explain|fairness|schedule|generation)$/,
        );
      }
    }
  });
});
